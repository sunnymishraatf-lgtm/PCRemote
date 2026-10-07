import React, { useEffect, useRef, useState } from 'react';
import { api, setToken, ApiError } from '../lib/api';
import { nav } from '../App';
import { Spinner } from '../components/ui';

export default function Login({ pairToken, onLogin }: { pairToken: string | null; onLogin: (t: string) => void }) {
  const [pin, setPin] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [local, setLocal] = useState<any>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    try {
      const ua = navigator.userAgent;
      const mobile = /Android|iPhone|iPad/i.test(ua) ? '📱 ' : '💻 ';
      setDeviceName(mobile + (navigator.platform || 'Device'));
    } catch { setDeviceName('My device'); }
    // If this browser IS the PC (loopback), show the PIN + QR for convenience.
    api('/api/local-info').then((r: any) => setLocal(r)).catch(() => {});
    boxes.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (pairToken && !pairing) {
      setPairing(true);
      api('/api/auth/pair', { method: 'POST', body: JSON.stringify({ pairToken, deviceName: deviceName || 'Phone' }) })
        .then((r: any) => { setToken(r.token); onLogin(r.token); })
        .catch((e: any) => { setError(friendly(e)); setPairing(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairToken]);

  function onPinInput(i: number, v: string) {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = (pin + '      ').split('');
    next[i] = d || '';
    const joined = next.join('').replace(/ /g, '');
    setPin(joined.slice(0, 6));
    setError('');
    if (d && i < 5) boxes.current[i + 1]?.focus();
    if (joined.replace(/ /g, '').length === 6) submit(joined.replace(/ /g, ''));
  }

  function onPinKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[i] && i > 0) boxes.current[i - 1]?.focus();
  }

  async function submit(p = pin) {
    if (p.length !== 6 || busy) return;
    setBusy(true); setError('');
    try {
      const r: any = await api('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ pin: p, deviceName: deviceName || 'Phone' }),
      });
      setToken(r.token);
      onLogin(r.token);
    } catch (e: any) {
      setError(friendly(e));
      setPin('');
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  function friendly(e: any): string {
    if (e instanceof ApiError) {
      if (e.code === 'ELOCKED') return e.message + ' (brute-force protection)';
      if (e.code === 'ENETWORK') return e.message;
      if (e.code === 'EBADPIN') return 'Incorrect PIN. Try again.';
    }
    return 'Could not connect. Check the server address and try again.';
  }

  if (pairing) {
    return (
      <Center>
        <Spinner />
        <p className="mt-3 text-slate-400">Pairing with the PC…</p>
        {error && <p className="mt-3 text-red-400 text-sm max-w-xs text-center">{error}</p>}
        {error && <button className="btn mt-4" onClick={() => nav('/login')}>Enter PIN instead</button>}
      </Center>
    );
  }

  return (
    <Center>
      <div className="text-5xl mb-3">🖥️</div>
      <h1 className="text-2xl font-bold mb-1">PC Remote</h1>
      <p className="text-slate-400 text-sm mb-6 text-center max-w-xs">
        Connect to your PC over the local network.<br />No cloud, no account.
      </p>

      <div className="flex gap-2 mb-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <input
            key={i}
            ref={(el) => { boxes.current[i] = el; }}
            className="pin-box"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin[i] || ''}
            onChange={(e) => onPinInput(i, e.target.value)}
            onKeyDown={(e) => onPinKey(i, e)}
          />
        ))}
      </div>

      <input
        className="input mb-4 max-w-[280px] text-center"
        placeholder="Device name (e.g. Sunny's Phone)"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
        maxLength={60}
      />

      {error && <p className="text-red-400 text-sm mb-3 max-w-xs text-center">{error}</p>}

      <button className="btn w-full max-w-[280px]" disabled={pin.length !== 6 || busy} onClick={() => submit()}>
        {busy ? <Spinner /> : 'Connect'}
      </button>

      <p className="text-xs text-slate-500 mt-6 max-w-xs text-center">
        The PIN is shown on the PC when the server starts.
        Scan the QR code on the PC screen to skip typing it.
      </p>

      {local?.qrDataUrl && (
        <div className="card mt-6 max-w-[300px] text-center">
          <div className="text-sm font-semibold mb-2">This browser is on the PC</div>
          <img src={local.qrDataUrl} alt="Connect QR code" className="mx-auto rounded-lg bg-white p-1 w-44 h-44" />
          <div className="text-xs text-slate-400 mt-2">Scan with your phone camera</div>
          <div className="text-lg font-mono font-bold tracking-widest mt-1">PIN: {local.pin}</div>
        </div>
      )}
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
      {children}
    </div>
  );
}
