'use strict';
/**
 * ws.js — WebSocket server, protocol version 1.
 *
 * Low-latency channel for mouse/keyboard/screen. Every message is
 * validated; malformed or unknown messages get an error reply and the
 * socket stays alive. Flood protection: >150 msgs/sec closes the socket.
 *
 * Client -> server:
 *   {v:1, type:'auth', token}
 *   {v:1, type:'ping', t}
 *   {v:1, type:'mouse_move', dx, dy}      relative pixels
 *   {v:1, type:'mouse_abs', nx, ny}       normalized 0..1
 *   {v:1, type:'mouse_click', button}     left|right|middle
 *   {v:1, type:'mouse_dblclick'}
 *   {v:1, type:'mouse_down'|'mouse_up', button}
 *   {v:1, type:'scroll', dx, dy}
 *   {v:1, type:'key', key, action}        press|down|up
 *   {v:1, type:'type_text', text}
 *   {v:1, type:'shortcut', keys:[...]}
 *   {v:1, type:'screen_start', quality}   low|balanced|high|ultra
 *   {v:1, type:'screen_stop'}
 *
 * Server -> client:
 *   {v:1, type:'ready', capabilities}
 *   {v:1, type:'pong', t}
 *   {v:1, type:'frame', data}             base64 JPEG
 *   {v:1, type:'ok', for}
 *   {v:1, type:'error', code, message}
 */
const { WebSocketServer } = require('ws');
const remote = require('./lib/remote');
const screen = require('./lib/screen');

const QUALITY = {
  low:      { q: 40, fps: 5 },
  balanced: { q: 60, fps: 10 },
  high:     { q: 75, fps: 15 },
  ultra:    { q: 90, fps: 20 },
};

const MSG_LIMIT_PER_SEC = 150;

function capabilities() {
  return {
    screen: screen.supported(),
    input: remote.supported(),
    platform: process.platform,
  };
}

function makeWs(httpServer, auth, audit) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || '?';
    const state = {
      authed: null, authedAt: 0,
      msgCount: 0, msgWindow: Date.now(),
      streaming: false, streamTimer: null, streamBusy: false,
      authedTimer: null,
    };

    const send = (obj) => {
      if (ws.readyState === 1) {
        try { ws.send(JSON.stringify(obj)); } catch { /* closed */ }
      }
    };
    const sendError = (code, message, origType) =>
      send({ v: 1, type: 'error', code, message, for: origType || undefined });

    // Auth: token via query param or first 'auth' message, within 10s.
    let token = null;
    try {
      const u = new URL(req.url, 'http://x');
      token = u.searchParams.get('token');
    } catch { /* ignore */ }
    if (token) {
      const s = auth.verify(token);
      if (s) { state.authed = s; }
    }
    if (!state.authed) {
      state.authedTimer = setTimeout(() => {
        if (!state.authed && ws.readyState === 1) {
          sendError('EAUTH', 'Authentication required');
          ws.close(4401, 'auth required');
        }
      }, 10000);
    } else {
      send({ v: 1, type: 'ready', capabilities: capabilities() });
    }

    ws.on('message', async (raw) => {
      // Flood protection
      const now = Date.now();
      if (now - state.msgWindow > 1000) { state.msgCount = 0; state.msgWindow = now; }
      if (++state.msgCount > MSG_LIMIT_PER_SEC) {
        ws.close(4408, 'rate limited');
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendError('EBADMSG', 'Message must be JSON');
        return;
      }
      if (!msg || typeof msg !== 'object' || msg.v !== 1 || typeof msg.type !== 'string') {
        sendError('EBADMSG', 'Message must look like {v:1, type:...}');
        return;
      }

      try {
        // ---- pre-auth messages ----
        if (!state.authed) {
          if (msg.type === 'auth') {
            const s = auth.verify(msg.token);
            if (!s) { sendError('EAUTH', 'Invalid or expired token'); ws.close(4401, 'bad token'); return; }
            state.authed = s;
            clearTimeout(state.authedTimer);
            send({ v: 1, type: 'ready', capabilities: capabilities() });
            audit.log('device', `opened control channel (${s.deviceName})`, s.deviceName);
            return;
          }
          sendError('EAUTH', 'Authenticate first');
          return;
        }

        switch (msg.type) {
          case 'auth':
            send({ v: 1, type: 'ready', capabilities: capabilities() });
            break;

          case 'ping':
            send({ v: 1, type: 'pong', t: msg.t });
            break;

          case 'mouse_move':
            await remote.mouseMoveRel(num(msg.dx), num(msg.dy));
            break;
          case 'mouse_abs':
            await remote.mouseMoveAbs(num(msg.nx), num(msg.ny));
            break;
          case 'mouse_click':
            await remote.mouseClick(str(msg.button, 'left'));
            break;
          case 'mouse_dblclick':
            await remote.mouseDoubleClick();
            break;
          case 'mouse_down':
            await remote.mouseDown(str(msg.button, 'left'));
            break;
          case 'mouse_up':
            await remote.mouseUp(str(msg.button, 'left'));
            break;
          case 'scroll':
            await remote.scroll(num(msg.dx), num(msg.dy));
            break;

          case 'key':
            await remote.keyAction(str(msg.key), str(msg.action, 'press'));
            break;
          case 'type_text':
            await remote.typeText(str(msg.text, '').slice(0, 2000));
            send({ v: 1, type: 'ok', for: 'type_text' });
            break;
          case 'shortcut':
            await remote.shortcut(msg.keys);
            break;

          case 'screen_start':
            startStream(str(msg.quality, 'balanced'));
            break;
          case 'screen_stop':
            stopStream();
            break;

          default:
            sendError('EUNKNOWN', `Unknown message type: ${msg.type}`, msg.type);
        }
      } catch (e) {
        sendError(e.code || 'EFAILED', e.message || 'Action failed', msg.type);
      }
    });

    ws.on('close', () => {
      stopStream();
      clearTimeout(state.authedTimer);
      if (state.authed) audit.log('device', `closed control channel (${state.authed.deviceName})`, state.authed.deviceName);
    });
    ws.on('error', () => { stopStream(); });

    function startStream(quality) {
      const preset = QUALITY[quality] || QUALITY.balanced;
      stopStream();
      if (!screen.supported()) {
        sendError('EUNSUPPORTED', 'Screen capture is not available on this PC. Install the optional driver (see README).', 'screen_start');
        return;
      }
      state.streaming = true;
      audit.log('remote', `screen streaming started (${quality})`, state.authed && state.authed.deviceName);
      const interval = Math.round(1000 / preset.fps);
      const tick = async () => {
        if (!state.streaming) return;
        if (state.streamBusy) { state.streamTimer = setTimeout(tick, 50); return; }
        state.streamBusy = true;
        try {
          const buf = await screen.capture(preset.q);
          if (state.streaming) send({ v: 1, type: 'frame', data: buf.toString('base64') });
        } catch (e) {
          if (state.streaming) sendError(e.code || 'EFRAME', e.message, 'frame');
          state.streaming = false;
          state.streamBusy = false;
          return;
        }
        state.streamBusy = false;
        if (state.streaming) state.streamTimer = setTimeout(tick, interval);
      };
      tick();
    }

    function stopStream() {
      if (state.streaming && state.authed) {
        audit.log('remote', 'screen streaming stopped', state.authed.deviceName);
      }
      state.streaming = false;
      if (state.streamTimer) { clearTimeout(state.streamTimer); state.streamTimer = null; }
    }
  });

  return wss;
}

function num(v) { v = Number(v); return Number.isFinite(v) ? v : 0; }
function str(v, dflt) { return typeof v === 'string' && v ? v : dflt; }

module.exports = { makeWs, capabilities, QUALITY };
