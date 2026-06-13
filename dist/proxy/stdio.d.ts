export interface WatchOptions {
    root?: string;
    command: string;
    args?: string[];
    sessionId?: string;
    /** Best-effort OS-observed process behavior via lsof. Default: true when lsof is available. */
    processObserver?: boolean;
}
export declare function watchStdio(opts: WatchOptions): Promise<number>;
