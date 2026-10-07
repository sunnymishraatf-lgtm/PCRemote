/** Typed API client. Token lives in sessionStorage (gone when the tab closes). */
export declare class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number);
}
export declare function getToken(): string | null;
export declare function setToken(t: string): void;
export declare function clearToken(): void;
export declare function api<T = any>(path: string, opts?: RequestInit): Promise<T>;
/** URL for <img>/<video>/<a> tags — token goes in the query string (documented tradeoff). */
export declare function fileUrl(path: string, params?: Record<string, string>): string;
export interface UploadHooks {
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
}
/** Streaming PUT upload with progress. Never buffers the file in JS memory. */
export declare function uploadFile(share: string, dir: string, file: File, overwrite: boolean, hooks?: UploadHooks): Promise<{
    name: string;
    path: string;
    size: number;
}>;
/** Download with progress for reasonably-sized files; the browser streams it. */
export declare function downloadWithProgress(url: string, filename: string, onProgress: (loaded: number, total: number) => void): Promise<void>;
