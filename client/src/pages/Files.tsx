import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fileUrl, uploadFile, downloadWithProgress } from '../lib/api';
import { useApp } from '../App';
import { fmtBytes, fmtDate, fmtSpeed, kindOf, kindIcon, isPreviewableImage, isStreamableVideo, extOf } from '../lib/format';
import { Modal, ProgressBar, Empty, Field, Spinner } from '../components/ui';

interface Item { name: string; path: string; isDir: boolean; size: number; mtime: number; }
interface Share { id: string; name: string; perms: { read: boolean; upload: boolean; del: boolean }; }

const BIG_FILE = 200 * 1024 * 1024; // above this, hand off to the browser's downloader

export default function Files() {
  const { toast, setLastSpeed, lastSpeed } = useApp();
  const [shares, setShares] = useState<Share[]>([]);
  const [shareId, setShareId] = useState('');
  const [path, setPath] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [perms, setPerms] = useState({ read: true, upload: false, del: false });
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [actionItem, setActionItem] = useState<Item | null>(null);
  const [viewer, setViewer] = useState<Item | null>(null);
  const [infoItem, setInfoItem] = useState<any>(null);
  const [renameItem, setRenameItem] = useState<Item | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [dl, setDl] = useState<{ name: string; loaded: number; total: number; speed: number } | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadShares = useCallback(async () => {
    try {
      const r: any = await api('/api/shares');
      setShares(r.shares);
      if (!shareId && r.shares.length) setShareId(r.shares[0].id);
    } catch (e: any) { toast(e.message); }
  }, [shareId, toast]);

  useEffect(() => { loadShares(); }, [loadShares]);

  const loadDir = useCallback(async (sid: string, p: string) => {
    if (!sid) return;
    setLoading(true);
    try {
      const r: any = await api(`/api/files?share=${encodeURIComponent(sid)}&path=${encodeURIComponent(p)}`);
      setItems(r.items);
      setPerms(r.share.perms);
      setSearching(false);
    } catch (e: any) { toast(e.message); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadDir(shareId, path); }, [shareId, path, loadDir]);

  const crumbs = path ? path.split('/') : [];

  async function doSearch() {
    if (!searchQ.trim()) { loadDir(shareId, path); return; }
    setSearching(true);
    try {
      const r: any = await api(
        `/api/files/search?share=${encodeURIComponent(shareId)}&q=${encodeURIComponent(searchQ.trim())}&in=${encodeURIComponent(path)}`);
      setItems(r.items);
    } catch (e: any) { toast(e.message); }
    finally { setSearching(false); }
  }

  function openItem(it: Item) {
    if (it.isDir) { setSearchQ(''); setPath(it.path); }
    else if (isPreviewableImage(it.name) || isStreamableVideo(it.name) || ['mp3', 'wav', 'ogg', 'm4a'].includes(extOf(it.name))) {
      setViewer(it);
    } else setActionItem(it);
  }

  /* ---------- downloads ---------- */
  async function download(it: Item) {
    setActionItem(null);
    const url = fileUrl('/api/files/download', { share: shareId, path: it.path });
    if (it.size > BIG_FILE) {
      // Let the browser stream huge files straight to disk (no RAM blowup).
      const a = document.createElement('a');
      a.href = url; a.download = it.name;
      document.body.appendChild(a); a.click(); a.remove();
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
    } catch (e: any) {
      if (e.code !== 'EABORT') toast('Download failed: ' + e.message);
    } finally { setDl(null); }
  }

  async function downloadZip(it: Item) {
    setActionItem(null);
    const a = document.createElement('a');
    a.href = fileUrl('/api/files/zip', { share: shareId, path: it.path });
    a.download = it.name + '.zip';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Preparing ZIP… the download will start shortly.');
  }

  /* ---------- uploads ---------- */
  interface Upload { id: number; file: File; loaded: number; total: number; status: 'active' | 'done' | 'error' | 'cancelled'; error?: string; ctrl: AbortController; speed: number; }
  const upId = useRef(0);

  function queueUpload(list: FileList | null) {
    if (!list || !list.length) return;
    for (const f of Array.from(list)) {
      const id = ++upId.current;
      const ctrl = new AbortController();
      const up: Upload = { id, file: f, loaded: 0, total: f.size, status: 'active', ctrl, speed: 0 };
      setUploads((u) => [...u, up]);
      runUpload(up);
    }
  }

  async function runUpload(up: Upload) {
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
    } catch (e: any) {
      setUploads((us) => us.map((x) => x.id === up.id
        ? { ...x, status: e.code === 'EABORT' ? 'cancelled' : 'error', error: e.message } : x));
    }
  }

  function retryUpload(up: Upload) {
    const ctrl = new AbortController();
    const next = { ...up, ctrl, status: 'active' as const, loaded: 0, error: undefined };
    setUploads((us) => us.map((x) => x.id === up.id ? next : x));
    runUpload(next);
  }

  /* ---------- mutations ---------- */
  async function doMkdir(name: string) {
    try {
      await api('/api/files/mkdir', { method: 'POST', body: JSON.stringify({ share: shareId, dir: path, name }) });
      setMkdirOpen(false); loadDir(shareId, path); toast('Folder created ✓');
    } catch (e: any) { toast(e.message); }
  }

  async function doRename(it: Item, newName: string) {
    try {
      await api('/api/files/rename', { method: 'POST', body: JSON.stringify({ share: shareId, path: it.path, newName }) });
      setRenameItem(null); setActionItem(null); loadDir(shareId, path); toast('Renamed ✓');
    } catch (e: any) { toast(e.message); }
  }

  async function doDelete(it: Item) {
    if (!confirm(`Delete "${it.name}"${it.isDir ? ' and everything inside it' : ''}?`)) return;
    try {
      await api(`/api/files?share=${encodeURIComponent(shareId)}&path=${encodeURIComponent(it.path)}`, { method: 'DELETE' });
      setActionItem(null); loadDir(shareId, path); toast('Deleted ✓');
    } catch (e: any) { toast(e.message); }
  }

  async function showInfo(it: Item) {
    try {
      const r: any = await api(`/api/files/info?share=${encodeURIComponent(shareId)}&path=${encodeURIComponent(it.path)}`);
      setInfoItem(r.file);
    } catch (e: any) { toast(e.message); }
  }

  const share = shares.find((s) => s.id === shareId);

  return (
    <div>
      {/* share picker */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-1">
        {shares.map((s) => (
          <button key={s.id}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold border ${s.id === shareId ? 'bg-accent text-ink border-accent' : 'border-slate-700 text-slate-300'}`}
            onClick={() => { setShareId(s.id); setPath(''); setSearchQ(''); }}>
            📁 {s.name}
          </button>
        ))}
      </div>

      {/* search */}
      <div className="flex gap-2 mb-2">
        <input
          className="input"
          placeholder="🔍 Search files… (*.jpg, resume.pdf)"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <button className="btn-ghost !px-3" onClick={doSearch}>Go</button>
      </div>

      {/* breadcrumb + actions */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 text-sm overflow-x-auto whitespace-nowrap">
          <button className="text-accent font-semibold" onClick={() => { setPath(''); setSearchQ(''); }}>
            {share?.name || '…'}
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-slate-500">/</span>
              <button className="text-accent" onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))}>{c}</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          {perms.upload && (
            <>
              <button className="btn-ghost !px-3 !py-1.5 text-sm" onClick={() => setMkdirOpen(true)} title="New folder">＋📁</button>
              <button className="btn-ghost !px-3 !py-1.5 text-sm" onClick={() => fileInput.current?.click()} title="Upload">⤴️</button>
            </>
          )}
        </div>
      </div>
      <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { queueUpload(e.target.files); e.target.value = ''; }} />

      {/* uploads */}
      {uploads.length > 0 && (
        <div className="card mb-2 !p-3">
          <div className="font-bold text-sm mb-2">Uploads</div>
          {uploads.slice(-4).map((u) => (
            <div key={u.id} className="mb-2 text-sm">
              <div className="flex justify-between items-center gap-2">
                <span className="truncate">{u.file.name}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {u.status === 'done' ? '✓' : u.status === 'error' ? '✗' : u.status === 'cancelled' ? '—' : `${Math.round((u.loaded / Math.max(1, u.total)) * 100)}% · ${fmtSpeed(u.speed)}`}
                </span>
              </div>
              <ProgressBar pct={(u.loaded / Math.max(1, u.total)) * 100} />
              <div className="flex gap-2 mt-1">
                {u.status === 'active' && <button className="text-xs text-red-400" onClick={() => u.ctrl.abort()}>Cancel</button>}
                {(u.status === 'error' || u.status === 'cancelled') && (
                  <button className="text-xs text-accent" onClick={() => retryUpload(u)}>Retry</button>
                )}
                {(u.status === 'done' || u.status === 'error' || u.status === 'cancelled') && (
                  <button className="text-xs text-slate-500" onClick={() => setUploads((us) => us.filter((x) => x.id !== u.id))}>Dismiss</button>
                )}
              </div>
              {u.error && <div className="text-xs text-red-400">{u.error}</div>}
            </div>
          ))}
        </div>
      )}

      {/* list */}
      <div className="card !p-2">
        {loading && <div className="p-6 text-center"><Spinner /></div>}
        {!loading && items.length === 0 && <Empty icon="📂" text={searching ? 'No matches.' : 'This folder is empty.'} />}
        {items.map((it) => {
          const k = kindOf(it.name, it.isDir);
          return (
            <div key={it.path}
              className="flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-slate-800/60 border-b border-slate-800/50 last:border-0"
              onClick={() => openItem(it)}
              onContextMenu={(e) => { e.preventDefault(); setActionItem(it); }}>
              <span className="text-2xl">{kindIcon(k)}</span>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{it.name}</div>
                <div className="text-xs text-slate-500">
                  {it.isDir ? 'Folder' : fmtBytes(it.size)} · {fmtDate(it.mtime)}
                </div>
              </div>
              <button className="text-xl px-2 text-slate-400" onClick={(e) => { e.stopPropagation(); setActionItem(it); }}>⋮</button>
            </div>
          );
        })}
      </div>

      {/* action sheet */}
      {actionItem && (
        <Modal title={actionItem.name} onClose={() => setActionItem(null)}>
          <div className="grid gap-2">
            {actionItem.isDir
              ? <ActionBtn icon="📂" label="Open" onClick={() => { setPath(actionItem.path); setActionItem(null); }} />
              : <>
                <ActionBtn icon="⬇️" label="Download" onClick={() => download(actionItem)} />
                {(isPreviewableImage(actionItem.name) || isStreamableVideo(actionItem.name)) &&
                  <ActionBtn icon="👁️" label="Preview" onClick={() => { setViewer(actionItem); setActionItem(null); }} />}
              </>}
            {actionItem.isDir && <ActionBtn icon="📦" label="Download as ZIP" onClick={() => downloadZip(actionItem)} />}
            <ActionBtn icon="ℹ️" label="Info" onClick={() => { showInfo(actionItem); setActionItem(null); }} />
            {perms.upload && <ActionBtn icon="✏️" label="Rename" onClick={() => setRenameItem(actionItem)} />}
            {perms.del && <ActionBtn icon="🗑️" label="Delete" danger onClick={() => doDelete(actionItem)} />}
          </div>
        </Modal>
      )}

      {/* viewer */}
      {viewer && (
        <Modal title={viewer.name} onClose={() => setViewer(null)} wide>
          <ViewerView item={viewer} shareId={shareId} onDownload={() => download(viewer)}
            onDelete={perms.del ? () => { setViewer(null); doDelete(viewer); } : undefined} />
        </Modal>
      )}

      {/* info */}
      {infoItem && (
        <Modal title="File info" onClose={() => setInfoItem(null)}>
          <InfoRow k="Name" v={infoItem.name} />
          <InfoRow k="Type" v={infoItem.isDir ? 'Folder' : extOf(infoItem.name).toUpperCase() || 'File'} />
          <InfoRow k="Size" v={infoItem.isDir ? '—' : fmtBytes(infoItem.size)} />
          <InfoRow k="Modified" v={fmtDate(infoItem.mtime)} />
          <InfoRow k="Path" v={infoItem.path} mono />
        </Modal>
      )}

      {/* rename */}
      {renameItem && (
        <NameModal title={`Rename "${renameItem.name}"`} initial={renameItem.name}
          onClose={() => { setRenameItem(null); setActionItem(null); }}
          onOk={(n) => doRename(renameItem, n)} />
      )}

      {/* mkdir */}
      {mkdirOpen && (
        <NameModal title="New folder" initial="" placeholder="Folder name"
          onClose={() => setMkdirOpen(false)} onOk={doMkdir} />
      )}

      {/* download progress */}
      {dl && (
        <Modal title="Downloading…" onClose={() => {}}>
          <div className="font-medium truncate mb-2">{dl.name}</div>
          <ProgressBar pct={(dl.loaded / Math.max(1, dl.total)) * 100} />
          <div className="flex justify-between text-sm text-slate-400 mt-2">
            <span>{Math.round((dl.loaded / Math.max(1, dl.total)) * 100)}%</span>
            <span>{fmtSpeed(dl.speed)}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {fmtBytes(dl.loaded)} of {fmtBytes(dl.total)}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border font-semibold active:scale-[.99] transition ${danger ? 'border-red-800 text-red-400' : 'border-slate-700'}`}>
      <span className="mr-2">{icon}</span>{label}
    </button>
  );
}

function InfoRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-800 last:border-0 text-sm">
      <span className="text-slate-400">{k}</span>
      <span className={`text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
    </div>
  );
}

function NameModal({ title, initial, placeholder, onClose, onOk }: {
  title: string; initial: string; placeholder?: string; onClose: () => void; onOk: (n: string) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Name">
        <input className="input" value={v} placeholder={placeholder}
          onChange={(e) => setV(e.target.value)} autoFocus
          onKeyDown={(e) => e.key === 'Enter' && v.trim() && onOk(v.trim())} />
      </Field>
      <button className="btn w-full" disabled={!v.trim()} onClick={() => onOk(v.trim())}>OK</button>
    </Modal>
  );
}

function ViewerView({ item, shareId, onDownload, onDelete }: {
  item: Item; shareId: string; onDownload: () => void; onDelete?: () => void;
}) {
  const url = fileUrl('/api/files/stream', { share: shareId, path: item.path });
  const e = extOf(item.name);
  return (
    <div>
      {isPreviewableImage(item.name) && (
        <img src={url} alt={item.name} className="max-h-[60vh] mx-auto rounded-lg object-contain bg-black" />
      )}
      {isStreamableVideo(item.name) && (
        <video src={url} controls playsInline preload="metadata" className="w-full max-h-[60vh] rounded-lg bg-black" />
      )}
      {['mp3', 'wav', 'ogg', 'm4a'].includes(e) && (
        <audio src={url} controls className="w-full mt-4" />
      )}
      <div className="flex gap-2 mt-4">
        <button className="btn flex-1" onClick={onDownload}>⬇️ Download</button>
        {onDelete && (
          <button className="btn-ghost flex-1 !border-red-800 !text-red-400" onClick={onDelete}>🗑️ Delete</button>
        )}
      </div>
      <div className="text-xs text-slate-500 mt-2 text-center">{fmtBytes(item.size)}</div>
    </div>
  );
}
