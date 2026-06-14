export interface McpServerEntry {
    command?: unknown;
    args?: unknown;
    env?: unknown;
    cwd?: unknown;
    type?: unknown;
    url?: unknown;
    [key: string]: unknown;
}
export interface McpConfig {
    mcpServers?: Record<string, McpServerEntry>;
    [key: string]: unknown;
}
export interface ProfilesConfigServer {
    name: string;
    profile: string;
    kind: 'stdio' | 'remote' | 'unsupported';
    wrapped: boolean;
    reason?: string;
    command?: string;
    args?: string[];
}
export interface ProfilesConfig {
    version: 1;
    generatedAt: string;
    tool: 'mcpsnitch';
    toolVersion: string;
    profiles: Record<string, string>;
    servers: ProfilesConfigServer[];
    honesty: {
        observabilityOnly: true;
        processObserverRequiredForStrongEvidence: true;
        remoteServersNotProcessObservable: true;
    };
}
export interface InitOptions {
    root?: string;
    configPath?: string;
    profileConfigPath?: string;
    dryRun?: boolean;
    wrapperCommand?: string;
    wrapperArgs?: string[];
    wrapperPackage?: string;
    includeGlobal?: boolean;
    now?: Date;
}
export interface InitResult {
    ok: boolean;
    configPath: string;
    profileConfigPath: string;
    backupPath?: string;
    changed: boolean;
    servers: ProfilesConfigServer[];
    messages: string[];
}
export interface UninitOptions {
    root?: string;
    configPath?: string;
    dryRun?: boolean;
    includeGlobal?: boolean;
    now?: Date;
}
export interface UninitResult {
    ok: boolean;
    configPath: string;
    backupPath?: string;
    changed: boolean;
    unwrapped: string[];
    messages: string[];
}
export declare const DEFAULT_WRAPPER_PACKAGE = "github:rudycelekli/mcpsnitch#v0.1.5";
export declare function defaultMcpConfigCandidates(root?: string, includeGlobal?: boolean): string[];
export declare function findMcpConfigPath(root?: string, explicit?: string, includeGlobal?: boolean): string;
export declare function isRemoteMcpServer(entry: McpServerEntry): boolean;
export declare function isWrappedMcpServer(entry: McpServerEntry): boolean;
export declare function buildProfilesConfig(config: McpConfig, generatedAt?: string): ProfilesConfig;
export declare function readProfileSpecForServer(path: string | undefined, serverName: string | undefined, root?: string): string | undefined;
export declare function initMcpSnitch(opts?: InitOptions): InitResult;
export declare function uninitMcpSnitch(opts?: UninitOptions): UninitResult;
