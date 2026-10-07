export function fmtBytes(n) {
    if (!Number.isFinite(n) || n < 0)
        return '—';
    if (n < 1024)
        return `${n} B`;
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1, v = n;
    do {
        v /= 1024;
        i++;
    } while (v >= 1024 && i < u.length - 1);
    return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}
export function fmtSpeed(bps) {
    return fmtBytes(bps) + '/s';
}
export function fmtDate(ms) {
    const d = new Date(ms);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const VID = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
const AUD = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];
export function extOf(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}
export function kindOf(name, isDir) {
    if (isDir)
        return 'dir';
    const e = extOf(name);
    if (IMG.includes(e))
        return 'img';
    if (VID.includes(e))
        return 'vid';
    if (AUD.includes(e))
        return 'aud';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e))
        return 'arc';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv'].includes(e))
        return 'doc';
    if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json', 'xml', 'sh'].includes(e))
        return 'code';
    return 'file';
}
export function kindIcon(k) {
    return { dir: '📁', img: '🖼️', vid: '🎬', aud: '🎵', doc: '📄', arc: '📦', code: '💻', file: '📄' }[k] || '📄';
}
export function isPreviewableImage(name) {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extOf(name));
}
export function isStreamableVideo(name) {
    // Browsers play these natively with range requests.
    return ['mp4', 'webm', 'ogv'].includes(extOf(name));
}
