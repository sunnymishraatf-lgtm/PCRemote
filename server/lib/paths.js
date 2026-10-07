'use strict';
/**
 * paths.js — path validation. The single choke point for every filesystem
 * access. Rejects directory traversal, absolute paths, drive letters,
 * UNC paths and null bytes, then confines the result inside a share root.
 */
const path = require('path');

/**
 * Resolve a user-supplied relative path inside a shared folder root.
 * @param {string} shareRoot  absolute path of the shared folder
 * @param {string} rel        user-supplied relative path (may be '' or '.')
 * @returns {string} absolute, validated path
 * @throws {Error} with code 'EBADPATH' when the path is unsafe
 */
function resolveInShare(shareRoot, rel) {
  if (typeof rel !== 'string') bad('not a string');
  if (rel.includes('\0')) bad('null byte');
  // Treat backslashes as separators too (Windows-style traversal on any OS).
  const norm = rel.replace(/\\/g, '/');
  if (path.isAbsolute(norm)) bad('absolute path');
  if (/^[a-zA-Z]:(\/|$)/.test(norm)) bad('drive letter');
  if (norm.startsWith('//')) bad('UNC path');

  const root = path.resolve(shareRoot);
  const abs = path.resolve(root, '.' + path.sep + norm);

  if (abs !== root && !abs.startsWith(root + path.sep)) {
    bad('escapes shared folder');
  }
  return abs;

  function bad(reason) {
    const e = new Error('Invalid path: ' + reason);
    e.code = 'EBADPATH';
    throw e;
  }
}

/** Validate a bare file/folder name (single segment, no separators). */
function validName(name) {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  if (!n || n === '.' || n === '..') return false;
  if (n.includes('\0')) return false;
  if (/[/\\]/.test(n)) return false;
  if (/^[a-zA-Z]:$/.test(n)) return false;
  // Windows reserved names
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(n)) return false;
  if (n.length > 200) return false;
  return true;
}

/**
 * Find the shared folder whose root contains (or equals) absPath.
 * Returns the share object or null.
 */
function shareContaining(sharedFolders, absPath) {
  const abs = path.resolve(absPath);
  let best = null;
  for (const s of sharedFolders) {
    const root = path.resolve(s.path);
    if (abs === root || abs.startsWith(root + path.sep)) {
      if (!best || root.length > path.resolve(best.path).length) best = s;
    }
  }
  return best;
}

module.exports = { resolveInShare, validName, shareContaining };
