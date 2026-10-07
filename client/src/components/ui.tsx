import React from 'react';

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={onClose}>
      <div
        className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl card !p-0`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 sticky top-0 bg-panel z-10">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none px-2 text-slate-400" aria-label="Close">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2.5 rounded-full bg-slate-700/60 overflow-hidden">
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${p}%` }} />
    </div>
  );
}

export function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="py-12 text-center text-slate-500">
      <div className="text-4xl mb-2">{icon}</div>
      <div>{text}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      {children}
    </label>
  );
}

export function Spinner() {
  return <div className="inline-block w-5 h-5 border-2 border-slate-500 border-t-accent rounded-full animate-spin" />;
}
