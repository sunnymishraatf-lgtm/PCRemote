/** Typed API client. Token lives in sessionStorage (gone when the tab closes). */

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const KEY = 'pcr_token';

export function getToken(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
export function setToken(t: string) {
  try { sessionStorage.setItem(KEY, t); } catch { /* ignore */ }
}
export function clearToken() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && typeof opts.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(path, { ...opts, headers });
  } catch (e: any) {
    throw new ApiError('ENETWORK',
      'Could not reach the PC. Make sure your phone is on the same Wi-Fi (or the PC hotspot) and the server is running.',
      0);
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || (body && body.ok === false)) {
    const code = body?.error?.code || 'EHTTP';
    const message = body?.error?.message || `Request failed (${res.status})`;
    if (res.status === 401) clearToken();
    throw new ApiError(code, message, res.status);
  }
  return body as T;
}

/** URL for <img>/<video>/<a> tags — token goes in the query string (documented tradeoff). */
export function fileUrl(path: string, params: Record<string, string> = {}): string {
  const token = getToken();
  const sp = new URLSearchParams({ ...params, ...(token ? { token } : {}) });
  return `${path}?${sp.toString()}`;
}

export interface UploadHooks {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/** Streaming PUT upload with progress. Never buffers the file in JS memory. */
export function uploadFile(
  share: string, dir: string, file: File, overwrite: boolean, hooks: UploadHooks = {}
): Promise<{ name: string; path: string; size: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const sp = new URLSearchParams({
      share, dir, name: file.name, overwrite: overwrite ? '1' : '0',
    });
    xhr.open('PUT', `/api/files/upload?${sp.toString()}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-File-Size', String(file.size));

    if (hooks.onProgress) {
      xhr.upload.onprogress = (e) => hooks.onProgress!(e.loaded, e.total || file.size);
    }
    hooks.signal?.addEventListener('abort', () => xhr.abort());

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && body.ok) resolve(body.file);
        else reject(new ApiError(body?.error?.code || 'EUPLOAD', body?.error?.message || 'Upload failed', xhr.status));
      } catch {
        reject(new ApiError('EUPLOAD', 'Upload failed (bad server response)', xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError('ENETWORK', 'Upload interrupted — check the Wi-Fi connection.', 0));
    xhr.onabort = () => reject(new ApiError('EABORT', 'Upload cancelled.', 0));
    xhr.send(file);
  });
}

/** Download with progress for reasonably-sized files; the browser streams it. */
export async function downloadWithProgress(url: string, filename: string, onProgress: (loaded: number, total: number) => void) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new ApiError('EDOWNLOAD', 'Download failed.', res.status);
  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const blob = new Blob(chunks);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
