import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../App';
import { fmtDate } from '../lib/format';
import { Modal, Field, Spinner } from '../components/ui';

interface Device { id: string; deviceName: string; ip: string; connectedAt: number; lastSeen: number; }

export default function Settings() {
  const { toast, logout } = useApp();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selfId, setSelfId] = useState('');
  const [shares, setShares] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [shareModal, setShareModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const d: any = await api('/api/devices');
      setDevices(d.devices); setSelfId(d.selfId);
      const s: any = await api('/api/settings');
      setShares(s.settings.shares);
      const a: any = await api('/api/audit');
      setAudit(a.entries);
    } catch (e: any) { toast(e.message); }
  };

  useEffect(() => { load(); }, []);

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke access for "${name}"?`)) return;
    try {
      await api(`/api/devices/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
      toast('Device revoked ✓'); load();
    } catch (e: any) { toast(e.message); }
  }

  async function disconnectAll() {
    if (!confirm('Disconnect ALL devices including this one?')) return;
    try {
      await api('/api/devices/disconnect-all', { method: 'POST' });
      logout();
    } catch (e: any) { toast(e.message); }
  }

  async function regenPin() {
    if (!confirm('Generate a new PIN? All devices will be disconnected.')) return;
    setBusy(true);
    try {
      const r: any = await api('/api/security/regenerate-pin', { method: 'POST' });
      alert(`New PIN: ${r.pin}\n\nAll devices were disconnected. Reconnect with the new PIN.`);
      logout();
    } catch (e: any) { toast(e.message); }
    finally { setBusy(false); }
  }

  async function removeShare(id: string) {
    if (!confirm('Stop sharing this folder?')) return;
    const next = shares.filter((s) => s.id !== id);
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ shares: next }) });
      setShares(next); toast('Folder removed from sharing ✓');
    } catch (e: any) { toast(e.message); }
  }

  return (
    <div>
      <div className="card mb-3">
        <div className="font-bold mb-2">📱 Connected devices ({devices.length})</div>
        {devices.length === 0 && <div className="text-sm text-slate-500">No devices connected.</div>}
        {devices.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-2 border-t border-slate-800 first:border-0">
            <div>
              <div className="font-medium">{d.deviceName} {d.id === selfId && <span className="text-xs text-accent">(this device)</span>}</div>
              <div className="text-xs text-slate-500">{d.ip} · active {fmtDate(d.lastSeen)}</div>
            </div>
            {d.id !== selfId && (
              <button className="btn-ghost !py-1.5 !px-3 text-sm !border-red-800 !text-red-400"
                onClick={() => revoke(d.id, d.deviceName)}>Revoke</button>
            )}
          </div>
        ))}
      </div>

      <div className="card mb-3">
        <div className="font-bold mb-2">🔐 Security</div>
        <div className="grid gap-2">
          <button className="btn-ghost" onClick={regenPin} disabled={busy}>
            {busy ? <Spinner /> : '🔄 Regenerate PIN (disconnects everyone)'}
          </button>
          <button className="btn-ghost !border-red-800 !text-red-400" onClick={disconnectAll}>
            ⛔ Disconnect all devices
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          The PIN is shown only on the PC. Sessions expire after 24 hours. 5 wrong PINs lock an address out for 15 minutes.
        </p>
      </div>

      <div className="card mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold">📂 Shared folders</div>
          <button className="btn-ghost !py-1.5 !px-3 text-sm" onClick={() => setShareModal(true)}>＋ Add</button>
        </div>
        {shares.map((s) => (
          <div key={s.id} className="py-2 border-t border-slate-800 first:border-0">
            <div className="flex items-center justify-between">
              <div className="font-medium">📁 {s.name}</div>
              <button className="text-sm text-red-400 px-2" onClick={() => removeShare(s.id)}>Remove</button>
            </div>
            <div className="text-xs text-slate-500 font-mono break-all">{s.path}</div>
            <PermToggles share={s} onChange={load} />
          </div>
        ))}
        <p className="text-xs text-slate-500 mt-2">
          Only these folders are visible to connected phones. Nothing else on the PC can be reached.
        </p>
      </div>

      <div className="card mb-3">
        <div className="font-bold mb-2">🧾 Activity log</div>
        {audit.length === 0 && <div className="text-sm text-slate-500">No activity yet.</div>}
        <div className="max-h-64 overflow-y-auto text-sm">
          {audit.slice(0, 60).map((e, i) => (
            <div key={i} className="py-1.5 border-t border-slate-800/60 first:border-0">
              <span className="text-slate-500 text-xs mr-2">{e.time}</span>
              <span className="font-medium">{e.action}</span>
              <span className="text-slate-400"> — {e.detail}</span>
              <span className="text-slate-600 text-xs ml-1">({e.device})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-3 text-sm text-slate-400">
        <div className="font-bold text-slate-200 mb-1">ℹ️ About</div>
        PC Remote v1.0.0 · protocol v1<br />
        Local network only — no cloud, no account, works with the internet off.
      </div>

      <button className="btn-ghost w-full !border-red-800 !text-red-400" onClick={logout}>
        🚪 Disconnect this device
      </button>

      {shareModal && <AddShareModal shares={shares} onClose={() => setShareModal(false)} onSaved={load} />}
    </div>
  );
}

function PermToggles({ share, onChange }: { share: any; onChange: () => void }) {
  const { toast } = useApp();
  async function setPerm(key: 'read' | 'upload' | 'del', v: boolean) {
    // Re-fetch full shares to avoid clobbering, then PUT.
    try {
      const s: any = await api('/api/settings');
      const next = s.settings.shares.map((x: any) =>
        x.id === share.id ? { ...x, perms: { ...x.perms, [key]: v } } : x);
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ shares: next }) });
      onChange();
    } catch (e: any) { toast(e.message); }
  }
  const P = (k: 'read' | 'upload' | 'del', label: string) => (
    <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
      <input type="checkbox" checked={!!share.perms[k]} onChange={(e) => setPerm(k, e.target.checked)}
        className="w-4 h-4 accent-sky-400" />
      {label}
    </label>
  );
  return (
    <div className="flex gap-4 mt-1.5">
      {P('read', 'Read')} {P('upload', 'Upload')} {P('del', 'Delete')}
    </div>
  );
}

function AddShareModal({ shares, onClose, onSaved }: { shares: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !path.trim()) { toast('Enter a name and a folder path on the PC.'); return; }
    setBusy(true);
    try {
      const next = [...shares, { name: name.trim(), path: path.trim(), perms: { read: true, upload: true, del: false } }];
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ shares: next }) });
      toast('Folder shared ✓');
      onSaved(); onClose();
    } catch (e: any) { toast(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Share a folder" onClose={onClose}>
      <Field label="Display name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Music" />
      </Field>
      <Field label="Folder path on the PC">
        <input className="input font-mono" value={path} onChange={(e) => setPath(e.target.value)}
          placeholder={navigator.platform.includes('Win') ? 'D:\\Media\\Music' : '/home/user/Music'} />
      </Field>
      <p className="text-xs text-slate-500 mb-3">
        The path must be a folder on the PC running the server. Only this folder (and what's inside it) becomes visible.
      </p>
      <button className="btn w-full" disabled={busy} onClick={save}>{busy ? <Spinner /> : 'Share folder'}</button>
    </Modal>
  );
}
