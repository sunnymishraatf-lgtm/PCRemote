import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Modal({ title, onClose, children, wide }) {
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4", onClick: onClose, children: _jsxs("div", { className: `w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl card !p-0`, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-slate-800 sticky top-0 bg-panel z-10", children: [_jsx("h3", { className: "font-bold", children: title }), _jsx("button", { onClick: onClose, className: "text-2xl leading-none px-2 text-slate-400", "aria-label": "Close", children: "\u00D7" })] }), _jsx("div", { className: "p-4", children: children })] }) }));
}
export function ProgressBar({ pct }) {
    const p = Math.max(0, Math.min(100, pct));
    return (_jsx("div", { className: "h-2.5 rounded-full bg-slate-700/60 overflow-hidden", children: _jsx("div", { className: "h-full rounded-full bg-accent transition-all", style: { width: `${p}%` } }) }));
}
export function Empty({ icon, text }) {
    return (_jsxs("div", { className: "py-12 text-center text-slate-500", children: [_jsx("div", { className: "text-4xl mb-2", children: icon }), _jsx("div", { children: text })] }));
}
export function Field({ label, children }) {
    return (_jsxs("label", { className: "block mb-3", children: [_jsx("div", { className: "text-sm text-slate-400 mb-1", children: label }), children] }));
}
export function Spinner() {
    return _jsx("div", { className: "inline-block w-5 h-5 border-2 border-slate-500 border-t-accent rounded-full animate-spin" });
}
