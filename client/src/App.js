import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken, clearToken } from './lib/api';
import { RemoteSocket } from './lib/ws';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';
import Remote from './pages/Remote';
import Settings from './pages/Settings';
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
/* ---------------- hash router ---------------- */
function useHash() {
    const [h, setH] = useState(() => location.hash.slice(1) || '/login');
    useEffect(() => {
        const fn = () => setH(location.hash.slice(1) || '/login');
        window.addEventListener('hashchange', fn);
        return () => window.removeEventListener('hashchange', fn);
    }, []);
    return h;
}
export function nav(to) { location.hash = '#' + to; }
/* ---------------- app ---------------- */
export default function App() {
    const [token, setTok] = useState(() => getToken());
    const [pcName, setPcName] = useState('');
    const [caps, setCaps] = useState(null);
    const [conn, setConn] = useState('disconnected');
    const [latency, setLatency] = useState(null);
    const [theme, setTheme] = useState(() => localStorage.getItem('pcr_theme') || 'dark');
    const [toasts, setToasts] = useState([]);
    const [lastSpeed, setLastSpeed] = useState(null);
    const socketRef = useRef(null);
    const [sockState, setSockState] = useState(null);
    const toastId = useRef(0);
    const hash = useHash();
    const toast = (msg) => {
        const id = ++toastId.current;
        setToasts((t) => [...t, { id, msg }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    };
    useEffect(() => {
        document.documentElement.classList.toggle('light', theme === 'light');
        try {
            localStorage.setItem('pcr_theme', theme);
        }
        catch { /* ignore */ }
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
                const st = await api('/api/status');
                if (!alive)
                    return;
                setPcName(st.pcName || 'PC');
                const c = await api('/api/capabilities');
                if (!alive)
                    return;
                setCaps(c.capabilities);
            }
            catch { /* status is public; capabilities need auth */ }
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
    const login = (t) => { setToken(t); setTok(t); nav('/'); };
    const logout = () => {
        clearToken();
        setTok(null);
        socketRef.current?.close();
        socketRef.current = null;
        nav('/login');
    };
    const ctx = useMemo(() => ({
        token: token || '', pcName, caps, conn, latency,
        socket: sockState, logout, toast, lastSpeed, setLastSpeed,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [token, pcName, caps, conn, latency, lastSpeed, sockState]);
    // Pair route is public (no token yet).
    if (hash.startsWith('/pair/')) {
        return _jsx(Login, { pairToken: decodeURIComponent(hash.slice(6)), onLogin: login });
    }
    if (!token) {
        return _jsx(Login, { pairToken: null, onLogin: login });
    }
    const route = hash === '/' || hash === '' ? 'home' :
        hash.startsWith('/files') ? 'files' :
            hash.startsWith('/remote') ? 'remote' :
                hash.startsWith('/settings') ? 'settings' : 'home';
    return (_jsx(AppCtx.Provider, { value: ctx, children: _jsxs("div", { className: `min-h-full flex flex-col ${theme}`, children: [_jsx(Header, { theme: theme, setTheme: setTheme }), _jsxs("main", { className: "flex-1 pb-24 max-w-3xl w-full mx-auto px-3 pt-3", children: [route === 'home' && _jsx(Dashboard, {}), route === 'files' && _jsx(Files, {}), route === 'remote' && _jsx(Remote, {}), route === 'settings' && _jsx(Settings, {})] }), _jsx(BottomNav, { route: route }), _jsx("div", { className: "fixed bottom-20 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4", children: toasts.map((t) => (_jsx("div", { className: "pointer-events-auto bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm shadow-xl max-w-md", children: t.msg }, t.id))) })] }) }));
}
function Header({ theme, setTheme }) {
    const { pcName, conn, latency } = useApp();
    const dot = conn === 'connected' ? '🟢' : conn === 'reconnecting' ? '🟡' : '🔴';
    const label = conn === 'connected' ? 'Connected' : conn === 'reconnecting' ? 'Reconnecting…' : 'Disconnected';
    return (_jsx("header", { className: "sticky top-0 z-40 backdrop-blur bg-ink/85 border-b border-slate-800", children: _jsxs("div", { className: "max-w-3xl mx-auto px-3 py-2.5 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xl", children: "\uD83D\uDDA5\uFE0F" }), _jsxs("div", { children: [_jsx("div", { className: "font-bold leading-tight", children: "PC Remote" }), _jsx("div", { className: "text-xs text-slate-400 leading-tight", children: pcName || '…' })] })] }), _jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsx("span", { title: label, children: dot }), _jsxs("span", { className: "text-xs text-slate-400 hidden sm:inline", children: [label, latency != null && conn === 'connected' ? ` · ${latency} ms` : ''] }), _jsx("button", { className: "text-lg px-1", onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark'), "aria-label": "Toggle theme", children: theme === 'dark' ? '☀️' : '🌙' })] })] }) }));
}
function BottomNav({ route }) {
    const tabs = [
        { id: 'home', icon: '🏠', label: 'Home', to: '/' },
        { id: 'files', icon: '📁', label: 'Files', to: '/files' },
        { id: 'remote', icon: '🖱️', label: 'Remote', to: '/remote' },
        { id: 'settings', icon: '⚙️', label: 'Settings', to: '/settings' },
    ];
    return (_jsx("nav", { className: "fixed bottom-0 left-0 right-0 z-40 bg-ink/95 backdrop-blur border-t border-slate-800", style: { paddingBottom: 'env(safe-area-inset-bottom)' }, children: _jsx("div", { className: "max-w-3xl mx-auto grid grid-cols-4", children: tabs.map((t) => (_jsxs("button", { onClick: () => nav(t.to), className: `py-2.5 flex flex-col items-center gap-0.5 text-xs ${route === t.id ? 'tab-active' : 'tab-idle'}`, children: [_jsx("span", { className: "text-xl", children: t.icon }), t.label] }, t.id))) }) }));
}
