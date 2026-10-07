import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../App';
import { fmtBytes } from '../lib/format';
import { Empty } from '../components/ui';
export default function Remote() {
    const { caps, socket, toast } = useApp();
    const [tab, setTab] = useState('screen');
    // Send via WebSocket; fall back to HTTP when the socket is down.
    async function send(msg) {
        if (socket?.send(msg))
            return;
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
            }
            else if (t === 'key' || t === 'type_text' || t === 'shortcut') {
                await api('/api/control/keyboard', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: t === 'key' ? 'key' : t === 'type_text' ? 'type' : 'shortcut',
                        key: msg.key, mode: msg.action, text: msg.text, keys: msg.keys,
                    }),
                });
            }
        }
        catch (e) {
            toast(e.message);
        }
    }
    if (caps && !caps.input && !caps.screen) {
        return _jsx(Empty, { icon: "\u26A0\uFE0F", text: "Remote control drivers are not installed on this PC. See the README (optional dependencies) and restart the server." });
    }
    return (_jsxs("div", { children: [_jsx("div", { className: "grid grid-cols-3 gap-1 mb-3 p-1 rounded-2xl bg-panel border border-slate-800", children: [['screen', '🖥️ Screen'], ['mouse', '🖱️ Mouse'], ['keys', '⌨️ Keys']].map(([id, label]) => (_jsx("button", { onClick: () => setTab(id), className: `py-2 rounded-xl font-semibold text-sm ${tab === id ? 'bg-accent text-ink' : 'text-slate-400'}`, children: label }, id))) }), tab === 'screen' && _jsx(ScreenTab, { send: send }), tab === 'mouse' && _jsx(MouseTab, { send: send }), tab === 'keys' && _jsx(KeysTab, { send: send })] }));
}
/* ================= SCREEN ================= */
function ScreenTab({ send }) {
    const { caps, socket, toast } = useApp();
    const [streaming, setStreaming] = useState(false);
    const [quality, setQuality] = useState('balanced');
    const [frame, setFrame] = useState(null);
    const [frames, setFrames] = useState(0);
    const [bytes, setBytes] = useState(0);
    const t0 = useRef(0);
    const imgRef = useRef(null);
    // Subscribe to screen frames while this tab is mounted.
    useEffect(() => {
        if (!socket)
            return;
        socket.setFrameHandler((b64) => {
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
        if (!caps?.screen) {
            toast('Screen capture is not available on this PC.');
            return;
        }
        t0.current = Date.now();
        setFrames(0);
        setBytes(0);
        send({ type: 'screen_start', quality });
        setStreaming(true);
    }
    function stop() {
        send({ type: 'screen_stop' });
        setStreaming(false);
    }
    function tap(e) {
        const img = imgRef.current;
        if (!img || !streaming)
            return;
        const r = img.getBoundingClientRect();
        const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const nx = (cx - r.left) / r.width;
        const ny = (cy - r.top) / r.height;
        send({ type: 'mouse_abs', nx, ny });
        send({ type: 'mouse_click', button: 'left' });
    }
    const fps = frames && t0.current ? (frames / ((Date.now() - t0.current) / 1000)).toFixed(1) : '—';
    return (_jsxs("div", { children: [!caps?.screen && (_jsx("div", { className: "card mb-3 text-sm text-amber-300", children: "\u26A0\uFE0F Screen capture isn't available on this PC (optional driver not installed). Mouse & keyboard still work if their driver is present." })), _jsxs("div", { className: "flex gap-2 mb-2", children: [_jsxs("select", { className: "input !w-auto", value: quality, onChange: (e) => setQuality(e.target.value), disabled: streaming, children: [_jsx("option", { value: "low", children: "Low" }), _jsx("option", { value: "balanced", children: "Balanced" }), _jsx("option", { value: "high", children: "High" }), _jsx("option", { value: "ultra", children: "Ultra" })] }), !streaming
                        ? _jsx("button", { className: "btn flex-1", onClick: start, disabled: !caps?.screen, children: "\u25B6 Start screen" })
                        : _jsx("button", { className: "btn-ghost flex-1 !border-red-800 !text-red-400", onClick: stop, children: "\u23F9 Stop" })] }), _jsxs("div", { className: "card !p-1 relative", children: [frame
                        ? _jsx("img", { ref: imgRef, src: 'data:image/jpeg;base64,' + frame, alt: "PC screen", className: "w-full rounded-xl bg-black select-none", draggable: false, onClick: tap, style: { touchAction: 'manipulation' } })
                        : _jsx("div", { className: "py-16 text-center text-slate-500", children: streaming ? 'Waiting for frames…' : 'Press Start to view the PC screen.' }), streaming && (_jsxs("div", { className: "absolute top-3 left-3 text-xs bg-black/70 rounded-lg px-2 py-1", children: [fps, " fps \u00B7 ", fmtBytes(bytes)] }))] }), _jsx("p", { className: "text-xs text-slate-500 mt-2", children: "Tip: tap the screen to click. Use the Mouse tab for the touchpad." })] }));
}
/* ================= MOUSE ================= */
function MouseTab({ send }) {
    const { caps, toast } = useApp();
    const [sens, setSens] = useState(1.5);
    const [dragMode, setDragMode] = useState(false);
    const pad = useRef(null);
    const st = useRef({
        pointers: new Map(),
        lastSingle: { x: 0, y: 0 },
        downAt: 0, moved: 0, lastTapAt: 0,
        dragging: false,
        lastScrollY: 0,
    });
    if (caps && !caps.input) {
        return _jsx(Empty, { icon: "\u26A0\uFE0F", text: "Mouse control is not available on this PC (optional driver not installed)." });
    }
    function onPointerDown(e) {
        e.target.setPointerCapture?.(e.pointerId);
        const s = st.current;
        s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (s.pointers.size === 1) {
            s.lastSingle = { x: e.clientX, y: e.clientY };
            s.downAt = Date.now();
            s.moved = 0;
            if (dragMode && !s.dragging) {
                send({ type: 'mouse_down', button: 'left' });
                s.dragging = true;
            }
        }
        else if (s.pointers.size === 2) {
            const ys = [...s.pointers.values()].map((p) => p.y);
            s.lastScrollY = (ys[0] + ys[1]) / 2;
        }
    }
    function onPointerMove(e) {
        const s = st.current;
        const prev = s.pointers.get(e.pointerId);
        if (!prev)
            return;
        const dx = (e.clientX - prev.x) * sens;
        const dy = (e.clientY - prev.y) * sens;
        s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        s.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
        if (s.pointers.size === 1) {
            send({ type: 'mouse_move', dx: Math.round(dx), dy: Math.round(dy) });
        }
        else if (s.pointers.size === 2) {
            const ys = [...s.pointers.values()].map((p) => p.y);
            const midY = (ys[0] + ys[1]) / 2;
            const sdy = (midY - s.lastScrollY) * -3 * sens;
            s.lastScrollY = midY;
            if (Math.abs(sdy) > 2)
                send({ type: 'scroll', dx: 0, dy: Math.round(sdy) });
        }
    }
    function onPointerUp(e) {
        const s = st.current;
        const wasCount = s.pointers.size;
        s.pointers.delete(e.pointerId);
        const quick = Date.now() - s.downAt < 350;
        const still = s.moved < 12;
        if (s.dragging && wasCount === 1) {
            send({ type: 'mouse_up', button: 'left' });
            s.dragging = false;
        }
        else if (wasCount === 1 && quick && still && !dragMode) {
            const now = Date.now();
            if (now - s.lastTapAt < 350) {
                send({ type: 'mouse_dblclick' });
                s.lastTapAt = 0;
            }
            else {
                send({ type: 'mouse_click', button: 'left' });
                s.lastTapAt = now;
            }
        }
        else if (wasCount === 2 && quick && still) {
            send({ type: 'mouse_click', button: 'right' });
        }
        if (s.pointers.size === 0) {
            s.moved = 0;
        }
    }
    return (_jsxs("div", { children: [_jsx("div", { ref: pad, className: `touchpad h-64 flex items-center justify-center ${dragMode ? '!border-accent' : ''}`, onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onPointerCancel: onPointerUp, onContextMenu: (e) => e.preventDefault(), children: _jsxs("div", { className: "text-center text-slate-500 pointer-events-none", children: [_jsx("div", { className: "text-3xl mb-1", children: "\uD83D\uDC46" }), _jsx("div", { className: "text-sm px-6", children: dragMode ? 'Drag mode: touch & move to drag' : 'Move: 1 finger · Click: tap · Right-click: 2-finger tap · Scroll: 2-finger slide' })] }) }), _jsxs("div", { className: "flex gap-2 mt-2", children: [_jsx("button", { className: "btn-ghost flex-1", onClick: () => send({ type: 'mouse_click', button: 'left' }), children: "LEFT" }), _jsx("button", { className: `flex-1 rounded-xl px-4 py-2.5 font-semibold border active:scale-[.98] transition ${dragMode ? 'bg-accent text-ink border-accent' : 'btn-ghost'}`, onClick: () => { setDragMode(!dragMode); toast(dragMode ? 'Drag mode off' : 'Drag mode on — touch the pad and move'); }, children: "\u2725 DRAG" }), _jsx("button", { className: "btn-ghost flex-1", onClick: () => send({ type: 'mouse_click', button: 'right' }), children: "RIGHT" })] }), _jsxs("div", { className: "flex gap-2 mt-2", children: [_jsx("button", { className: "btn-ghost flex-1", onClick: () => send({ type: 'scroll', dx: 0, dy: 240 }), children: "\u25B2 Scroll" }), _jsx("button", { className: "btn-ghost flex-1", onClick: () => send({ type: 'scroll', dx: 0, dy: -240 }), children: "\u25BC Scroll" })] }), _jsxs("div", { className: "card mt-3", children: [_jsxs("div", { className: "flex justify-between text-sm mb-1", children: [_jsx("span", { children: "Pointer speed" }), _jsxs("span", { className: "text-slate-400", children: [sens.toFixed(1), "\u00D7"] })] }), _jsx("input", { type: "range", min: 0.5, max: 4, step: 0.1, value: sens, onChange: (e) => setSens(Number(e.target.value)), className: "w-full accent-sky-400" })] })] }));
}
/* ================= KEYBOARD ================= */
const SPECIAL = [
    ['ESC', 'ESC'], ['TAB', 'TAB'], ['⌫', 'BACKSPACE'], ['DEL', 'DELETE'],
    ['HOME', 'HOME'], ['END', 'END'], ['▲', 'UP'], ['▼', 'DOWN'],
    ['◀', 'LEFT'], ['▶', 'RIGHT'], ['PG↑', 'PAGEUP'], ['PG↓', 'PAGEDOWN'],
    ['⏎', 'ENTER'], ['SPACE', 'SPACE'],
];
const FKEYS = Array.from({ length: 12 }, (_, i) => 'F' + (i + 1));
const SHORTCUTS = [
    ['Copy', ['CTRL', 'C']], ['Paste', ['CTRL', 'V']], ['Cut', ['CTRL', 'X']],
    ['Undo', ['CTRL', 'Z']], ['Select all', ['CTRL', 'A']], ['Save', ['CTRL', 'S']],
    ['Alt+Tab', ['ALT', 'TAB']], ['Win+D', ['WIN', 'D']],
    ['Task Mgr', ['CTRL', 'SHIFT', 'ESC']], ['Close win', ['ALT', 'F4']],
];
const MEDIA = [
    ['🔉', 'VOL_DOWN'], ['🔊', 'VOL_UP'], ['🔇', 'VOL_MUTE'],
    ['⏯', 'MEDIA_PLAY_PAUSE'], ['⏭', 'MEDIA_NEXT'], ['⏮', 'MEDIA_PREV'],
];
function KeysTab({ send }) {
    const { caps } = useApp();
    const [text, setText] = useState('');
    const [held, setHeld] = useState({});
    if (caps && !caps.input) {
        return _jsx(Empty, { icon: "\u26A0\uFE0F", text: "Keyboard control is not available on this PC (optional driver not installed)." });
    }
    function key(k) { send({ type: 'key', key: k, action: 'press' }); }
    function toggleHold(k) {
        const isHeld = !!held[k];
        send({ type: 'key', key: k, action: isHeld ? 'up' : 'down' });
        setHeld((h) => ({ ...h, [k]: !isHeld }));
    }
    function sendText() {
        if (!text)
            return;
        send({ type: 'type_text', text });
        setText('');
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex gap-2 mb-2", children: [_jsx("input", { className: "input", placeholder: "Type here, then Send\u2026", value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                            sendText(); }, enterKeyHint: "send" }), _jsx("button", { className: "btn", onClick: sendText, children: "Send" })] }), _jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Modifiers (tap to hold)" }), _jsx("div", { className: "grid grid-cols-4 gap-2 mb-3", children: ['CTRL', 'ALT', 'SHIFT', 'WIN'].map((m) => (_jsxs("button", { onClick: () => toggleHold(m), className: `key-btn ${held[m] ? 'held' : ''}`, children: [m, held[m] ? ' ●' : ''] }, m))) }), _jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Special keys" }), _jsxs("div", { className: "grid grid-cols-4 gap-2 mb-3", children: [SPECIAL.map(([label, k]) => (_jsx("button", { className: "key-btn", onClick: () => key(k), children: label }, k))), FKEYS.map((f) => (_jsx("button", { className: "key-btn", onClick: () => key(f), children: f }, f)))] }), _jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Shortcuts" }), _jsx("div", { className: "grid grid-cols-2 gap-2 mb-3", children: SHORTCUTS.map(([label, keys]) => (_jsx("button", { className: "key-btn", onClick: () => send({ type: 'shortcut', keys }), children: label }, label))) }), _jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Volume & media" }), _jsx("div", { className: "grid grid-cols-6 gap-2", children: MEDIA.map(([label, k]) => (_jsx("button", { className: "key-btn text-lg", onClick: () => key(k), children: label }, k))) }), _jsx("p", { className: "text-xs text-slate-500 mt-3", children: "Held modifiers stay down until tapped again \u2014 release them when done." })] }));
}
