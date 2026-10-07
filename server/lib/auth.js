'use strict';
/**
 * auth.js — PIN authentication, device sessions, one-time pairing tokens,
 * and brute-force rate limiting.
 *
 * Design:
 *  - On startup a random numeric PIN is generated (shown on the PC only).
 *  - Phone POSTs {pin, deviceName} -> receives a session token (24h, revocable).
 *  - The QR code carries a single-use pairing token (5 min TTL) that can be
 *    exchanged for a session without the PIN (physical proximity = consent).
 *  - 5 failed PIN attempts from one IP -> 15 minute lockout.
 */
const crypto = require('crypto');

const PIN_FAILS_MAX = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const PAIR_TTL_MS = 5 * 60 * 1000;

function makeAuth(cfg, audit) {
  let pin = generatePin(cfg.pinLength || 6);
  const sessions = new Map();   // token -> session
  const pairing = new Map();    // pairingToken -> {createdAt}
  const fails = new Map();      // ip -> {count, lockedUntil}

  function generatePin(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += crypto.randomInt(0, 10);
    // Avoid a PIN with all identical digits (slightly stronger, friendlier).
    if (/^(\d)\1+$/.test(s)) return generatePin(len);
    return s;
  }

  function getPin() { return pin; }

  function regeneratePin() {
    pin = generatePin(cfg.pinLength || 6);
    sessions.clear();
    pairing.clear();
    audit.log('security', 'PIN regenerated — all devices disconnected');
    return pin;
  }

  function newToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  // ---- rate limiting ----
  function isLocked(ip) {
    const f = fails.get(ip);
    if (!f) return false;
    if (f.lockedUntil && Date.now() < f.lockedUntil) return true;
    if (f.lockedUntil && Date.now() >= f.lockedUntil) fails.delete(ip);
    return false;
  }

  function recordFail(ip) {
    const f = fails.get(ip) || { count: 0, lockedUntil: 0 };
    f.count += 1;
    if (f.count >= PIN_FAILS_MAX) {
      f.lockedUntil = Date.now() + PIN_LOCK_MS;
      audit.log('security', `PIN brute-force lockout for ${ip} (15 min)`);
    }
    fails.set(ip, f);
    return f;
  }

  function clearFails(ip) { fails.delete(ip); }

  // ---- PIN auth ----
  function authWithPin(pinAttempt, deviceName, ip) {
    if (isLocked(ip)) {
      const e = new Error('Too many failed attempts. Try again in 15 minutes.');
      e.code = 'ELOCKED';
      throw e;
    }
    // Constant-time comparison to avoid timing side channels.
    const a = Buffer.from(String(pinAttempt || ''));
    const b = Buffer.from(pin);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
      recordFail(ip);
      const e = new Error('Incorrect PIN.');
      e.code = 'EBADPIN';
      throw e;
    }
    clearFails(ip);
    return createSession(deviceName || 'Unknown device', ip);
  }

  // ---- pairing tokens (QR) ----
  function newPairingToken() {
    const t = 'pair_' + newToken(16);
    pairing.set(t, { createdAt: Date.now() });
    return t;
  }

  function authWithPairing(pairToken, deviceName, ip) {
    const p = pairing.get(pairToken);
    pairing.delete(pairToken); // single use, always consumed
    if (!p || Date.now() - p.createdAt > PAIR_TTL_MS) {
      const e = new Error('This QR code has expired. Generate a new one on the PC.');
      e.code = 'EBADPAIR';
      throw e;
    }
    return createSession(deviceName || 'Unknown device', ip);
  }

  function createSession(deviceName, ip) {
    const token = newToken(32);
    const now = Date.now();
    const session = {
      id: 'dev_' + newToken(6),
      token,
      deviceName: String(deviceName).slice(0, 60),
      ip,
      createdAt: now,
      lastSeen: now,
      expiresAt: now + (cfg.sessionHours || 24) * 3600 * 1000,
    };
    sessions.set(token, session);
    audit.log('device', `connected (${session.deviceName})`, session.deviceName);
    return session;
  }

  function verify(token) {
    if (!token) return null;
    const s = sessions.get(token);
    if (!s) return null;
    if (Date.now() > s.expiresAt) {
      sessions.delete(token);
      return null;
    }
    s.lastSeen = Date.now();
    return s;
  }

  function revoke(id) {
    for (const [tok, s] of sessions) {
      if (s.id === id) {
        sessions.delete(tok);
        audit.log('device', `revoked (${s.deviceName})`, s.deviceName);
        return true;
      }
    }
    return false;
  }

  function disconnectAll() {
    const n = sessions.size;
    sessions.clear();
    pairing.clear();
    audit.log('security', `disconnected all devices (${n})`);
    return n;
  }

  function deviceList() {
    return [...sessions.values()].map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      ip: s.ip,
      connectedAt: s.createdAt,
      lastSeen: s.lastSeen,
    }));
  }

  return {
    getPin, regeneratePin, newPairingToken,
    authWithPin, authWithPairing, verify, revoke, disconnectAll, deviceList,
    isLocked,
  };
}

module.exports = { makeAuth };
