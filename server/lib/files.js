'use strict';
/**
 * files.js — all filesystem operations behind the API.
 * Every path goes through paths.resolveInShare(). Streaming everywhere:
 * downloads/uploads/ZIPs never buffer whole files in RAM.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { resolveInShare, validName } = require('./paths');

const SEARCH_MAX_DEPTH = 6;
const SEARCH_MAX_RESULTS = 200;

function err(code, message, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

function entry(abs, name, shareRel) {
  const st = fs.statSync(abs);
  return {
    name,
    path: shareRel,                       // path relative to the share root, '/'-separated
    isDir: st.isDirectory(),
    size: st.isDirectory() ? 0 : st.size,
    mtime: st.mtimeMs,
  };
}

function toRel(abs, root) {
  return path.relative(root, abs).split(path.sep).join('/');
}

function makeFiles(getShares, audit) {
  function getShare(id) {
    const s = getShares().find((x) => x.id === id);
    if (!s) throw err('ENOSHARE', 'Unknown shared folder', 404);
    return s;
  }

  function needPerm(share, perm) {
    if (!share.perms[perm]) throw err('EFORBIDDEN', `This folder does not allow this action (${perm})`, 403);
  }

  // ---- list ----
  function list(shareId, rel) {
    const share = getShare(shareId);
    needPerm(share, 'read');
    const abs = resolveInShare(share.path, rel || '');
    let st;
    try { st = fs.statSync(abs); } catch { throw err('ENOTFOUND', 'Folder not found', 404); }
    if (!st.isDirectory()) throw err('ENOTDIR', 'Not a folder', 400);
    const names = fs.readdirSync(abs);
    const items = [];
    for (const name of names) {
      try {
        items.push(entry(path.join(abs, name), name, toRel(path.join(abs, name), share.path)));
      } catch { /* skip unreadable entries */ }
    }
    items.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
    return { share: { id: share.id, name: share.name, perms: share.perms }, path: rel || '', items };
  }

  // ---- info ----
  function info(shareId, rel) {
    const share = getShare(shareId);
    needPerm(share, 'read');
    const abs = resolveInShare(share.path, rel);
    let st;
    try { st = fs.statSync(abs); } catch { throw err('ENOTFOUND', 'Not found', 404); }
    const e = entry(abs, path.basename(abs), toRel(abs, share.path));
    e.atime = st.atimeMs;
    e.ctime = st.ctimeMs;
    e.ext = path.extname(abs).toLowerCase();
    return e;
  }

  // ---- resolve a file for download/stream ----
  function resolveFile(shareId, rel) {
    const share = getShare(shareId);
    needPerm(share, 'read');
    const abs = resolveInShare(share.path, rel);
    let st;
    try { st = fs.statSync(abs); } catch { throw err('ENOTFOUND', 'File not found', 404); }
    if (!st.isDirectory()) return { abs, st, share };
    throw err('EISDIR', 'Use ZIP download for folders', 400);
  }

  // ---- range parsing ----
  function parseRange(rangeHeader, size) {
    if (!rangeHeader) return null;
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!m) return null;
    let start = m[1] === '' ? null : parseInt(m[1], 10);
    let end = m[2] === '' ? null : parseInt(m[2], 10);
    if (start === null && end === null) return null;
    if (start === null) { start = size - end; end = size - 1; }      // suffix range
    if (end === null || end >= size) end = size - 1;
    if (start >= size || start > end || start < 0) return { unsatisfiable: true };
    return { start, end };
  }

  // ---- create a read stream + headers for download or inline stream ----
  function streamFile(shareId, rel, rangeHeader, disposition) {
    const { abs, st, share } = resolveFile(shareId, rel);
    const size = st.size;
    const range = parseRange(rangeHeader, size);
    if (range && range.unsatisfiable) {
      const e = err('ERANGE', 'Requested range not satisfiable', 416);
      e.rangeUnsatisfiable = true;
      throw e;
    }
    const start = range ? range.start : 0;
    const end = range ? range.end : size - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(abs, { start, end });
    const name = path.basename(abs);
    const headers = {
      'Content-Type': mimeFor(name),
      'Content-Length': chunkSize,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
    };
    if (range) {
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    audit.log('file', `downloaded: ${share.name}/${toRel(abs, share.path)}`);
    return { stream, headers, status: range ? 206 : 200 };
  }

  // ---- ZIP a folder (streamed) ----
  function zipFolder(shareId, rel) {
    const share = getShare(shareId);
    needPerm(share, 'read');
    const abs = resolveInShare(share.path, rel);
    let st;
    try { st = fs.statSync(abs); } catch { throw err('ENOTFOUND', 'Folder not found', 404); }
    if (!st.isDirectory()) throw err('ENOTDIR', 'Not a folder', 400);
    let archiver;
    try {
      archiver = require('archiver');
    } catch {
      throw err('ENODEP', 'ZIP support not installed on this PC', 501);
    }
    const archive = archiver('zip', { zlib: { level: 1 } }); // level 1: fast, LAN-friendly
    archive.on('warning', () => {});
    archive.on('error', () => {});
    const folderName = path.basename(abs);
    archive.directory(abs, folderName);
    archive.finalize();
    audit.log('file', `downloaded ZIP: ${share.name}/${toRel(abs, share.path)}`);
    return { stream: archive, filename: folderName + '.zip' };
  }

  // ---- upload (raw streaming PUT body) ----
  function upload(shareId, dirRel, fileName, req, opts = {}) {
    const share = getShare(shareId);
    needPerm(share, 'upload');
    const dirAbs = resolveInShare(share.path, dirRel || '');
    let st;
    try { st = fs.statSync(dirAbs); } catch { throw err('ENOTFOUND', 'Target folder not found', 404); }
    if (!st.isDirectory()) throw err('ENOTDIR', 'Target is not a folder', 400);
    if (!validName(fileName)) throw err('EBADNAME', 'Invalid file name', 400);

    let target = path.join(dirAbs, fileName);
    if (!opts.overwrite && fs.existsSync(target)) {
      target = uniqueName(dirAbs, fileName);
    }
    return new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(target, { flags: 'w' });
      let bytes = 0;
      req.on('data', (c) => { bytes += c.length; });
      req.on('error', (e) => { ws.destroy(); safeUnlink(target); reject(e); });
      ws.on('error', (e) => { safeUnlink(target); reject(e); });
      ws.on('finish', () => {
        audit.log('file', `uploaded: ${share.name}/${toRel(target, share.path)} (${fmtBytes(bytes)})`);
        resolve({ name: path.basename(target), path: toRel(target, share.path), size: bytes });
      });
      req.pipe(ws);
    });
  }

  function uniqueName(dirAbs, fileName) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let i = 1, candidate;
    do {
      candidate = path.join(dirAbs, `${base} (${i})${ext}`);
      i++;
    } while (fs.existsSync(candidate) && i < 10000);
    return candidate;
  }

  function safeUnlink(p) { try { fs.unlinkSync(p); } catch {} }

  // ---- mkdir ----
  function mkdir(shareId, dirRel, name) {
    const share = getShare(shareId);
    needPerm(share, 'upload');
    if (!validName(name)) throw err('EBADNAME', 'Invalid folder name', 400);
    const dirAbs = resolveInShare(share.path, dirRel || '');
    const target = path.join(dirAbs, name.trim());
    // Re-validate the joined path stays inside the share.
    resolveInShare(share.path, toRel(target, share.path));
    if (fs.existsSync(target)) throw err('EEXISTS', 'A file or folder with this name already exists', 409);
    fs.mkdirSync(target, { recursive: false });
    audit.log('file', `created folder: ${share.name}/${toRel(target, share.path)}`);
    return { name: name.trim(), path: toRel(target, share.path) };
  }

  // ---- rename ----
  function rename(shareId, rel, newName) {
    const share = getShare(shareId);
    needPerm(share, 'upload');
    if (!validName(newName)) throw err('EBADNAME', 'Invalid name', 400);
    const abs = resolveInShare(share.path, rel);
    if (!fs.existsSync(abs)) throw err('ENOTFOUND', 'Not found', 404);
    const target = path.join(path.dirname(abs), newName.trim());
    resolveInShare(share.path, toRel(target, share.path));
    if (fs.existsSync(target)) throw err('EEXISTS', 'A file or folder with this name already exists', 409);
    fs.renameSync(abs, target);
    audit.log('file', `renamed: ${share.name}/${toRel(abs, share.path)} -> ${newName.trim()}`);
    return { name: newName.trim(), path: toRel(target, share.path) };
  }

  // ---- delete ----
  function remove(shareId, rel) {
    const share = getShare(shareId);
    needPerm(share, 'del');
    const abs = resolveInShare(share.path, rel);
    if (path.resolve(abs) === path.resolve(share.path)) {
      throw err('EFORBIDDEN', 'Cannot delete a shared folder itself', 403);
    }
    let st;
    try { st = fs.statSync(abs); } catch { throw err('ENOTFOUND', 'Not found', 404); }
    fs.rmSync(abs, { recursive: st.isDirectory(), force: true });
    audit.log('file', `deleted: ${share.name}/${toRel(abs, share.path)}`);
    return { ok: true };
  }

  // ---- search (bounded) ----
  function search(shareId, query, rel) {
    const share = getShare(shareId);
    needPerm(share, 'read');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { items: [] };
    const startAbs = resolveInShare(share.path, rel || '');
    const matcher = globToMatcher(q);
    const results = [];
    walk(startAbs, 0);
    return { items: results };

    function walk(dir, depth) {
      if (depth > SEARCH_MAX_DEPTH || results.length >= SEARCH_MAX_RESULTS) return;
      let names;
      try { names = fs.readdirSync(dir, { withFileTypes: true }); }
      catch { return; }
      for (const d of names) {
        if (results.length >= SEARCH_MAX_RESULTS) return;
        const abs = path.join(dir, d.name);
        if (matcher(d.name.toLowerCase())) {
          try {
            results.push(entry(abs, d.name, toRel(abs, share.path)));
          } catch { /* skip */ }
        }
        if (d.isDirectory() && depth < SEARCH_MAX_DEPTH) walk(abs, depth + 1);
      }
    }
  }

  function globToMatcher(q) {
    if (!q.includes('*') && !q.includes('?')) {
      return (name) => name.includes(q);
    }
    const re = new RegExp('^' + q.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return (name) => re.test(name);
  }

  // ---- storage info (best effort, platform-specific) ----
  function storage() {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        execFile('wmic', ['logicaldisk', 'get', 'DeviceID,Size,FreeSpace', '/format:value'],
          { timeout: 8000 }, (err, stdout) => {
            if (err) return resolve({ drives: [] });
            const drives = [];
            let cur = {};
            for (const line of stdout.split(/\r?\n/)) {
              const m = /^(\w+)=(.*)$/.exec(line.trim());
              if (!m) continue;
              cur[m[1]] = m[2];
              if (m[1] === 'FreeSpace' && cur.DeviceID) {
                const size = parseInt(cur.Size, 10) || 0;
                const free = parseInt(cur.FreeSpace, 10) || 0;
                if (size > 0) drives.push({ name: cur.DeviceID, total: size, free, used: size - free });
                cur = {};
              }
            }
            resolve({ drives });
          });
      } else {
        execFile('df', ['-k', '--output=target,size,avail'], { timeout: 8000 }, (err, stdout) => {
          if (err) return resolve({ drives: [] });
          const drives = [];
          for (const line of stdout.split('\n').slice(1)) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3) continue;
            const total = parseInt(parts[1], 10) * 1024;
            const free = parseInt(parts[2], 10) * 1024;
            if (total > 0) drives.push({ name: parts[0], total, free, used: total - free });
          }
          resolve({ drives });
        });
      }
    });
  }

  return { list, info, streamFile, zipFolder, upload, mkdir, rename, remove, search, storage, getShare };
}

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.heic': 'image/heic',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
  '.html': 'text/html', '.csv': 'text/csv',
};

function mimeFor(name) {
  const ext = path.extname(name).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1, v = n;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return v.toFixed(1) + ' ' + u[i];
}

module.exports = { makeFiles, mimeFor, fmtBytes };
