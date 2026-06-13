export declare function startHttpServer(opts?: {
    root?: string;
    port?: number;
}): Promise<{
    port: number;
    close: () => Promise<void>;
}>;
