import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp, nav } from '../App';
import { fmtBytes, fmtSpeed } from '../lib/format';
import { Spinner } from '../components/ui';
export default function Dashboard() {
    const { pcName, caps, conn, latency, lastSpeed, toast } = useApp();
    const [shares, setShares] = useState([]);
    const [storage, setStorage] = useState([]);
    useEffect(() => {
        api('/api/shares').then((r) => setShares(r.shares)).catch(() => { });
        api('/api/storage').then((r) => setStorage(r.drives || [])).catch(() => { });
    }, []);
    const tiles = [
        { icon: '📁', title: 'Files', desc: 'Browse, download & upload', to: '/files' },
        { icon: '🖥️', title: 'Remote', desc: 'Screen, mouse & keyboard', to: '/remote' },
    ];
    return (_jsxs("div", { children: [_jsxs("div", { className: "card mb-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 font-bold text-lg", children: [_jsx("span", { children: conn === 'connected' ? '🟢' : conn === 'reconnecting' ? '🟡' : '🔴' }), conn === 'connected' ? 'Connected' : conn === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'] }), _jsxs("div", { className: "text-sm text-slate-400", children: ["PC: ", pcName] })] }), _jsx("button", { className: "btn-ghost !py-2 text-sm", onClick: () => { toast('Refreshing…'); location.reload(); }, children: "\u21BB" })] }), _jsxs("div", { className: "grid grid-cols-3 gap-2 mt-3 text-center text-sm", children: [_jsx(Stat, { label: "Latency", value: latency != null ? `${latency} ms` : '—' }), _jsx(Stat, { label: "Upload", value: lastSpeed ? fmtSpeed(lastSpeed.up) : '—' }), _jsx(Stat, { label: "Download", value: lastSpeed ? fmtSpeed(lastSpeed.down) : '—' })] }), caps && (_jsxs("div", { className: "text-xs text-slate-500 mt-3", children: [!caps.input && '⚠️ Remote mouse/keyboard not available on this PC (optional driver missing). ', !caps.screen && '⚠️ Screen capture not available on this PC (optional driver missing).', caps.input && caps.screen && '✓ Full remote control available.'] }))] }), _jsx("div", { className: "grid grid-cols-2 gap-3 mb-3", children: tiles.map((t) => (_jsxs("button", { className: "card text-left active:scale-[.98] transition", onClick: () => nav(t.to), children: [_jsx("div", { className: "text-3xl mb-1", children: t.icon }), _jsx("div", { className: "font-bold", children: t.title }), _jsx("div", { className: "text-xs text-slate-400", children: t.desc })] }, t.title))) }), _jsxs("div", { className: "card mb-3", children: [_jsx("div", { className: "font-bold mb-2", children: "\uD83D\uDCC2 Shared folders" }), shares.length === 0 && _jsxs("div", { className: "text-sm text-slate-500", children: [_jsx(Spinner, {}), " Loading\u2026"] }), shares.map((s) => (_jsxs("button", { className: "w-full text-left py-2 border-t border-slate-800 first:border-0 flex justify-between items-center", onClick: () => nav('/files'), children: [_jsxs("span", { children: ["\uD83D\uDCC1 ", s.name] }), _jsxs("span", { className: "text-xs text-slate-500", children: [s.perms.read ? '↓' : '', s.perms.upload ? '↑' : '', s.perms.del ? '🗑' : ''] })] }, s.id)))] }), storage.length > 0 && (_jsxs("div", { className: "card", children: [_jsx("div", { className: "font-bold mb-2", children: "\uD83D\uDCBE PC Storage" }), storage.slice(0, 4).map((d) => {
                        const pct = d.total ? Math.round((d.used / d.total) * 100) : 0;
                        return (_jsxs("div", { className: "mb-2", children: [_jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "font-mono", children: d.name }), _jsxs("span", { className: "text-slate-400", children: [fmtBytes(d.free), " free of ", fmtBytes(d.total)] })] }), _jsx("div", { className: "h-2 rounded-full bg-slate-700/60 overflow-hidden mt-1", children: _jsx("div", { className: "h-full bg-accent rounded-full", style: { width: `${pct}%` } }) })] }, d.name));
                    })] }))] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { className: "rounded-xl bg-slate-800/50 py-2", children: [_jsx("div", { className: "text-xs text-slate-400", children: label }), _jsx("div", { className: "font-bold", children: value })] }));
}
