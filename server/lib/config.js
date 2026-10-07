'use strict';
/**
 * config.js — persistent server configuration.
 *
 * Lives at ~/.pc-remote/config.json (created on first run).
 * The user edits shared folders here or through the Settings UI.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), '.pc-remote');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function defaultSharedFolders() {
  const home = os.homedir();
  const candidates = [
    { id: 'pictures',  name: 'Pictures',  sub: 'Pictures',  perms: { read: true, upload: true,  del: false } },
    { id: 'videos',    name: 'Videos',    sub: 'Videos',    perms: { read: true, upload: true,  del: false } },
    { id: 'documents', name: 'Documents', sub: 'Documents', perms: { read: true, upload: true,  del: false } },
    { id: 'downloads', name: 'Downloads', sub: 'Downloads', perms: { read: true, upload: true,  del: true  } },
  ];
  const out = [];
  for (const c of candidates) {
    const p = path.join(home, c.sub);
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        out.push({ id: c.id, name: c.name, path: p, perms: c.perms });
      }
    } catch { /* ignore unreadable candidates */ }
  }
  // Last resort: share the home dir read-only so the app is never empty.
  if (out.length === 0) {
    out.push({ id: 'home', name: 'Home', path: home, perms: { read: true, upload: false, del: false } });
  }
  return out;
}

function defaults() {
  return {
    port: 8080,
    bind: '0.0.0.0',          // LAN only by default; use 127.0.0.1 to restrict to this PC
    pinLength: 6,
    sessionHours: 24,
    sharedFolders: defaultSharedFolders(),
  };
}

function load() {
  const cfg = defaults();
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (typeof raw.port === 'number') cfg.port = raw.port;
      if (typeof raw.bind === 'string') cfg.bind = raw.bind;
      if (typeof raw.sessionHours === 'number') cfg.sessionHours = raw.sessionHours;
      if (Array.isArray(raw.sharedFolders)) cfg.sharedFolders = raw.sharedFolders;
    }
  } catch (e) {
    console.error('[config] could not parse config, using defaults:', e.message);
  }
  // Validate shared folders: must exist and be directories.
  cfg.sharedFolders = cfg.sharedFolders.filter((f) => {
    try {
      return f && typeof f.path === 'string' && fs.statSync(f.path).isDirectory();
    } catch { return false; }
  });
  cfg.sharedFolders.forEach((f) => {
    f.perms = Object.assign({ read: true, upload: false, del: false }, f.perms);
  });
  return cfg;
}

function save(cfg) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[config] save failed:', e.message);
    return false;
  }
}

module.exports = { load, save, CONFIG_PATH, CONFIG_DIR };
