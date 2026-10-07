import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../App';
import { fmtBytes } from '../lib/format';
import { Empty } from '../components/ui';

type Tab = 'screen' | 'mouse' | 'keys';

export default function Remote() {
  const { caps, socket, toast } = useApp();
  const [tab, setTab] = useState<Tab>('screen');

  // Send via WebSocket; fall back to HTTP when the socket is down.
  async function send(msg: any) {
    if (socket?.send(msg)) return;
    try {
      const t = msg.type;
      if (t.startsWith('mouse') || t === 'scroll') {
        await api('/api/control/mouse', {
          method: 'POST',
          body: JSON.stringify({
            action: t === 'mouse_move' ? 'move' : t === 'mouse_abs' ? 'abs' :
              t === 'mouse_click' ? 'click' : t === 'mouse_dblclick' ? 'dblclick' :
              t === 'mouse_down' ? 'down' : t === 'mouse_up' ? 'up' : 'scroll',
            dx: msg.dx, dy: msg.dy, nx: msg.nx, ny: msg.ny, button: msg.button,
          }),
        });
      } else if (t === 'key' || t === 'type_text' || t === 'shortcut') {
        await api('/api/control/keyboard', {
          method: 'POST',
          body: JSON.stringify({
            action: t === 'key' ? 'key' : t === 'type_text' ? 'type' : 'shortcut',
            key: msg.key, mode: msg.action, text: msg.text, keys: msg.keys,
          }),
        });
      }
    } catch (e: any) { toast(e.message); }
  }

  if (caps && !caps.input && !caps.screen) {
    return <Empty icon="⚠️" text="Remote control drivers are not installed on this PC. See the README (optional dependencies) and restart the server." />;
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-1 mb-3 p-1 rounded-2xl bg-panel border border-slate-800">
        {([['screen', '🖥️ Screen'], ['mouse', '🖱️ Mouse'], ['keys', '⌨️ Keys']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`py-2 rounded-xl font-semibold text-sm ${tab === id ? 'bg-accent text-ink' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'screen' && <ScreenTab send={send} />}
      {tab === 'mouse' && <MouseTab send={send} />}
      {tab === 'keys' && <KeysTab send={send} />}
    </div>
  );
}

/* ================= SCREEN ================= */

function ScreenTab({ send }: { send: (m: any) => void }) {
  const { caps, socket, toast } = useApp();
  const [streaming, setStreaming] = useState(false);
  const [quality, setQuality] = useState('balanced');
  const [frame, setFrame] = useState<string | null>(null);
  const [frames, setFrames] = useState(0);
  const [bytes, setBytes] = useState(0);
  const t0 = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // Subscribe to screen frames while this tab is mounted.
  useEffect(() => {
    if (!socket) return;
    socket.setFrameHandler((b64: string) => {
      setFrame(b64);
      setFrames((f) => f + 1);
      setBytes((b) => b + Math.round(b64.length * 0.75));
    });
    return () => {
      socket.setFrameHandler(undefined);
      send({ type: 'screen_stop' });
      setStreaming(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  function start() {
    if (!caps?.screen) { toast('Screen capture is not available on this PC.'); return; }
    t0.current = Date.now(); setFrames(0); setBytes(0);
    send({ type: 'screen_start', quality });
    setStreaming(true);
  }
  function stop() {
    send({ type: 'screen_stop' });
    setStreaming(false);
  }

  function tap(e: React.MouseEvent | React.TouchEvent) {
    const img = imgRef.current;
    if (!img || !streaming) return;
    const r = img.getBoundingClientRect();
    const cx = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const nx = (cx - r.left) / r.width;
    const ny = (cy - r.top) / r.height;
    send({ type: 'mouse_abs', nx, ny });
    send({ type: 'mouse_click', button: 'left' });
  }

  const fps = frames && t0.current ? (frames / ((Date.now() - t0.current) / 1000)).toFixed(1) : '—';

  return (
    <div>
      {!caps?.screen && (
        <div className="card mb-3 text-sm text-amber-300">
          ⚠️ Screen capture isn't available on this PC (optional driver not installed). Mouse &amp; keyboard still work if their driver is present.
        </div>
      )}
      <div className="flex gap-2 mb-2">
        <select className="input !w-auto" value={quality} onChange={(e) => setQuality(e.target.value)} disabled={streaming}>
          <option value="low">Low</option>
          <option value="balanced">Balanced</option>
          <option value="high">High</option>
          <option value="ultra">Ultra</option>
        </select>
        {!streaming
          ? <button className="btn flex-1" onClick={start} disabled={!caps?.screen}>▶ Start screen</button>
          : <button className="btn-ghost flex-1 !border-red-800 !text-red-400" onClick={stop}>⏹ Stop</button>}
      </div>

      <div className="card !p-1 relative">
        {frame
          ? <img ref={imgRef} src={'data:image/jpeg;base64,' + frame} alt="PC screen"
              className="w-full rounded-xl bg-black select-none" draggable={false}
              onClick={tap} style={{ touchAction: 'manipulation' }} />
          : <div className="py-16 text-center text-slate-500">
              {streaming ? 'Waiting for frames…' : 'Press Start to view the PC screen.'}
            </div>}
        {streaming && (
          <div className="absolute top-3 left-3 text-xs bg-black/70 rounded-lg px-2 py-1">
            {fps} fps · {fmtBytes(bytes)}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-2">Tip: tap the screen to click. Use the Mouse tab for the touchpad.</p>
    </div>
  );
}

/* ================= MOUSE ================= */

function MouseTab({ send }: { send: (m: any) => void }) {
  const { caps, toast } = useApp();
  const [sens, setSens] = useState(1.5);
  const [dragMode, setDragMode] = useState(false);
  const pad = useRef<HTMLDivElement>(null);
  const st = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    lastSingle: { x: 0, y: 0 },
    downAt: 0, moved: 0, lastTapAt: 0,
    dragging: false,
    lastScrollY: 0,
  });

  if (caps && !caps.input) {
    return <Empty icon="⚠️" text="Mouse control is not available on this PC (optional driver not installed)." />;
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const s = st.current;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pointers.size === 1) {
      s.lastSingle = { x: e.clientX, y: e.clientY };
      s.downAt = Date.now(); s.moved = 0;
      if (dragMode && !s.dragging) { send({ type: 'mouse_down', button: 'left' }); s.dragging = true; }
    } else if (s.pointers.size === 2) {
      const ys = [...s.pointers.values()].map((p) => p.y);
      s.lastScrollY = (ys[0] + ys[1]) / 2;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = st.current;
    const prev = s.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = (e.clientX - prev.x) * sens;
    const dy = (e.clientY - prev.y) * sens;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    s.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);

    if (s.pointers.size === 1) {
      send({ type: 'mouse_move', dx: Math.round(dx), dy: Math.round(dy) });
    } else if (s.pointers.size === 2) {
      const ys = [...s.pointers.values()].map((p) => p.y);
      const midY = (ys[0] + ys[1]) / 2;
      const sdy = (midY - s.lastScrollY) * -3 * sens;
      s.lastScrollY = midY;
      if (Math.abs(sdy) > 2) send({ type: 'scroll', dx: 0, dy: Math.round(sdy) });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = st.current;
    const wasCount = s.pointers.size;
    s.pointers.delete(e.pointerId);
    const quick = Date.now() - s.downAt < 350;
    const still = s.moved < 12;

    if (s.dragging && wasCount === 1) {
      send({ type: 'mouse_up', button: 'left' });
      s.dragging = false;
    } else if (wasCount === 1 && quick && still && !dragMode) {
      const now = Date.now();
      if (now - s.lastTapAt < 350) {
        send({ type: 'mouse_dblclick' });
        s.lastTapAt = 0;
      } else {
        send({ type: 'mouse_click', button: 'left' });
        s.lastTapAt = now;
      }
    } else if (wasCount === 2 && quick && still) {
      send({ type: 'mouse_click', button: 'right' });
    }
    if (s.pointers.size === 0) { s.moved = 0; }
  }

  return (
    <div>
      <div
        ref={pad}
        className={`touchpad h-64 flex items-center justify-center ${dragMode ? '!border-accent' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}>
        <div className="text-center text-slate-500 pointer-events-none">
          <div className="text-3xl mb-1">👆</div>
          <div className="text-sm px-6">
            {dragMode ? 'Drag mode: touch & move to drag' : 'Move: 1 finger · Click: tap · Right-click: 2-finger tap · Scroll: 2-finger slide'}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-2">
        <button className="btn-ghost flex-1" onClick={() => send({ type: 'mouse_click', button: 'left' })}>LEFT</button>
        <button className={`flex-1 rounded-xl px-4 py-2.5 font-semibold border active:scale-[.98] transition ${dragMode ? 'bg-accent text-ink border-accent' : 'btn-ghost'}`}
          onClick={() => { setDragMode(!dragMode); toast(dragMode ? 'Drag mode off' : 'Drag mode on — touch the pad and move'); }}>
          ✥ DRAG
        </button>
        <button className="btn-ghost flex-1" onClick={() => send({ type: 'mouse_click', button: 'right' })}>RIGHT</button>
      </div>
      <div className="flex gap-2 mt-2">
        <button className="btn-ghost flex-1" onClick={() => send({ type: 'scroll', dx: 0, dy: 240 })}>▲ Scroll</button>
        <button className="btn-ghost flex-1" onClick={() => send({ type: 'scroll', dx: 0, dy: -240 })}>▼ Scroll</button>
      </div>

      <div className="card mt-3">
        <div className="flex justify-between text-sm mb-1">
          <span>Pointer speed</span><span className="text-slate-400">{sens.toFixed(1)}×</span>
        </div>
        <input type="range" min={0.5} max={4} step={0.1} value={sens}
          onChange={(e) => setSens(Number(e.target.value))} className="w-full accent-sky-400" />
      </div>
    </div>
  );
}

/* ================= KEYBOARD ================= */

const SPECIAL: [string, string][] = [
  ['ESC', 'ESC'], ['TAB', 'TAB'], ['⌫', 'BACKSPACE'], ['DEL', 'DELETE'],
  ['HOME', 'HOME'], ['END', 'END'], ['▲', 'UP'], ['▼', 'DOWN'],
  ['◀', 'LEFT'], ['▶', 'RIGHT'], ['PG↑', 'PAGEUP'], ['PG↓', 'PAGEDOWN'],
  ['⏎', 'ENTER'], ['SPACE', 'SPACE'],
];
const FKEYS = Array.from({ length: 12 }, (_, i) => 'F' + (i + 1));
const SHORTCUTS: [string, string[]][] = [
  ['Copy', ['CTRL', 'C']], ['Paste', ['CTRL', 'V']], ['Cut', ['CTRL', 'X']],
  ['Undo', ['CTRL', 'Z']], ['Select all', ['CTRL', 'A']], ['Save', ['CTRL', 'S']],
  ['Alt+Tab', ['ALT', 'TAB']], ['Win+D', ['WIN', 'D']],
  ['Task Mgr', ['CTRL', 'SHIFT', 'ESC']], ['Close win', ['ALT', 'F4']],
];
const MEDIA: [string, string][] = [
  ['🔉', 'VOL_DOWN'], ['🔊', 'VOL_UP'], ['🔇', 'VOL_MUTE'],
  ['⏯', 'MEDIA_PLAY_PAUSE'], ['⏭', 'MEDIA_NEXT'], ['⏮', 'MEDIA_PREV'],
];

function KeysTab({ send }: { send: (m: any) => void }) {
  const { caps } = useApp();
  const [text, setText] = useState('');
  const [held, setHeld] = useState<Record<string, boolean>>({});

  if (caps && !caps.input) {
    return <Empty icon="⚠️" text="Keyboard control is not available on this PC (optional driver not installed)." />;
  }

  function key(k: string) { send({ type: 'key', key: k, action: 'press' }); }

  function toggleHold(k: string) {
    const isHeld = !!held[k];
    send({ type: 'key', key: k, action: isHeld ? 'up' : 'down' });
    setHeld((h) => ({ ...h, [k]: !isHeld }));
  }

  function sendText() {
    if (!text) return;
    send({ type: 'type_text', text });
    setText('');
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          className="input"
          placeholder="Type here, then Send…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendText(); }}
          enterKeyHint="send"
        />
        <button className="btn" onClick={sendText}>Send</button>
      </div>

      <div className="text-xs text-slate-500 mb-1">Modifiers (tap to hold)</div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {['CTRL', 'ALT', 'SHIFT', 'WIN'].map((m) => (
          <button key={m} onClick={() => toggleHold(m)}
            className={`key-btn ${held[m] ? 'held' : ''}`}>{m}{held[m] ? ' ●' : ''}</button>
        ))}
      </div>

      <div className="text-xs text-slate-500 mb-1">Special keys</div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {SPECIAL.map(([label, k]) => (
          <button key={k} className="key-btn" onClick={() => key(k)}>{label}</button>
        ))}
        {FKEYS.map((f) => (
          <button key={f} className="key-btn" onClick={() => key(f)}>{f}</button>
        ))}
      </div>

      <div className="text-xs text-slate-500 mb-1">Shortcuts</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {SHORTCUTS.map(([label, keys]) => (
          <button key={label} className="key-btn" onClick={() => send({ type: 'shortcut', keys })}>{label}</button>
        ))}
      </div>

      <div className="text-xs text-slate-500 mb-1">Volume &amp; media</div>
      <div className="grid grid-cols-6 gap-2">
        {MEDIA.map(([label, k]) => (
          <button key={k} className="key-btn text-lg" onClick={() => key(k)}>{label}</button>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-3">
        Held modifiers stay down until tapped again — release them when done.
      </p>
    </div>
  );
}
