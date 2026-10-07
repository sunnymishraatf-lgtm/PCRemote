'use strict';
/**
 * net.js — local network helpers: enumerate LAN IPv4 addresses.
 */
const os = require('os');

function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifs)) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) {
        out.push({ iface: name, address: a.address });
      }
    }
  }
  return out;
}

/** Best single address to show / embed in the QR code. */
function primaryAddress() {
  const addrs = lanAddresses();
  // Prefer 192.168.x.x, then 10.x.x.x, then 172.16-31.x.x, then anything.
  const rank = (ip) =>
    ip.startsWith('192.168.') ? 0 :
    ip.startsWith('10.') ? 1 :
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  addrs.sort((a, b) => rank(a.address) - rank(b.address));
  return addrs.length ? addrs[0].address : null;
}

module.exports = { lanAddresses, primaryAddress };
