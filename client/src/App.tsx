import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken, clearToken } from './lib/api';
import { RemoteSocket, ConnStatus } from './lib/ws';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';
import Remote from './pages/Remote';
import Settings from './pages/Settings';

/* ---------------- context ---------------- */

export interface Caps { screen: boolean; input: boolean; platform: string; }

interface Ctx {
  token: string;
  pcName: string;
  caps: Caps | null;
  conn: ConnStatus;
  latency: number | null;
  socket: RemoteSocket | null;
  logout: () => void;
  toast: (msg: string) => void;
  lastSpeed: { up: number; down: number } | null;
  setLastSpeed: (s: { up: number; down: number } | null) => void;
}

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

/* ---------------- hash router ---------------- */

function useHash(): string {
  const [h, setH] = useState(() => location.hash.slice(1) || '/login');
  useEffect(() => {
    const fn = () => setH(location.hash.slice(1) || '/login');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return h;
}

export function nav(to: string) { location.hash = '#' + to; }

/* ---------------- app ---------------- */

export default function App() {
  const [token, setTok] = useState<string | null>(() => getToken());
  const [pcName, setPcName] = useState('');
  const [caps, setCaps] = useState<Caps | null>(null);
  const [conn, setConn] = useState<ConnStatus>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('pcr_theme') as any) || 'dark');
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [lastSpeed, setLastSpeed] = useState<{ up: number; down: number } | null>(null);
  const socketRef = useRef<RemoteSocket | null>(null);
  const [sockState, setSockState] = useState<RemoteSocket | null>(null);
  const toastId = useRef(0);
  const hash = useHash();

  const toast = (msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    try { localStorage.setItem('pcr_theme', theme); } catch { /* ignore */ }
  }, [theme]);

  // Bootstrap on login: fetch status + capabilities, open control socket.
  useEffect(() => {
    if (!token) {
      socketRef.current?.close();
      socketRef.current = null;
      setSockState(null);
      setConn('disconnected');
      setCaps(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const st: any = await api('/api/status');
        if (!alive) return;
        setPcName(st.pcName || 'PC');
        const c: any = await api('/api/capabilities');
        if (!alive) return;
        setCaps(c.capabilities);
      } catch { /* status is public; capabilities need auth */ }
    })();
    const sock = new RemoteSocket(token, {
      onStatus: setConn,
      onLatency: setLatency,
      onError: (m) => toast(m),
    });
    sock.connect();
    socketRef.current = sock;
    setSockState(sock);
    return () => { alive = false; sock.close(); setSockState(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = (t: string) => { setToken(t); setTok(t); nav('/'); };
  const logout = () => {
    clearToken(); setTok(null);
    socketRef.current?.close(); socketRef.current = null;
    nav('/login');
  };

  const ctx = useMemo<Ctx>(() => ({
    token: token || '', pcName, caps, conn, latency,
    socket: sockState, logout, toast, lastSpeed, setLastSpeed,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [token, pcName, caps, conn, latency, lastSpeed, sockState]);

  // Pair route is public (no token yet).
  if (hash.startsWith('/pair/')) {
    return <Login pairToken={decodeURIComponent(hash.slice(6))} onLogin={login} />;
  }
  if (!token) {
    return <Login pairToken={null} onLogin={login} />;
  }

  const route = hash === '/' || hash === '' ? 'home' :
    hash.startsWith('/files') ? 'files' :
    hash.startsWith('/remote') ? 'remote' :
    hash.startsWith('/settings') ? 'settings' : 'home';

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`min-h-full flex flex-col ${theme}`}>
        <Header theme={theme} setTheme={setTheme} />
        <main className="flex-1 pb-24 max-w-3xl w-full mx-auto px-3 pt-3">
          {route === 'home' && <Dashboard />}
          {route === 'files' && <Files />}
          {route === 'remote' && <Remote />}
          {route === 'settings' && <Settings />}
        </main>
        <BottomNav route={route} />
        <div className="fixed bottom-20 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm shadow-xl max-w-md">
              {t.msg}
            </div>
          ))}
        </div>
      </div>
    </AppCtx.Provider>
  );
}

function Header({ theme, setTheme }: { theme: string; setTheme: (t: 'dark' | 'light') => void }) {
  const { pcName, conn, latency } = useApp();
  const dot = conn === 'connected' ? '🟢' : conn === 'reconnecting' ? '🟡' : '🔴';
  const label = conn === 'connected' ? 'Connected' : conn === 'reconnecting' ? 'Reconnecting…' : 'Disconnected';
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-ink/85 border-b border-slate-800">
      <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🖥️</span>
          <div>
            <div className="font-bold leading-tight">PC Remote</div>
            <div className="text-xs text-slate-400 leading-tight">{pcName || '…'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span title={label}>{dot}</span>
          <span className="text-xs text-slate-400 hidden sm:inline">
            {label}{latency != null && conn === 'connected' ? ` · ${latency} ms` : ''}
          </span>
          <button
            className="text-lg px-1"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ route }: { route: string }) {
  const tabs = [
    { id: 'home', icon: '🏠', label: 'Home', to: '/' },
    { id: 'files', icon: '📁', label: 'Files', to: '/files' },
    { id: 'remote', icon: '🖱️', label: 'Remote', to: '/remote' },
    { id: 'settings', icon: '⚙️', label: 'Settings', to: '/settings' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-ink/95 backdrop-blur border-t border-slate-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-3xl mx-auto grid grid-cols-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => nav(t.to)}
            className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${route === t.id ? 'tab-active' : 'tab-idle'}`}>
            <span className="text-xl">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
