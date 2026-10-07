import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../App';
import { fmtDate } from '../lib/format';
import { Modal, Field, Spinner } from '../components/ui';
export default function Settings() {
    const { toast, logout } = useApp();
    const [devices, setDevices] = useState([]);
    const [selfId, setSelfId] = useState('');
    const [shares, setShares] = useState([]);
    const [audit, setAudit] = useState([]);
    const [shareModal, setShareModal] = useState(false);
    const [busy, setBusy] = useState(false);
    const load = async () => {
        try {
            const d = await api('/api/devices');
            setDevices(d.devices);
            setSelfId(d.selfId);
            const s = await api('/api/settings');
            setShares(s.settings.shares);
            const a = await api('/api/audit');
            setAudit(a.entries);
        }
        catch (e) {
            toast(e.message);
        }
    };
    useEffect(() => { load(); }, []);
    async function revoke(id, name) {
        if (!confirm(`Revoke access for "${name}"?`))
            return;
        try {
            await api(`/api/devices/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
            toast('Device revoked ✓');
            load();
        }
        catch (e) {
            toast(e.message);
        }
    }
    async function disconnectAll() {
        if (!confirm('Disconnect ALL devices including this one?'))
            return;
        try {
            await api('/api/devices/disconnect-all', { method: 'POST' });
            logout();
        }
        catch (e) {
            toast(e.message);
        }
    }
    async function regenPin() {
        if (!confirm('Generate a new PIN? All devices will be disconnected.'))
            return;
        setBusy(true);
        try {
            const r = await api('/api/security/regenerate-pin', { method: 'POST' });
            alert(`New PIN: ${r.pin}\n\nAll devices were disconnected. Reconnect with the new PIN.`);
            logout();
        }
        catch (e) {
            toast(e.message);
        }
        finally {
            setBusy(false);
        }
    }
    async function removeShare(id) {
        if (!confirm('Stop sharing this folder?'))
            return;
        const next = shares.filter((s) => s.id !== id);
        try {
            await api('/api/settings', { method: 'PUT', body: JSON.stringify({ shares: next }) });
            setShares(next);
            toast('Folder removed from sharing ✓');
        }
        catch (e) {
            toast(e.message);
        }
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "card mb-3", children: [_jsxs("div", { className: "font-bold mb-2", children: ["\uD83D\uDCF1 Connected devices (", devices.length, ")"] }), devices.length === 0 && _jsx("div", { className: "text-sm text-slate-500", children: "No devices connected." }), devices.map((d) => (_jsxs("div", { className: "flex items-center justify-between py-2 border-t border-slate-800 first:border-0", children: [_jsxs("div", { children: [_jsxs("div", { className: "font-medium", children: [d.deviceName, " ", d.id === selfId && _jsx("span", { className: "text-xs text-accent", children: "(this device)" })] }), _jsxs("div", { className: "text-xs text-slate-500", children: [d.ip, " \u00B7 active ", fmtDate(d.lastSeen)] })] }), d.id !== selfId && (_jsx("button", { className: "btn-ghost !py-1.5 !px-3 text-sm !border-red-800 !text-red-400", onClick: () => revoke(d.id, d.deviceName), children: "Revoke" }))] }, d.id)))] }), _jsxs("div", { className: "card mb-3", children: [_jsx("div", { className: "font-bold mb-2", children: "\uD83D\uDD10 Security" }), _jsxs("div", { className: "grid gap-2", children: [_jsx("button", { className: "btn-ghost", onClick: regenPin, disabled: busy, children: busy ? _jsx(Spinner, {}) : '🔄 Regenerate PIN (disconnects everyone)' }), _jsx("button", { className: "btn-ghost !border-red-800 !text-red-400", onClick: disconnectAll, children: "\u26D4 Disconnect all devices" })] }), _jsx("p", { className: "text-xs text-slate-500 mt-2", children: "The PIN is shown only on the PC. Sessions expire after 24 hours. 5 wrong PINs lock an address out for 15 minutes." })] }), _jsxs("div", { className: "card mb-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("div", { className: "font-bold", children: "\uD83D\uDCC2 Shared folders" }), _jsx("button", { className: "btn-ghost !py-1.5 !px-3 text-sm", onClick: () => setShareModal(true), children: "\uFF0B Add" })] }), shares.map((s) => (_jsxs("div", { className: "py-2 border-t border-slate-800 first:border-0", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "font-medium", children: ["\uD83D\uDCC1 ", s.name] }), _jsx("button", { className: "text-sm text-red-400 px-2", onClick: () => removeShare(s.id), children: "Remove" })] }), _jsx("div", { className: "text-xs text-slate-500 font-mono break-all", children: s.path }), _jsx(PermToggles, { share: s, onChange: load })] }, s.id))), _jsx("p", { className: "text-xs text-slate-500 mt-2", children: "Only these folders are visible to connected phones. Nothing else on the PC can be reached." })] }), _jsxs("div", { className: "card mb-3", children: [_jsx("div", { className: "font-bold mb-2", children: "\uD83E\uDDFE Activity log" }), audit.length === 0 && _jsx("div", { className: "text-sm text-slate-500", children: "No activity yet." }), _jsx("div", { className: "max-h-64 overflow-y-auto text-sm", children: audit.slice(0, 60).map((e, i) => (_jsxs("div", { className: "py-1.5 border-t border-slate-800/60 first:border-0", children: [_jsx("span", { className: "text-slate-500 text-xs mr-2", children: e.time }), _jsx("span", { className: "font-medium", children: e.action }), _jsxs("span", { className: "text-slate-400", children: [" \u2014 ", e.detail] }), _jsxs("span", { className: "text-slate-600 text-xs ml-1", children: ["(", e.device, ")"] })] }, i))) })] }), _jsxs("div", { className: "card mb-3 text-sm text-slate-400", children: [_jsx("div", { className: "font-bold text-slate-200 mb-1", children: "\u2139\uFE0F About" }), "PC Remote v1.0.0 \u00B7 protocol v1", _jsx("br", {}), "Local network only \u2014 no cloud, no account, works with the internet off."] }), _jsx("button", { className: "btn-ghost w-full !border-red-800 !text-red-400", onClick: logout, children: "\uD83D\uDEAA Disconnect this device" }), shareModal && _jsx(AddShareModal, { shares: shares, onClose: () => setShareModal(false), onSaved: load })] }));
}
function PermToggles({ share, onChange }) {
    const { toast } = useApp();
    async function setPerm(key, v) {
        // Re-fetch full shares to avoid clobbering, then PUT.
        try {
            const s = await api('/api/settings');
            const next = s.settings.shares.map((x) => x.id === share.id ? { ...x, perms: { ...x.perms, [key]: v } } : x);
            await api('/api/settings', { method: 'PUT', body: JSON.stringify({ shares: next }) });
            onChange();
        }
        catch (e) {
            toast(e.message);
        }
    }
    const P = (k, label) => (_jsxs("label", { className: "flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: !!share.perms[k], onChange: (e) => setPerm(k, e.target.checked), className: "w-4 h-4 accent-sky-400" }), label] }));
    return (_jsxs("div", { className: "flex gap-4 mt-1.5", children: [P('read', 'Read'), " ", P('upload', 'Upload'), " ", P('del', 'Delete')] }));
}
function AddShareModal({ shares, onClose, onSaved }) {
    const { toast } = useApp();
    const [name, setName] = useState('');
    const [path, setPath] = useState('');
    const [busy, setBusy] = useState(false);
    async function save() {
        if (!name.trim() || !path.trim()) {
            toast('Enter a name and a folder path on the PC.');
            return;
        }
        setBusy(true);
        try {
            const next = [...shares, { name: name.trim(), path: path.trim(), perms: { read: true, upload: true, del: false } }];
            await api('/api/settings', { method: 'PUT', body: JSON.stringify({ shares: next }) });
            toast('Folder shared ✓');
            onSaved();
            onClose();
        }
        catch (e) {
            toast(e.message);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs(Modal, { title: "Share a folder", onClose: onClose, children: [_jsx(Field, { label: "Display name", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), placeholder: "e.g. Music" }) }), _jsx(Field, { label: "Folder path on the PC", children: _jsx("input", { className: "input font-mono", value: path, onChange: (e) => setPath(e.target.value), placeholder: navigator.platform.includes('Win') ? 'D:\\Media\\Music' : '/home/user/Music' }) }), _jsx("p", { className: "text-xs text-slate-500 mb-3", children: "The path must be a folder on the PC running the server. Only this folder (and what's inside it) becomes visible." }), _jsx("button", { className: "btn w-full", disabled: busy, onClick: save, children: busy ? _jsx(Spinner, {}) : 'Share folder' })] }));
}
