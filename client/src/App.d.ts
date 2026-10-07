import { RemoteSocket, ConnStatus } from './lib/ws';
export interface Caps {
    screen: boolean;
    input: boolean;
    platform: string;
}
interface Ctx {
    token: string;
    pcName: string;
    caps: Caps | null;
    conn: ConnStatus;
    latency: number | null;
    socket: RemoteSocket | null;
    logout: () => void;
    toast: (msg: string) => void;
    lastSpeed: {
        up: number;
        down: number;
    } | null;
    setLastSpeed: (s: {
        up: number;
        down: number;
    } | null) => void;
}
export declare const useApp: () => Ctx;
export declare function nav(to: string): void;
export default function App(): import("react").JSX.Element;
export {};
