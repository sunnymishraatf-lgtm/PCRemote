'use strict';
/**
 * static.js — serves the prebuilt web client (server/public/).
 * The client is a hash-routed SPA, so unknown non-API paths fall back
 * to index.html. Directory listing is disabled; dotfiles are blocked.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname === '/connect') {
    return false;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.includes('\0') || rel.includes('..')) return false;
  if (rel.endsWith('/')) rel += 'index.html';
  let abs = path.normalize(path.join(PUBLIC_DIR, rel));
  if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + path.sep)) return false;

  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    // SPA fallback
    abs = path.join(PUBLIC_DIR, 'index.html');
    if (!fs.existsSync(abs)) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Web client not built yet. Run the client build (see README).');
      return true;
    }
  }
  const base = path.basename(abs);
  if (base.startsWith('.')) return false;

  const type = TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  const st = fs.statSync(abs);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': st.size,
    'Cache-Control': abs.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400',
  });
  fs.createReadStream(abs).pipe(res);
  return true;
}

module.exports = { serveStatic, PUBLIC_DIR };
