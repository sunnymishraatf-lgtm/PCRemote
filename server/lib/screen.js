'use strict';
/**
 * screen.js — PC screen capture.
 *
 * Uses the optional `screenshot-desktop` package (bundled per-platform
 * capture binary, no install needed beyond npm). JPEG output with
 * configurable quality. When unavailable, capture() throws EUNSUPPORTED
 * and the UI shows an honest "not available" state.
 */
let shot = null;
let loadError = null;
try {
  shot = require('screenshot-desktop');
} catch (e) {
  loadError = e.message;
}

function supported() {
  return !!shot;
}

/**
 * Capture the primary display as a JPEG buffer.
 * @param {number} quality 1-100
 */
async function capture(quality = 60) {
  if (!shot) {
    const e = new Error(
      'Screen capture is not available on this PC. ' +
      'Install the optional capture driver: run "npm install screenshot-desktop" in the pc-remote folder, then restart the server. ' +
      (loadError ? `(${loadError})` : '')
    );
    e.code = 'EUNSUPPORTED';
    e.status = 501;
    throw e;
  }
  const q = Math.max(1, Math.min(100, Math.round(Number(quality) || 60)));
  const buf = await shot({ format: 'jpg', quality: q });
  if (!buf || !buf.length) {
    const e = new Error('Screen capture returned an empty frame.');
    e.code = 'EFRAME';
    e.status = 502;
    throw e;
  }
  return buf;
}

module.exports = { supported, capture };
