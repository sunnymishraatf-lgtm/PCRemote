'use strict';
/**
 * index.js — PC Remote Server entry point.
 *
 *   npm start
 *
 * Prints the connection banner (address, PIN, QR code), serves the web
 * client + JSON API on the LAN, and hosts the WebSocket control channel.
 * No cloud, no install, no background persistence: Ctrl+C stops everything.
 */
const http = require('http');
const os = require('os');
const config = require('./lib/config');
const { lanAddresses, primaryAddress } = require('./lib/net');
const { makeAuth } = require('./lib/auth');
const audit = require('./lib/audit');
const { makeRoutes } = require('./routes');
const { makeWs } = require('./ws');
const { serveStatic } = require('./static');

const cfg = config.load();
const saveConfig = () => config.save(cfg);
const auth = makeAuth(cfg, audit);

const server = http.createServer(async (req, res) => {
  try {
    if (serveStatic(req, res)) return;
    await routes.handle(req, res);
  } catch (e) {
    console.error('[http]', e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'EINTERNAL', message: 'Internal error' } }));
    }
  }
});

const routes = makeRoutes({ auth, cfg, saveConfig });
makeWs(server, auth, audit);

const port = Number(process.env.PC_REMOTE_PORT) || cfg.port || 8080;
const bind = process.env.PC_REMOTE_BIND || cfg.bind || '0.0.0.0';

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nPort ${port} is already in use. Another copy may be running, or set PC_REMOTE_PORT.\n`);
  } else {
    console.error('\nServer error:', e.message);
  }
  process.exit(1);
});

server.listen(port, bind, () => {
  printBanner(port);
  advertiseMdns(port);
  audit.log('server', `started on port ${port}`);
});

process.on('SIGINT', () => {
  console.log('\n\nStopping PC Remote Server…');
  audit.log('server', 'stopped');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});

function printBanner(port) {
  const addrs = lanAddresses();
  const primary = primaryAddress();
  const pin = auth.getPin();
  const pairToken = auth.newPairingToken();
  const qrUrl = primary ? `http://${primary}:${port}/connect?token=${pairToken}` : null;

  const line = '='.repeat(46);
  console.log('\n' + line);
  console.log('           PC REMOTE SERVER');
  console.log(line);
  console.log(`  Status:        RUNNING`);
  console.log(`  PC Name:       ${os.hostname()}`);
  console.log();
  if (addrs.length) {
    console.log('  Local address (open on your phone):');
    for (const a of addrs) console.log(`    http://${a.address}:${port}   (${a.iface})`);
  } else {
    console.log('  No LAN address found. Check your Wi-Fi / hotspot.');
  }
  console.log();
  console.log(`  PIN:           ${pin.split('').join(' ')}`);
  console.log();
  if (qrUrl) {
    console.log('  Scan with your phone camera:');
    try {
      const qr = require('qrcode-terminal');
      qr.generate(qrUrl, { small: true }, (code) => {
        console.log(code.split('\n').map((l) => '    ' + l).join('\n'));
      });
    } catch {
      console.log('    ' + qrUrl);
    }
  }
  console.log(`  Shared folders (${cfg.sharedFolders.length}):`);
  for (const s of cfg.sharedFolders) console.log(`    ✓ ${s.name}  (${s.path})`);
  console.log();
  console.log('  Press Ctrl+C to stop. The QR code expires in 5 minutes;');
  console.log('  the PIN stays valid until you regenerate it or stop the server.');
  console.log(line + '\n');

  if (!addrs.length) {
    console.log('  TROUBLESHOOTING: phone cannot reach the PC?');
    console.log('  1. Connect the phone to the same Wi-Fi (or the PC hotspot).');
    console.log('  2. Allow PC Remote through Windows Firewall (see README).');
    console.log('  3. Make sure no VPN is isolating the PC.\n');
  }
}

function advertiseMdns(port) {
  // Optional: http://pc-remote.local — best effort only.
  try {
    const { Bonjour } = require('bonjour-service');
    const bonjour = new Bonjour();
    bonjour.publish({
      name: `PC Remote (${os.hostname()})`,
      type: 'http',
      port,
      txt: { app: 'pc-remote', v: '1' },
    });
    console.log('[mdns] advertising as pc-remote.local (best effort)');
  } catch {
    // optional dependency not installed — IP address still works
  }
}
