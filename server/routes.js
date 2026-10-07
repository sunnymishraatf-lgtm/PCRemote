'use strict';
/**
 * routes.js — HTTP API. All /api/* routes except /api/status and the two
 * auth endpoints require a valid session token (Authorization: Bearer ...,
 * or ?token= on GET for <img>/<video> tags that cannot set headers).
 *
 * Errors: {ok:false, error:{code, message}} with an appropriate status.
 */
const { makeFiles } = require('./lib/files');
const remote = require('./lib/remote');
const screen = require('./lib/screen');
const audit = require('./lib/audit');
const { capabilities } = require('./ws');
const { validName } = require('./lib/paths');

const VERSION = '1.0.0';

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function fail(res, e) {
  const status = e.status || (e.code === 'EBADPATH' ? 400 : 500);
  if (status >= 500 && e.code !== 'EUNSUPPORTED') console.error('[api]', e);
  json(res, status, { ok: false, error: { code: e.code || 'EINTERNAL', message: e.message || 'Internal error' } });
}

function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { reject(Object.assign(new Error('Request body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

function isLoopback(req) {
  const ip = clientIp(req);
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function bearerToken(req, url) {
  const h = req.headers.authorization || '';
  const m = /^Bearer (.+)$/.exec(h);
  if (m) return m[1];
  // Query fallback for GET (img/video tags). Documented tradeoff in README.
  if (req.method === 'GET' && url) {
    const t = url.searchParams.get('token');
    if (t) return t;
  }
  return null;
}

function makeRoutes(ctx) {
  const { auth, cfg, saveConfig } = ctx;
  const files = makeFiles(() => cfg.sharedFolders, audit);

  function requireAuth(req, res, url) {
    const s = auth.verify(bearerToken(req, url));
    if (!s) { json(res, 401, { ok: false, error: { code: 'EAUTH', message: 'Invalid or expired session. Please reconnect.' } }); return null; }
    return s;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const q = (k, d = '') => url.searchParams.get(k) ?? d;

    try {
      // ---------- public ----------
      if (p === '/api/status' && req.method === 'GET') {
        return json(res, 200, {
          ok: true, name: 'PC Remote', version: VERSION, protocolVersion: 1,
          pcName: require('os').hostname(), capabilities: capabilities(),
        });
      }
      if (p === '/api/auth' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const ip = clientIp(req);
        try {
          const s = auth.authWithPin(body.pin, body.deviceName, ip);
          return json(res, 200, { ok: true, token: s.token, expiresAt: s.expiresAt, deviceId: s.id });
        } catch (e) {
          const status = e.code === 'ELOCKED' ? 429 : 401;
          return json(res, status, { ok: false, error: { code: e.code, message: e.message } });
        }
      }
      if (p === '/api/auth/pair' && req.method === 'POST') {
        const body = await readJsonBody(req);
        try {
          const s = auth.authWithPairing(body.pairToken, body.deviceName, clientIp(req));
          return json(res, 200, { ok: true, token: s.token, expiresAt: s.expiresAt, deviceId: s.id });
        } catch (e) {
          return json(res, 401, { ok: false, error: { code: e.code, message: e.message } });
        }
      }
      // PC owner's own browser: show PIN + QR without auth (loopback only).
      if (p === '/api/local-info' && req.method === 'GET') {
        if (!isLoopback(req)) return json(res, 403, { ok: false, error: { code: 'EFORBIDDEN', message: 'Local only' } });
        const { primaryAddress } = require('./lib/net');
        const ip = primaryAddress();
        const pairToken = auth.newPairingToken();
        const connectUrl = ip ? `http://${ip}:${cfg.port}/connect?token=${pairToken}` : null;
        let qrDataUrl = null;
        if (connectUrl) {
          try { qrDataUrl = await require('qrcode').toDataURL(connectUrl, { width: 360, margin: 1 }); }
          catch { /* QR optional */ }
        }
        return json(res, 200, {
          ok: true, local: true, pin: auth.getPin(),
          connectUrl, qrDataUrl, address: ip ? `http://${ip}:${cfg.port}` : null,
        });
      }
      if (p === '/connect' && req.method === 'GET') {
        const t = url.searchParams.get('token');
        res.writeHead(302, { Location: '/#' + (t ? '/pair/' + encodeURIComponent(t) : '/login') });
        return res.end();
      }

      // ---------- authed ----------
      const session = requireAuth(req, res, url);
      if (!session) return;
      const dev = session.deviceName;

      if (p === '/api/capabilities' && req.method === 'GET') {
        return json(res, 200, { ok: true, capabilities: capabilities() });
      }
      if (p === '/api/shares' && req.method === 'GET') {
        return json(res, 200, { ok: true, shares: cfg.sharedFolders.map(publicShare) });
      }

      // files
      if (p === '/api/files' && req.method === 'GET') {
        const r = files.list(q('share'), q('path'));
        return json(res, 200, { ok: true, ...r });
      }
      if (p === '/api/files/info' && req.method === 'GET') {
        return json(res, 200, { ok: true, file: files.info(q('share'), q('path')) });
      }
      if ((p === '/api/files/download' || p === '/api/files/stream') && req.method === 'GET') {
        const { stream, headers, status } = files.streamFile(
          q('share'), q('path'), req.headers.range,
          p.endsWith('/stream') ? 'inline' : 'attachment');
        res.writeHead(status, headers);
        stream.on('error', () => { try { res.destroy(); } catch {} });
        return stream.pipe(res);
      }
      if (p === '/api/files/zip' && req.method === 'GET') {
        const { stream, filename } = files.zipFolder(q('share'), q('path'));
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        });
        stream.on('error', () => { try { res.destroy(); } catch {} });
        return stream.pipe(res);
      }
      if (p === '/api/files/upload' && req.method === 'PUT') {
        const r = await files.upload(q('share'), q('dir'), q('name'), req, { overwrite: q('overwrite') === '1' });
        return json(res, 200, { ok: true, file: r });
      }
      if (p === '/api/files/mkdir' && req.method === 'POST') {
        const body = await readJsonBody(req);
        return json(res, 200, { ok: true, folder: files.mkdir(body.share, body.dir || '', body.name) });
      }
      if (p === '/api/files/rename' && req.method === 'POST') {
        const body = await readJsonBody(req);
        return json(res, 200, { ok: true, file: files.rename(body.share, body.path, body.newName) });
      }
      if (p === '/api/files' && req.method === 'DELETE') {
        const r = files.remove(q('share'), q('path'));
        return json(res, 200, { ok: true, ...r });
      }
      if (p === '/api/files/search' && req.method === 'GET') {
        const r = files.search(q('share'), q('q'), q('in'));
        return json(res, 200, { ok: true, ...r });
      }
      if (p === '/api/storage' && req.method === 'GET') {
        const r = await files.storage();
        return json(res, 200, { ok: true, ...r });
      }

      // remote control (HTTP fallback; WS preferred)
      if (p === '/api/control/mouse' && req.method === 'POST') {
        const b = await readJsonBody(req);
        await mouseAction(b);
        audit.log('remote', `mouse: ${b.action || '?'}`, dev);
        return json(res, 200, { ok: true });
      }
      if (p === '/api/control/keyboard' && req.method === 'POST') {
        const b = await readJsonBody(req);
        await keyboardAction(b);
        audit.log('remote', `keyboard: ${b.action || '?'}`, dev);
        return json(res, 200, { ok: true });
      }
      if (p === '/api/screen/shot' && req.method === 'GET') {
        const buf = await screen.capture(parseInt(q('quality', '60'), 10) || 60);
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
        return res.end(buf);
      }

      // devices & security
      if (p === '/api/devices' && req.method === 'GET') {
        return json(res, 200, { ok: true, devices: auth.deviceList(), selfId: session.id });
      }
      if (p === '/api/devices/disconnect-all' && req.method === 'POST') {
        const n = auth.disconnectAll();
        return json(res, 200, { ok: true, disconnected: n });
      }
      {
        const m = /^\/api\/devices\/([^/]+)\/revoke$/.exec(p);
        if (m && req.method === 'POST') {
          const okRev = auth.revoke(decodeURIComponent(m[1]));
          return json(res, okRev ? 200 : 404, okRev ? { ok: true } : { ok: false, error: { code: 'ENOTFOUND', message: 'Device not found' } });
        }
      }
      if (p === '/api/security/regenerate-pin' && req.method === 'POST') {
        const newPin = auth.regeneratePin();
        // This session was just killed too — tell the caller the new PIN to display.
        return json(res, 200, { ok: true, pin: newPin, note: 'All sessions revoked. Reconnect with the new PIN.' });
      }
      if (p === '/api/audit' && req.method === 'GET') {
        return json(res, 200, { ok: true, entries: audit.list() });
      }

      // settings
      if (p === '/api/settings' && req.method === 'GET') {
        return json(res, 200, {
          ok: true,
          settings: {
            shares: cfg.sharedFolders.map(publicShare),
            port: cfg.port, sessionHours: cfg.sessionHours,
          },
        });
      }
      if (p === '/api/settings' && req.method === 'PUT') {
        const body = await readJsonBody(req);
        if (!Array.isArray(body.shares)) throw Object.assign(new Error('shares must be an array'), { status: 400 });
        const fs_ = require('fs');
        const next = [];
        for (const s of body.shares) {
          if (!s || typeof s.path !== 'string' || typeof s.name !== 'string') {
            throw Object.assign(new Error('Each share needs a name and path'), { status: 400 });
          }
          let st;
          try { st = fs_.statSync(s.path); } catch { throw Object.assign(new Error(`Folder not found: ${s.path}`), { status: 400 }); }
          if (!st.isDirectory()) throw Object.assign(new Error(`Not a folder: ${s.path}`), { status: 400 });
          if (!validName(s.name)) throw Object.assign(new Error(`Invalid share name: ${s.name}`), { status: 400 });
          next.push({
            id: typeof s.id === 'string' && s.id ? s.id : 'share_' + Date.now() + Math.floor(Math.random() * 1000),
            name: s.name.trim(),
            path: require('path').resolve(s.path),
            perms: {
              read: s.perms?.read !== false, // read defaults to true unless explicitly disabled
              upload: !!s.perms?.upload,
              del: !!s.perms?.del,
            },
          });
        }
        cfg.sharedFolders = next;
        saveConfig();
        audit.log('settings', `shared folders updated (${next.length})`, dev);
        return json(res, 200, { ok: true, shares: next.map(publicShare) });
      }

      return json(res, 404, { ok: false, error: { code: 'ENOTFOUND', message: 'Unknown API endpoint' } });
    } catch (e) {
      if (e && e.rangeUnsatisfiable) {
        res.writeHead(416, { 'Content-Range': 'bytes */*' });
        return res.end();
      }
      return fail(res, e);
    }
  }

  async function mouseAction(b) {
    switch (b.action) {
      case 'move': return remote.mouseMoveRel(Number(b.dx) || 0, Number(b.dy) || 0);
      case 'abs': return remote.mouseMoveAbs(Number(b.nx) || 0, Number(b.ny) || 0);
      case 'click': return remote.mouseClick(b.button || 'left');
      case 'dblclick': return remote.mouseDoubleClick();
      case 'down': return remote.mouseDown(b.button || 'left');
      case 'up': return remote.mouseUp(b.button || 'left');
      case 'scroll': return remote.scroll(Number(b.dx) || 0, Number(b.dy) || 0);
      default: throw Object.assign(new Error('Unknown mouse action'), { status: 400, code: 'EBADACTION' });
    }
  }

  async function keyboardAction(b) {
    switch (b.action) {
      case 'key': return remote.keyAction(b.key, b.mode || 'press');
      case 'type': return remote.typeText(String(b.text || '').slice(0, 2000));
      case 'shortcut': return remote.shortcut(b.keys);
      default: throw Object.assign(new Error('Unknown keyboard action'), { status: 400, code: 'EBADACTION' });
    }
  }

  function publicShare(s) {
    return { id: s.id, name: s.name, perms: s.perms };
  }

  return { handle };
}

module.exports = { makeRoutes };
