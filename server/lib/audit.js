'use strict';
/**
 * audit.js — in-memory ring-buffer audit log. Records who did what and when.
 * Never logs PINs, tokens, or file contents — only actions and paths.
 */
const MAX = 300;
const entries = [];

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function log(action, detail, device) {
  entries.push({
    t: Date.now(),
    time: fmtTime(new Date()),
    device: device || '—',
    action,
    detail: detail || '',
  });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
}

function list() {
  return entries.slice().reverse();
}

module.exports = { log, list };
