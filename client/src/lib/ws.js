export class RemoteSocket {
    constructor(token, handlers = {}) {
        this.ws = null;
        this.wantOpen = false;
        this.retry = 0;
        this.retryTimer = null;
        this.pingTimer = null;
        this.pingSentAt = 0;
        this.status = 'disconnected';
        this.token = token;
        this.handlers = handlers;
    }
    connect() {
        this.wantOpen = true;
        this.retry = 0;
        this.open();
    }
    open() {
        if (!this.wantOpen)
            return;
        this.setStatus(this.retry === 0 ? 'disconnected' : 'reconnecting');
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(this.token)}`);
        this.ws = ws;
        ws.onopen = () => {
            this.retry = 0;
            this.setStatus('connected');
            this.startPing();
        };
        ws.onmessage = (ev) => {
            let msg;
            try {
                msg = JSON.parse(ev.data);
            }
            catch {
                return;
            }
            if (msg.v !== 1)
                return;
            switch (msg.type) {
                case 'ready':
                    this.handlers.onReady?.(msg.capabilities);
                    break;
                case 'pong':
                    if (this.pingSentAt)
                        this.handlers.onLatency?.(Date.now() - this.pingSentAt);
                    break;
                case 'frame':
                    this.handlers.onFrame?.(msg.data);
                    break;
                case 'error':
                    this.handlers.onError?.(msg.message || 'Remote error');
                    break;
            }
        };
        ws.onclose = () => {
            this.stopPing();
            this.ws = null;
            if (!this.wantOpen) {
                this.setStatus('disconnected');
                return;
            }
            this.setStatus('reconnecting');
            const delay = Math.min(1000 * 2 ** this.retry, 10000);
            this.retry++;
            this.retryTimer = setTimeout(() => this.open(), delay);
        };
        ws.onerror = () => { };
    }
    setStatus(s) {
        this.status = s;
        this.handlers.onStatus?.(s);
    }
    startPing() {
        this.stopPing();
        const beat = () => {
            if (this.ws?.readyState === 1) {
                this.pingSentAt = Date.now();
                this.send({ v: 1, type: 'ping', t: this.pingSentAt });
            }
        };
        beat();
        this.pingTimer = setInterval(beat, 5000);
    }
    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }
    send(msg) {
        if (this.ws?.readyState === 1) {
            try {
                this.ws.send(JSON.stringify({ v: 1, ...msg }));
                return true;
            }
            catch {
                return false;
            }
        }
        return false;
    }
    /** Subscribe/unsubscribe to screen frames (used by the Remote screen tab). */
    setFrameHandler(cb) {
        this.handlers.onFrame = cb;
    }
    close() {
        this.wantOpen = false;
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.stopPing();
        this.ws?.close();
        this.ws = null;
        this.setStatus('disconnected');
    }
}
