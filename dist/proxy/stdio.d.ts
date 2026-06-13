export interface WatchOptions {
    root?: string;
    command: string;
    args?: string[];
    sessionId?: string;
    /** Best-effort OS-observed process behavior via lsof. Default: true when lsof is available. */
    processObserver?: boolean;
    /** Expected behavior profile used to contextualize process observations. */
    profile?: string;
    /** Sampling interval for lsof process observation. */
    observerIntervalMs?: number;
}
export declare function watchStdio(opts: WatchOptions): Promise<number>;
