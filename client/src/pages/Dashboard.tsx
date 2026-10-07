import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp, nav } from '../App';
import { fmtBytes, fmtSpeed } from '../lib/format';
import { Spinner } from '../components/ui';

export default function Dashboard() {
  const { pcName, caps, conn, latency, lastSpeed, toast } = useApp();
  const [shares, setShares] = useState<any[]>([]);
  const [storage, setStorage] = useState<any[]>([]);

  useEffect(() => {
    api('/api/shares').then((r: any) => setShares(r.shares)).catch(() => {});
    api('/api/storage').then((r: any) => setStorage(r.drives || [])).catch(() => {});
  }, []);

  const tiles = [
    { icon: '📁', title: 'Files', desc: 'Browse, download & upload', to: '/files' },
    { icon: '🖥️', title: 'Remote', desc: 'Screen, mouse & keyboard', to: '/remote' },
  ];

  return (
    <div>
      <div className="card mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold text-lg">
              <span>{conn === 'connected' ? '🟢' : conn === 'reconnecting' ? '🟡' : '🔴'}</span>
              {conn === 'connected' ? 'Connected' : conn === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'}
            </div>
            <div className="text-sm text-slate-400">PC: {pcName}</div>
          </div>
          <button className="btn-ghost !py-2 text-sm" onClick={() => { toast('Refreshing…'); location.reload(); }}>
            ↻
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center text-sm">
          <Stat label="Latency" value={latency != null ? `${latency} ms` : '—'} />
          <Stat label="Upload" value={lastSpeed ? fmtSpeed(lastSpeed.up) : '—'} />
          <Stat label="Download" value={lastSpeed ? fmtSpeed(lastSpeed.down) : '—'} />
        </div>
        {caps && (
          <div className="text-xs text-slate-500 mt-3">
            {!caps.input && '⚠️ Remote mouse/keyboard not available on this PC (optional driver missing). '}
            {!caps.screen && '⚠️ Screen capture not available on this PC (optional driver missing).'}
            {caps.input && caps.screen && '✓ Full remote control available.'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {tiles.map((t) => (
          <button key={t.title} className="card text-left active:scale-[.98] transition" onClick={() => nav(t.to)}>
            <div className="text-3xl mb-1">{t.icon}</div>
            <div className="font-bold">{t.title}</div>
            <div className="text-xs text-slate-400">{t.desc}</div>
          </button>
        ))}
      </div>

      <div className="card mb-3">
        <div className="font-bold mb-2">📂 Shared folders</div>
        {shares.length === 0 && <div className="text-sm text-slate-500"><Spinner /> Loading…</div>}
        {shares.map((s) => (
          <button key={s.id} className="w-full text-left py-2 border-t border-slate-800 first:border-0 flex justify-between items-center"
            onClick={() => nav('/files')}>
            <span>📁 {s.name}</span>
            <span className="text-xs text-slate-500">
              {s.perms.read ? '↓' : ''}{s.perms.upload ? '↑' : ''}{s.perms.del ? '🗑' : ''}
            </span>
          </button>
        ))}
      </div>

      {storage.length > 0 && (
        <div className="card">
          <div className="font-bold mb-2">💾 PC Storage</div>
          {storage.slice(0, 4).map((d) => {
            const pct = d.total ? Math.round((d.used / d.total) * 100) : 0;
            return (
              <div key={d.name} className="mb-2">
                <div className="flex justify-between text-sm">
                  <span className="font-mono">{d.name}</span>
                  <span className="text-slate-400">{fmtBytes(d.free)} free of {fmtBytes(d.total)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden mt-1">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-800/50 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
