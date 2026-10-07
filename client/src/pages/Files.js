import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fileUrl, uploadFile, downloadWithProgress } from '../lib/api';
import { useApp } from '../App';
import { fmtBytes, fmtDate, fmtSpeed, kindOf, kindIcon, isPreviewableImage, isStreamableVideo, extOf } from '../lib/format';
import { Modal, ProgressBar, Empty, Field, Spinner } from '../components/ui';
const BIG_FILE = 200 * 1024 * 1024; // above this, hand off to the browser's downloader
export default function Files() {
    const { toast, setLastSpeed, lastSpeed } = useApp();
    const [shares, setShares] = useState([]);
    const [shareId, setShareId] = useState('');
    const [path, setPath] = useState('');
    const [items, setItems] = useState([]);
    const [perms, setPerms] = useState({ read: true, upload: false, del: false });
    const [loading, setLoading] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const [searching, setSearching] = useState(false);
    const [actionItem, setActionItem] = useState(null);
    const [viewer, setViewer] = useState(null);
    const [infoItem, setInfoItem] = useState(null);
    const [renameItem, setRenameItem] = useState(null);
    const [mkdirOpen, setMkdirOpen] = useState(false);
    const [dl, setDl] = useState(null);
    const [uploads, setUploads] = useState([]);
    const fileInput = useRef(null);
    const loadShares = useCallback(async () => {
        try {
            const r = await api('/api/shares');
            setShares(r.shares);
            if (!shareId && r.shares.length)
                setShareId(r.shares[0].id);
        }
        catch (e) {
            toast(e.message);
        }
    }, [shareId, toast]);
    useEffect(() => { loadShares(); }, [loadShares]);
    const loadDir = useCallback(async (sid, p) => {
        if (!sid)
            return;
        setLoading(true);
        try {
            const r = await api(`/api/files?share=${encodeURIComponent(sid)}&path=${encodeURIComponent(p)}`);
            setItems(r.items);
            setPerms(r.share.perms);
            setSearching(false);
        }
        catch (e) {
            toast(e.message);
        }
        finally {
            setLoading(false);
        }
    }, [toast]);
    useEffect(() => { loadDir(shareId, path); }, [shareId, path, loadDir]);
    const crumbs = path ? path.split('/') : [];
    async function doSearch() {
        if (!searchQ.trim()) {
            loadDir(shareId, path);
            return;
        }
        setSearching(true);
        try {
            const r = await api(`/api/files/search?share=${encodeURIComponent(shareId)}&q=${encodeURIComponent(searchQ.trim())}&in=${encodeURIComponent(path)}`);
            setItems(r.items);
        }
        catch (e) {
            toast(e.message);
        }
        finally {
            setSearching(false);
        }
    }
    function openItem(it) {
        if (it.isDir) {
            setSearchQ('');
            setPath(it.path);
        }
        else if (isPreviewableImage(it.name) || isStreamableVideo(it.name) || ['mp3', 'wav', 'ogg', 'm4a'].includes(extOf(it.name))) {
            setViewer(it);
        }
        else
            setActionItem(it);
    }
    /* ---------- downloads ---------- */
    async function download(it) {
        setActionItem(null);
        const url = fileUrl('/api/files/download', { share: shareId, path: it.path });
        if (it.size > BIG_FILE) {
            // Let the browser stream huge files straight to disk (no RAM blowup).
            const a = document.createElement('a');
            a.href = url;
            a.download = it.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast('Large file — downloading via the browser.');
            return;
        }
        const t0 = Date.now();
        setDl({ name: it.name, loaded: 0, total: it.size, speed: 0 });
        try {
            await downloadWithProgress(url, it.name, (loaded, total) => {
                const dt = Math.max(1, (Date.now() - t0) / 1000);
                setDl({ name: it.name, loaded, total, speed: loaded / dt });
            });
            setLastSpeed({ up: lastSpeed?.up || 0, down: it.size / Math.max(1, (Date.now() - t0) / 1000) });
            toast('Download complete ✓');
        }
        catch (e) {
            if (e.code !== 'EABORT')
                toast('Download failed: ' + e.message);
        }
        finally {
            setDl(null);
        }
    }
    async function downloadZip(it) {
        setActionItem(null);
        const a = document.createElement('a');
        a.href = fileUrl('/api/files/zip', { share: shareId, path: it.path });
        a.download = it.name + '.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast('Preparing ZIP… the download will start shortly.');
    }
    const upId = useRef(0);
    function queueUpload(list) {
        if (!list || !list.length)
            return;
        for (const f of Array.from(list)) {
            const id = ++upId.current;
            const ctrl = new AbortController();
            const up = { id, file: f, loaded: 0, total: f.size, status: 'active', ctrl, speed: 0 };
            setUploads((u) => [...u, up]);
            runUpload(up);
        }
    }
    async function runUpload(up) {
        const t0 = Date.now();
        try {
            await uploadFile(shareId, path, up.file, false, {
                signal: up.ctrl.signal,
                onProgress: (loaded, total) => {
                    const dt = Math.max(0.5, (Date.now() - t0) / 1000);
                    setUploads((us) => us.map((x) => x.id === up.id ? { ...x, loaded, total, speed: loaded / dt } : x));
                },
            });
            const dt = Math.max(1, (Date.now() - t0) / 1000);
            setLastSpeed({ up: up.file.size / dt, down: lastSpeed?.down || 0 });
            setUploads((us) => us.map((x) => x.id === up.id ? { ...x, status: 'done', loaded: x.total } : x));
            loadDir(shareId, path);
        }
        catch (e) {
            setUploads((us) => us.map((x) => x.id === up.id
                ? { ...x, status: e.code === 'EABORT' ? 'cancelled' : 'error', error: e.message } : x));
        }
    }
    function retryUpload(up) {
        const ctrl = new AbortController();
        const next = { ...up, ctrl, status: 'active', loaded: 0, error: undefined };
        setUploads((us) => us.map((x) => x.id === up.id ? next : x));
        runUpload(next);
    }
    /* ---------- mutations ---------- */
    async function doMkdir(name) {
        try {
            await api('/api/files/mkdir', { method: 'POST', body: JSON.stringify({ share: shareId, dir: path, name }) });
            setMkdirOpen(false);
            loadDir(shareId, path);
            toast('Folder created ✓');
        }
        catch (e) {
            toast(e.message);
        }
    }
    async function doRename(it, newName) {
        try {
            await api('/api/files/rename', { method: 'POST', body: JSON.stringify({ share: shareId, path: it.path, newName }) });
            setRenameItem(null);
            setActionItem(null);
            loadDir(shareId, path);
            toast('Renamed ✓');
        }
        catch (e) {
            toast(e.message);
        }
    }
    async function doDelete(it) {
        if (!confirm(`Delete "${it.name}"${it.isDir ? ' and everything inside it' : ''}?`))
            return;
        try {
            await api(`/api/files?share=${encodeURIComponent(shareId)}&path=${encodeURIComponent(it.path)}`, { method: 'DELETE' });
            setActionItem(null);
            loadDir(shareId, path);
            toast('Deleted ✓');
        }
        catch (e) {
            toast(e.message);
        }
    }
    async function showInfo(it) {
        try {
            const r = await api(`/api/files/info?share=${encodeURIComponent(shareId)}&path=${encodeURIComponent(it.path)}`);
            setInfoItem(r.file);
        }
        catch (e) {
            toast(e.message);
        }
    }
    const share = shares.find((s) => s.id === shareId);
    return (_jsxs("div", { children: [_jsx("div", { className: "flex gap-2 overflow-x-auto pb-2 mb-1", children: shares.map((s) => (_jsxs("button", { className: `whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold border ${s.id === shareId ? 'bg-accent text-ink border-accent' : 'border-slate-700 text-slate-300'}`, onClick: () => { setShareId(s.id); setPath(''); setSearchQ(''); }, children: ["\uD83D\uDCC1 ", s.name] }, s.id))) }), _jsxs("div", { className: "flex gap-2 mb-2", children: [_jsx("input", { className: "input", placeholder: "\uD83D\uDD0D Search files\u2026 (*.jpg, resume.pdf)", value: searchQ, onChange: (e) => setSearchQ(e.target.value), onKeyDown: (e) => e.key === 'Enter' && doSearch() }), _jsx("button", { className: "btn-ghost !px-3", onClick: doSearch, children: "Go" })] }), _jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-1 text-sm overflow-x-auto whitespace-nowrap", children: [_jsx("button", { className: "text-accent font-semibold", onClick: () => { setPath(''); setSearchQ(''); }, children: share?.name || '…' }), crumbs.map((c, i) => (_jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-slate-500", children: "/" }), _jsx("button", { className: "text-accent", onClick: () => setPath(crumbs.slice(0, i + 1).join('/')), children: c })] }, i)))] }), _jsx("div", { className: "flex gap-1", children: perms.upload && (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn-ghost !px-3 !py-1.5 text-sm", onClick: () => setMkdirOpen(true), title: "New folder", children: "\uFF0B\uD83D\uDCC1" }), _jsx("button", { className: "btn-ghost !px-3 !py-1.5 text-sm", onClick: () => fileInput.current?.click(), title: "Upload", children: "\u2934\uFE0F" })] })) })] }), _jsx("input", { ref: fileInput, type: "file", multiple: true, className: "hidden", onChange: (e) => { queueUpload(e.target.files); e.target.value = ''; } }), uploads.length > 0 && (_jsxs("div", { className: "card mb-2 !p-3", children: [_jsx("div", { className: "font-bold text-sm mb-2", children: "Uploads" }), uploads.slice(-4).map((u) => (_jsxs("div", { className: "mb-2 text-sm", children: [_jsxs("div", { className: "flex justify-between items-center gap-2", children: [_jsx("span", { className: "truncate", children: u.file.name }), _jsx("span", { className: "text-xs text-slate-400 whitespace-nowrap", children: u.status === 'done' ? '✓' : u.status === 'error' ? '✗' : u.status === 'cancelled' ? '—' : `${Math.round((u.loaded / Math.max(1, u.total)) * 100)}% · ${fmtSpeed(u.speed)}` })] }), _jsx(ProgressBar, { pct: (u.loaded / Math.max(1, u.total)) * 100 }), _jsxs("div", { className: "flex gap-2 mt-1", children: [u.status === 'active' && _jsx("button", { className: "text-xs text-red-400", onClick: () => u.ctrl.abort(), children: "Cancel" }), (u.status === 'error' || u.status === 'cancelled') && (_jsx("button", { className: "text-xs text-accent", onClick: () => retryUpload(u), children: "Retry" })), (u.status === 'done' || u.status === 'error' || u.status === 'cancelled') && (_jsx("button", { className: "text-xs text-slate-500", onClick: () => setUploads((us) => us.filter((x) => x.id !== u.id)), children: "Dismiss" }))] }), u.error && _jsx("div", { className: "text-xs text-red-400", children: u.error })] }, u.id)))] })), _jsxs("div", { className: "card !p-2", children: [loading && _jsx("div", { className: "p-6 text-center", children: _jsx(Spinner, {}) }), !loading && items.length === 0 && _jsx(Empty, { icon: "\uD83D\uDCC2", text: searching ? 'No matches.' : 'This folder is empty.' }), items.map((it) => {
                        const k = kindOf(it.name, it.isDir);
                        return (_jsxs("div", { className: "flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-slate-800/60 border-b border-slate-800/50 last:border-0", onClick: () => openItem(it), onContextMenu: (e) => { e.preventDefault(); setActionItem(it); }, children: [_jsx("span", { className: "text-2xl", children: kindIcon(k) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "truncate font-medium", children: it.name }), _jsxs("div", { className: "text-xs text-slate-500", children: [it.isDir ? 'Folder' : fmtBytes(it.size), " \u00B7 ", fmtDate(it.mtime)] })] }), _jsx("button", { className: "text-xl px-2 text-slate-400", onClick: (e) => { e.stopPropagation(); setActionItem(it); }, children: "\u22EE" })] }, it.path));
                    })] }), actionItem && (_jsx(Modal, { title: actionItem.name, onClose: () => setActionItem(null), children: _jsxs("div", { className: "grid gap-2", children: [actionItem.isDir
                            ? _jsx(ActionBtn, { icon: "\uD83D\uDCC2", label: "Open", onClick: () => { setPath(actionItem.path); setActionItem(null); } })
                            : _jsxs(_Fragment, { children: [_jsx(ActionBtn, { icon: "\u2B07\uFE0F", label: "Download", onClick: () => download(actionItem) }), (isPreviewableImage(actionItem.name) || isStreamableVideo(actionItem.name)) &&
                                        _jsx(ActionBtn, { icon: "\uD83D\uDC41\uFE0F", label: "Preview", onClick: () => { setViewer(actionItem); setActionItem(null); } })] }), actionItem.isDir && _jsx(ActionBtn, { icon: "\uD83D\uDCE6", label: "Download as ZIP", onClick: () => downloadZip(actionItem) }), _jsx(ActionBtn, { icon: "\u2139\uFE0F", label: "Info", onClick: () => { showInfo(actionItem); setActionItem(null); } }), perms.upload && _jsx(ActionBtn, { icon: "\u270F\uFE0F", label: "Rename", onClick: () => setRenameItem(actionItem) }), perms.del && _jsx(ActionBtn, { icon: "\uD83D\uDDD1\uFE0F", label: "Delete", danger: true, onClick: () => doDelete(actionItem) })] }) })), viewer && (_jsx(Modal, { title: viewer.name, onClose: () => setViewer(null), wide: true, children: _jsx(ViewerView, { item: viewer, shareId: shareId, onDownload: () => download(viewer), onDelete: perms.del ? () => { setViewer(null); doDelete(viewer); } : undefined }) })), infoItem && (_jsxs(Modal, { title: "File info", onClose: () => setInfoItem(null), children: [_jsx(InfoRow, { k: "Name", v: infoItem.name }), _jsx(InfoRow, { k: "Type", v: infoItem.isDir ? 'Folder' : extOf(infoItem.name).toUpperCase() || 'File' }), _jsx(InfoRow, { k: "Size", v: infoItem.isDir ? '—' : fmtBytes(infoItem.size) }), _jsx(InfoRow, { k: "Modified", v: fmtDate(infoItem.mtime) }), _jsx(InfoRow, { k: "Path", v: infoItem.path, mono: true })] })), renameItem && (_jsx(NameModal, { title: `Rename "${renameItem.name}"`, initial: renameItem.name, onClose: () => { setRenameItem(null); setActionItem(null); }, onOk: (n) => doRename(renameItem, n) })), mkdirOpen && (_jsx(NameModal, { title: "New folder", initial: "", placeholder: "Folder name", onClose: () => setMkdirOpen(false), onOk: doMkdir })), dl && (_jsxs(Modal, { title: "Downloading\u2026", onClose: () => { }, children: [_jsx("div", { className: "font-medium truncate mb-2", children: dl.name }), _jsx(ProgressBar, { pct: (dl.loaded / Math.max(1, dl.total)) * 100 }), _jsxs("div", { className: "flex justify-between text-sm text-slate-400 mt-2", children: [_jsxs("span", { children: [Math.round((dl.loaded / Math.max(1, dl.total)) * 100), "%"] }), _jsx("span", { children: fmtSpeed(dl.speed) })] }), _jsxs("div", { className: "text-xs text-slate-500 mt-1", children: [fmtBytes(dl.loaded), " of ", fmtBytes(dl.total)] })] }))] }));
}
function ActionBtn({ icon, label, onClick, danger }) {
    return (_jsxs("button", { onClick: onClick, className: `w-full text-left px-4 py-3 rounded-xl border font-semibold active:scale-[.99] transition ${danger ? 'border-red-800 text-red-400' : 'border-slate-700'}`, children: [_jsx("span", { className: "mr-2", children: icon }), label] }));
}
function InfoRow({ k, v, mono }) {
    return (_jsxs("div", { className: "flex justify-between gap-4 py-2 border-b border-slate-800 last:border-0 text-sm", children: [_jsx("span", { className: "text-slate-400", children: k }), _jsx("span", { className: `text-right break-all ${mono ? 'font-mono text-xs' : ''}`, children: v })] }));
}
function NameModal({ title, initial, placeholder, onClose, onOk }) {
    const [v, setV] = useState(initial);
    return (_jsxs(Modal, { title: title, onClose: onClose, children: [_jsx(Field, { label: "Name", children: _jsx("input", { className: "input", value: v, placeholder: placeholder, onChange: (e) => setV(e.target.value), autoFocus: true, onKeyDown: (e) => e.key === 'Enter' && v.trim() && onOk(v.trim()) }) }), _jsx("button", { className: "btn w-full", disabled: !v.trim(), onClick: () => onOk(v.trim()), children: "OK" })] }));
}
function ViewerView({ item, shareId, onDownload, onDelete }) {
    const url = fileUrl('/api/files/stream', { share: shareId, path: item.path });
    const e = extOf(item.name);
    return (_jsxs("div", { children: [isPreviewableImage(item.name) && (_jsx("img", { src: url, alt: item.name, className: "max-h-[60vh] mx-auto rounded-lg object-contain bg-black" })), isStreamableVideo(item.name) && (_jsx("video", { src: url, controls: true, playsInline: true, preload: "metadata", className: "w-full max-h-[60vh] rounded-lg bg-black" })), ['mp3', 'wav', 'ogg', 'm4a'].includes(e) && (_jsx("audio", { src: url, controls: true, className: "w-full mt-4" })), _jsxs("div", { className: "flex gap-2 mt-4", children: [_jsx("button", { className: "btn flex-1", onClick: onDownload, children: "\u2B07\uFE0F Download" }), onDelete && (_jsx("button", { className: "btn-ghost flex-1 !border-red-800 !text-red-400", onClick: onDelete, children: "\uD83D\uDDD1\uFE0F Delete" }))] }), _jsx("div", { className: "text-xs text-slate-500 mt-2 text-center", children: fmtBytes(item.size) })] }));
}
