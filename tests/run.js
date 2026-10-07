'use strict';
/**
 * tests/run.js — automated tests. Run: npm test
 *
 * Covers: path traversal, auth (PIN, lockout, expiry, pairing single-use),
 * file ops (list/upload/download/range/zip/rename/delete/mkdir/search),
 * WebSocket protocol validation, and honest "unsupported" remote responses.
 *
 * NOTE: real Windows + real Android testing is still required for screen
 * capture, input injection, and phone UX — see README § Testing.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const { makeAuth } = require('../server/lib/auth');
const { resolveInShare } = require('../server/lib/paths');
const audit = require('../server/lib/audit');
const { makeRoutes } = require('../server/routes');
const { makeWs } = require('../server/ws');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}

async function main() {
  // ---- fixture: temp share with files ----
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcremote-test-'));
  const share = path.join(tmp, 'share');
  fs.mkdirSync(path.join(share, 'docs', 'sub'), { recursive: true });
  fs.mkdirSync(path.join(share, 'pics'), { recursive: true });
  fs.writeFileSync(path.join(share, 'hello.txt'), 'hello world');
  fs.writeFileSync(path.join(share, 'docs', 'resume.pdf'), '%PDF-fake');
  fs.writeFileSync(path.join(share, 'docs', 'sub', 'notes.txt'), 'deep notes');
  fs.writeFileSync(path.join(share, 'pics', 'img1.jpg'), Buffer.alloc(5000, 7));
  // 20 MB file to prove streaming (never fully buffered by our code paths)
  const big = path.join(share, 'big.bin');
  const w = fs.createWriteStream(big);
  for (let i = 0; i < 20; i++) w.write(Buffer.alloc(1024 * 1024, i));
  w.end();
  await new Promise((r) => w.on('finish', r));

  const cfg = {
    port: 0, bind: '127.0.0.1', pinLength: 6, sessionHours: 24,
    sharedFolders: [{ id: 't', name: 'Test', path: share, perms: { read: true, upload: true, del: true } }],
  };
  const auth = makeAuth(cfg, audit);
  const routes = makeRoutes({ auth, cfg, saveConfig: () => {} });
  const server = http.createServer(async (req, res) => {
    try { await routes.handle(req, res); }
    catch (e) { res.writeHead(500); res.end('boom'); }
  });
  // static must not swallow /api in tests — routes.handle 404s unknown, fine.
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const PIN = auth.getPin();

  const F = (p, opts = {}) => fetch(base + p, opts);

  console.log('— security: path traversal (unit) —');
  const evil = ['../../Windows/System32', '..\\..\\Windows', '/etc/passwd', 'C:\\Windows',
    '\\\\server\\share', 'a\0b', '/absolute', 'D:/x', '..', '../..'];
  for (const e of evil) {
    let threw = false;
    try { resolveInShare(share, e); } catch (err) { threw = err.code === 'EBADPATH'; }
    assert(threw, `traversal rejected: ${JSON.stringify(e)}`);
  }
  assert(resolveInShare(share, 'docs/sub') === path.join(share, 'docs', 'sub'), 'legit subpath resolves');
  assert(resolveInShare(share, '') === share, 'empty rel resolves to root');

  console.log('— security: auth —');
  let r = await F('/api/files?share=t&path=');
  assert(r.status === 401, 'no token -> 401');
  r = await F('/api/files?share=t&path=', { headers: { Authorization: 'Bearer nope' } });
  assert(r.status === 401, 'bad token -> 401');

  // brute force lockout: 5 bad PINs -> 429 on the 6th
  for (let i = 0; i < 5; i++) {
    r = await F('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '000000' }) });
    assert(r.status === 401, `bad PIN attempt ${i + 1} -> 401`);
  }
  r = await F('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) });
  assert(r.status === 429, 'correct PIN during lockout -> 429');

  // fresh auth instance for the remaining tests (lockout is per-instance/IP)
  const auth2 = makeAuth(cfg, audit);
  const routes2 = makeRoutes({ auth: auth2, cfg, saveConfig: () => {} });
  // (swap handler)
  server.removeAllListeners('request');
  server.on('request', async (req, res) => {
    try { await routes2.handle(req, res); } catch (e) { res.writeHead(500); res.end('boom'); }
  });
  makeWs(server, auth2, audit);

  r = await F('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: auth2.getPin(), deviceName: 'test' }) });
  const login = await r.json();
  assert(r.status === 200 && login.ok && login.token, 'correct PIN -> session token');
  const T = login.token;
  const H = { Authorization: 'Bearer ' + T };

  // expired token
  const authExp = makeAuth({ ...cfg, sessionHours: -1 }, audit);
  const sExp = authExp.authWithPin(authExp.getPin(), 'x', '127.0.0.1');
  assert(authExp.verify(sExp.token) === null, 'expired session rejected');

  // pairing token: single use
  const pt = auth2.newPairingToken();
  r = await F('/api/auth/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairToken: pt, deviceName: 'qr-phone' }) });
  assert(r.status === 200, 'pairing token -> session');
  r = await F('/api/auth/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairToken: pt, deviceName: 'qr-phone' }) });
  assert(r.status === 401, 'pairing token single-use enforced');

  console.log('— files —');
  r = await F('/api/files?share=t&path=', { headers: H });
  let j = await r.json();
  assert(r.status === 200 && j.items.length >= 4, 'list root returns items');
  assert(j.items[0].isDir, 'directories sort first');

  r = await F('/api/files?share=t&path=' + encodeURIComponent('../../etc'), { headers: H });
  assert(r.status === 400, 'HTTP traversal -> 400');

  // download + byte integrity
  r = await F('/api/files/download?share=t&path=' + encodeURIComponent('docs/resume.pdf'), { headers: H });
  const dlBytes = Buffer.from(await r.arrayBuffer());
  assert(r.status === 200 && dlBytes.toString() === '%PDF-fake', 'download byte-identical');
  assert(r.headers.get('accept-ranges') === 'bytes', 'accept-ranges advertised');

  // range request
  r = await F('/api/files/download?share=t&path=' + encodeURIComponent('hello.txt'), { headers: { ...H, Range: 'bytes=0-4' } });
  assert(r.status === 206, 'range -> 206');
  assert(r.headers.get('content-range') === 'bytes 0-4/11', 'content-range correct');
  assert(Buffer.from(await r.arrayBuffer()).toString() === 'hello', 'range bytes correct');

  // big file streams without buffering the world
  r = await F('/api/files/download?share=t&path=big.bin', { headers: H });
  let total = 0;
  for await (const chunk of r.body) total += chunk.length;
  assert(total === 20 * 1024 * 1024, '20MB streamed fully');

  // upload + duplicate handling
  const put = (name, body, dir = '') =>
    F(`/api/files/upload?share=t&dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(name)}`,
      { method: 'PUT', headers: H, body });
  r = await put('up.txt', 'upload-contents');
  j = await r.json();
  assert(r.status === 200 && j.file.name === 'up.txt', 'upload ok');
  assert(fs.readFileSync(path.join(share, 'up.txt'), 'utf8') === 'upload-contents', 'upload bytes on disk');
  r = await put('up.txt', 'second');
  j = await r.json();
  assert(j.file.name === 'up (1).txt', 'duplicate renamed, not overwritten');

  // mkdir / rename / delete
  r = await F('/api/files/mkdir', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ share: 't', dir: '', name: 'newdir' }) });
  assert(r.status === 200 && fs.statSync(path.join(share, 'newdir')).isDirectory(), 'mkdir');
  r = await F('/api/files/rename', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ share: 't', path: 'newdir', newName: 'renamed' }) });
  assert(r.status === 200 && fs.existsSync(path.join(share, 'renamed')), 'rename');
  r = await F('/api/files?share=t&path=' + encodeURIComponent('renamed'), { method: 'DELETE', headers: H });
  assert(r.status === 200 && !fs.existsSync(path.join(share, 'renamed')), 'delete');

  // search
  r = await F('/api/files/search?share=t&q=' + encodeURIComponent('*.txt'), { headers: H });
  j = await r.json();
  assert(j.items.some((x) => x.name === 'notes.txt'), 'glob search finds nested file');
  r = await F('/api/files/search?share=t&q=resume', { headers: H });
  j = await r.json();
  assert(j.items.some((x) => x.name === 'resume.pdf'), 'substring search works');

  // zip
  r = await F('/api/files/zip?share=t&path=docs', { headers: H });
  const zipHead = Buffer.from(await r.arrayBuffer().then((b) => b.slice(0, 2)));
  assert(r.status === 200 && zipHead.toString() === 'PK', 'zip streams with PK magic');
  assert((r.headers.get('content-disposition') || '').includes('attachment'), 'zip is attachment');

  // storage (best effort)
  r = await F('/api/storage', { headers: H });
  j = await r.json();
  assert(r.status === 200 && Array.isArray(j.drives), 'storage endpoint responds');

  console.log('— websocket protocol —');
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws?token=' + T);
    const seen = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      seen.push(m.type);
      if (m.type === 'ready') {
        ws.send('not json at all');
        ws.send(JSON.stringify({ nonsense: 1 }));
        ws.send(JSON.stringify({ v: 2, type: 'ping' }));
        ws.send(JSON.stringify({ v: 1, type: 'bogus_type' }));
        ws.send(JSON.stringify({ v: 1, type: 'ping', t: 123 }));
        ws.send(JSON.stringify({ v: 1, type: 'key', key: 'ENTER', action: 'press' }));
      }
      if (m.type === 'error' && m.for === 'key') {
        // key failed honestly (no input driver on this box) — socket still alive?
        assert(['EUNSUPPORTED', 'EFAILED'].includes(m.code), 'key without driver -> honest error, got ' + m.code);
        ws.close();
      }
    });
    ws.on('close', () => {
      assert(seen.includes('error'), 'invalid messages got error replies');
      assert(seen.filter((t) => t === 'pong').length >= 1, 'socket survived bad messages (pong received)');
      resolve();
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('ws test timeout')), 10000);
  });

  // unauthenticated ws gets closed
  await new Promise((resolve) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    let closed = false;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'error' && m.code === 'EAUTH') closed = true;
    });
    ws.on('close', () => { assert(closed, 'unauthenticated ws rejected'); resolve(); });
    setTimeout(resolve, 12000);
  });

  console.log('— devices / security —');
  r = await F('/api/devices', { headers: H });
  j = await r.json();
  assert(j.devices.length >= 1, 'device list shows sessions');
  const other = j.devices.find((d) => d.deviceName === 'qr-phone');
  if (other) {
    r = await F(`/api/devices/${other.id}/revoke`, { method: 'POST', headers: H });
    assert(r.status === 200, 'revoke device');
  }
  r = await F('/api/audit', { headers: H });
  j = await r.json();
  assert(j.entries.length > 0, 'audit log has entries');
  assert(!JSON.stringify(j.entries).includes(T), 'audit log never contains tokens');

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
