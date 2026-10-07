export declare function fmtBytes(n: number): string;
export declare function fmtSpeed(bps: number): string;
export declare function fmtDate(ms: number): string;
export declare function extOf(name: string): string;
export declare function kindOf(name: string, isDir: boolean): 'dir' | 'img' | 'vid' | 'aud' | 'doc' | 'arc' | 'code' | 'file';
export declare function kindIcon(k: string): string;
export declare function isPreviewableImage(name: string): boolean;
export declare function isStreamableVideo(name: string): boolean;
