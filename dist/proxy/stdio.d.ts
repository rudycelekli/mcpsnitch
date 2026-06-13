export interface WatchOptions {
    root?: string;
    command: string;
    args?: string[];
    sessionId?: string;
}
export declare function watchStdio(opts: WatchOptions): Promise<number>;
