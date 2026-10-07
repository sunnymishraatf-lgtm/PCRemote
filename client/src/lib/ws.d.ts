/**
 * RemoteSocket — versioned WebSocket control channel (protocol v1).
 * Auto-reconnects with backoff, heartbeats for latency, and exposes
 * connection status for the UI.
 */
export type ConnStatus = 'connected' | 'reconnecting' | 'disconnected';
interface Handlers {
    onStatus?: (s: ConnStatus) => void;
    onLatency?: (ms: number) => void;
    onFrame?: (base64: string) => void;
    onReady?: (caps: {
        screen: boolean;
        input: boolean;
        platform: string;
    }) => void;
    onError?: (message: string) => void;
}
export declare class RemoteSocket {
    private ws;
    private token;
    private handlers;
    private wantOpen;
    private retry;
    private retryTimer;
    private pingTimer;
    private pingSentAt;
    status: ConnStatus;
    constructor(token: string, handlers?: Handlers);
    connect(): void;
    private open;
    private setStatus;
    private startPing;
    private stopPing;
    send(msg: any): boolean;
    /** Subscribe/unsubscribe to screen frames (used by the Remote screen tab). */
    setFrameHandler(cb: ((b64: string) => void) | undefined): void;
    close(): void;
}
export {};
