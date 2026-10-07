'use strict';
/**
 * remote.js — mouse & keyboard control.
 *
 * Uses @nut-tree/nut-js when installed (Windows/macOS/Linux with a desktop).
 * If it is missing or fails to load, every action reports "unsupported"
 * instead of pretending to work — see DEVELOPMENT RULE §43.
 */
let nut = null;
let loadError = null;
try {
  nut = require('@nut-tree/nut-js');
} catch (e) {
  loadError = e.message;
}

const KEYMAP = {
  ESC: 'Escape', TAB: 'Tab', ENTER: 'Enter', BACKSPACE: 'Backspace',
  DELETE: 'Delete', SPACE: 'Space', HOME: 'Home', END: 'End',
  PAGEUP: 'PageUp', PAGEDOWN: 'PageDown',
  UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right',
  INSERT: 'Insert', PRINTSCREEN: 'Print',
  CTRL: 'LeftControl', ALT: 'LeftAlt', SHIFT: 'LeftShift', WIN: 'LeftWin',
  MENU: 'Menu',
  VOL_UP: 'AudioVolumeUp', VOL_DOWN: 'AudioVolumeDown', VOL_MUTE: 'AudioVolumeMute',
  MEDIA_PLAY: 'AudioPlay', MEDIA_PAUSE: 'AudioPause',
  MEDIA_PLAY_PAUSE: 'AudioPlay', MEDIA_NEXT: 'AudioNext', MEDIA_PREV: 'AudioPrev',
  MEDIA_STOP: 'AudioStop',
};

function unsupported() {
  const e = new Error(
    'Remote input is not available on this PC. ' +
    'Install the optional input driver: run "npm install @nut-tree/nut-js" in the pc-remote folder, then restart the server. ' +
    (loadError ? `(${loadError})` : '')
  );
  e.code = 'EUNSUPPORTED';
  e.status = 501;
  throw e;
}

function supported() {
  return !!nut;
}

async function ensureNut() {
  if (!nut) unsupported();
  return nut;
}

function mapKey(key) {
  if (!key || typeof key !== 'string') throw badKey(key);
  const k = key.trim();
  // F1..F24
  if (/^F([1-9]|1\d|2[0-4])$/i.test(k)) return 'F' + parseInt(k.slice(1), 10);
  const upper = k.toUpperCase();
  if (KEYMAP[upper]) return KEYMAP[upper];
  // Single printable character
  if (k.length === 1) return k;
  throw badKey(key);
}

function badKey(key) {
  const e = new Error('Unknown key: ' + JSON.stringify(key));
  e.code = 'EBADKEY';
  e.status = 400;
  return e;
}

async function mouseMoveRel(dx, dy) {
  const { mouse } = await ensureNut();
  dx = clampNum(dx, -5000, 5000); dy = clampNum(dy, -5000, 5000);
  const p = await mouse.getPosition();
  await mouse.setPosition({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) });
}

async function mouseMoveAbs(nx, ny) {
  const { mouse, screen } = await ensureNut();
  nx = clampNum(nx, 0, 1); ny = clampNum(ny, 0, 1);
  const w = await screen.width();
  const h = await screen.height();
  await mouse.setPosition({ x: Math.round(nx * w), y: Math.round(ny * h) });
}

async function mouseClick(button = 'left') {
  const { mouse, Button } = await ensureNut();
  const b = button === 'right' ? Button.RIGHT : button === 'middle' ? Button.MIDDLE : Button.LEFT;
  await mouse.click(b);
}

async function mouseDoubleClick() {
  const { mouse, Button } = await ensureNut();
  await mouse.doubleClick(Button.LEFT);
}

async function mouseDown(button = 'left') {
  const { mouse, Button } = await ensureNut();
  await mouse.pressButton(button === 'right' ? Button.RIGHT : Button.LEFT);
}

async function mouseUp(button = 'left') {
  const { mouse, Button } = await ensureNut();
  await mouse.releaseButton(button === 'right' ? Button.RIGHT : Button.LEFT);
}

async function scroll(dx, dy) {
  const { mouse } = await ensureNut();
  dx = clampNum(dx, -2000, 2000); dy = clampNum(dy, -2000, 2000);
  // nut-js scroll is vertical; emulate horizontal with repeated small scrolls is unreliable,
  // so we map horizontal to vertical-only when dominant, else ignore with a note.
  if (Math.abs(dy) >= Math.abs(dx)) {
    await mouse.scrollDown(Math.round(dy));
  }
}

async function keyAction(key, action = 'press') {
  const n = await ensureNut();
  const mapped = mapKey(key);
  const k = n.Key[mapped];
  if (k === undefined) throw badKey(key);
  if (action === 'down') await n.keyboard.pressKey(k);
  else if (action === 'up') await n.keyboard.releaseKey(k);
  else await n.keyboard.pressKey(k), await n.keyboard.releaseKey(k);
}

async function typeText(text) {
  const n = await ensureNut();
  const t = String(text || '').slice(0, 2000);
  if (!t) return;
  await n.keyboard.type(t);
}

async function shortcut(keys) {
  const n = await ensureNut();
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 4) {
    throw badKey('shortcut must be 1-4 keys');
  }
  const mapped = keys.map(mapKey).map((m) => {
    const k = n.Key[m];
    if (k === undefined) throw badKey(m);
    return k;
  });
  await n.keyboard.pressKey(...mapped);
  await n.keyboard.releaseKey(...mapped);
}

function clampNum(v, lo, hi) {
  v = Number(v);
  if (!Number.isFinite(v)) return 0;
  return Math.max(lo, Math.min(hi, v));
}

module.exports = {
  supported,
  mouseMoveRel, mouseMoveAbs, mouseClick, mouseDoubleClick,
  mouseDown, mouseUp, scroll,
  keyAction, typeText, shortcut,
};
