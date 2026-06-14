import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { BUILTIN_PROFILES, inferProfileFromCommand } from '../policy/profile.js';
import { MCPSNITCH_VERSION } from '../version.js';
export const DEFAULT_WRAPPER_PACKAGE = `github:rudycelekli/mcpsnitch#v${MCPSNITCH_VERSION}`;
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item));
}
function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function readJsonFile(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJsonFile(path, value) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
export function defaultMcpConfigCandidates(root = '.', includeGlobal = false) {
    const base = resolve(root);
    const candidates = [
        join(base, '.mcp.json'),
        join(base, '.claude', 'settings.json'),
        join(base, '.claude', 'settings.local.json'),
    ];
    if (includeGlobal)
        candidates.push(join(homedir(), '.claude.json'));
    return candidates;
}
export function findMcpConfigPath(root = '.', explicit, includeGlobal = false) {
    if (explicit)
        return resolve(root, explicit);
    const candidates = defaultMcpConfigCandidates(root, includeGlobal);
    for (const path of candidates) {
        if (!existsSync(path))
            continue;
        const data = readJsonFile(path);
        if (isRecord(data) && isRecord(data.mcpServers))
            return path;
    }
    const globalHint = includeGlobal ? '' : '; pass --global to include ~/.claude.json or --config <path> for an explicit file';
    throw new Error(`no direct mcpServers config found; looked in ${candidates.join(', ')}${globalHint}`);
}
export function isRemoteMcpServer(entry) {
    const type = typeof entry.type === 'string' ? entry.type.toLowerCase() : '';
    const transport = typeof entry.transport === 'string' ? entry.transport.toLowerCase() : '';
    const remoteType = type === 'http' || type === 'sse' || type === 'streamable-http' || transport === 'http' || transport === 'sse' || transport === 'streamable-http';
    return remoteType || typeof entry.url === 'string' || typeof entry.serverUrl === 'string' || typeof entry.endpoint === 'string';
}
function wrappedInvocation(entry) {
    const args = asStringArray(entry.args);
    const command = typeof entry.command === 'string' ? entry.command : '';
    const runIndex = args.indexOf('run');
    if (runIndex < 0)
        return undefined;
    const sep = args.indexOf('--', runIndex + 1);
    if (sep < 0 || sep >= args.length - 1)
        return undefined;
    const launcherParts = [command, ...args.slice(0, runIndex)];
    const launcherLooksLikeMcpsnitch = launcherParts.some((part) => /mcpsnitch/i.test(part));
    const guardOptions = args.slice(runIndex + 1, sep);
    const configWrappedShape = guardOptions.includes('--server-name') && guardOptions.includes('--profile-config');
    return launcherLooksLikeMcpsnitch && configWrappedShape ? { args, runIndex, sep } : undefined;
}
export function isWrappedMcpServer(entry) {
    return !!wrappedInvocation(entry);
}
function backupPathFor(path, now = new Date()) {
    const base = `${path}.bak`;
    if (!existsSync(base))
        return base;
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    return `${base}.${stamp}`;
}
function backupFile(path, now = new Date()) {
    const backupPath = backupPathFor(path, now);
    copyFileSync(path, backupPath);
    return backupPath;
}
function wrapperPrefix(opts) {
    if (opts.wrapperArgs && opts.wrapperArgs.length > 0)
        return opts.wrapperArgs;
    const wrapperCommand = opts.wrapperCommand ?? 'npx';
    if (wrapperCommand === 'npx')
        return ['-y', opts.wrapperPackage ?? DEFAULT_WRAPPER_PACKAGE];
    return [];
}
function makeWrappedEntry(name, entry, profile, root, profileConfigPath, opts) {
    const command = String(entry.command);
    const originalArgs = asStringArray(entry.args);
    const wrapperCommand = opts.wrapperCommand ?? 'npx';
    const args = [
        ...wrapperPrefix(opts),
        'run',
        '--server-name', name,
        '--profile-config', profileConfigPath,
        '--profile', profile,
        '--root', root,
        '--',
        command,
        ...originalArgs,
    ];
    return { ...entry, command: wrapperCommand, args };
}
export function buildProfilesConfig(config, generatedAt = new Date().toISOString()) {
    const profiles = {};
    const servers = [];
    const mcpServers = config.mcpServers ?? {};
    for (const [name, entry] of Object.entries(mcpServers)) {
        if (isRemoteMcpServer(entry)) {
            profiles[name] = 'generic';
            servers.push({ name, profile: 'generic', kind: 'remote', wrapped: false, reason: 'remote_http_or_sse_not_process_observable' });
            continue;
        }
        if (typeof entry.command !== 'string') {
            profiles[name] = 'generic';
            servers.push({ name, profile: 'generic', kind: 'unsupported', wrapped: false, reason: 'missing_stdio_command' });
            continue;
        }
        const args = asStringArray(entry.args);
        const profile = inferProfileFromCommand(entry.command, args.concat(name));
        profiles[name] = profile;
        servers.push({ name, profile, kind: 'stdio', wrapped: isWrappedMcpServer(entry), command: entry.command, args });
    }
    return {
        version: 1,
        generatedAt,
        tool: 'mcpsnitch',
        toolVersion: MCPSNITCH_VERSION,
        profiles,
        servers,
        honesty: {
            observabilityOnly: true,
            processObserverRequiredForStrongEvidence: true,
            remoteServersNotProcessObservable: true,
        },
    };
}
export function readProfileSpecForServer(path, serverName, root) {
    if (!path || !serverName)
        return undefined;
    const resolved = resolve(root ?? '.', path);
    if (!existsSync(resolved))
        return undefined;
    const data = readJsonFile(resolved);
    if (!isRecord(data) || !isRecord(data.profiles))
        return undefined;
    const value = data.profiles[serverName];
    if (typeof value !== 'string' || !value.trim())
        return undefined;
    const spec = value.trim();
    if (spec === 'auto' || BUILTIN_PROFILES[spec] || isAbsolute(spec))
        return spec;
    return resolve(root ?? dirname(resolved), spec);
}
export function initMcpSnitch(opts = {}) {
    const root = resolve(opts.root ?? '.');
    const configPath = findMcpConfigPath(root, opts.configPath, !!opts.includeGlobal);
    const config = readJsonFile(configPath);
    if (!isRecord(config) || !isRecord(config.mcpServers))
        throw new Error(`invalid MCP config ${configPath}: expected top-level mcpServers object`);
    const mcpConfig = config;
    const profileConfigPath = resolve(root, opts.profileConfigPath ?? join('.mcpsnitch', 'profiles.json'));
    const generatedAt = (opts.now ?? new Date()).toISOString();
    const profilesConfig = buildProfilesConfig(mcpConfig, generatedAt);
    const nextConfig = { ...mcpConfig, mcpServers: { ...mcpConfig.mcpServers } };
    const messages = [];
    let changed = false;
    for (const server of profilesConfig.servers) {
        const entry = nextConfig.mcpServers?.[server.name];
        if (!entry)
            continue;
        if (server.kind === 'remote') {
            messages.push(`${server.name}: remote HTTP/SSE server not wrapped; no local child process for lsof in MCPSnitch v0.1.x`);
            continue;
        }
        if (server.kind !== 'stdio') {
            messages.push(`${server.name}: not wrapped (${server.reason ?? 'unsupported'})`);
            continue;
        }
        if (isWrappedMcpServer(entry)) {
            messages.push(`${server.name}: already wrapped`);
            continue;
        }
        nextConfig.mcpServers[server.name] = makeWrappedEntry(server.name, entry, server.profile, root, profileConfigPath, opts);
        server.wrapped = true;
        changed = true;
        messages.push(`${server.name}: wrapped with profile=${server.profile}`);
    }
    let backupPath;
    if (!opts.dryRun) {
        writeJsonFile(profileConfigPath, profilesConfig);
        if (changed) {
            backupPath = backupFile(configPath, opts.now);
            writeJsonFile(configPath, nextConfig);
            messages.unshift(`backed up ${configPath} -> ${backupPath} before wrapping`);
        }
    }
    return { ok: true, configPath, profileConfigPath, backupPath, changed, servers: profilesConfig.servers, messages };
}
function unwrapEntry(entry) {
    const wrapped = wrappedInvocation(entry);
    if (!wrapped)
        return undefined;
    const [command, ...originalArgs] = wrapped.args.slice(wrapped.sep + 1);
    return { ...entry, command, args: originalArgs };
}
export function uninitMcpSnitch(opts = {}) {
    const root = resolve(opts.root ?? '.');
    const configPath = findMcpConfigPath(root, opts.configPath, !!opts.includeGlobal);
    const config = readJsonFile(configPath);
    if (!isRecord(config) || !isRecord(config.mcpServers))
        throw new Error(`invalid MCP config ${configPath}: expected top-level mcpServers object`);
    const nextConfig = { ...config, mcpServers: { ...config.mcpServers } };
    const unwrapped = [];
    for (const [name, entry] of Object.entries(nextConfig.mcpServers ?? {})) {
        const original = unwrapEntry(entry);
        if (original) {
            nextConfig.mcpServers[name] = original;
            unwrapped.push(name);
        }
    }
    const messages = [];
    let backupPath;
    if (!opts.dryRun && unwrapped.length > 0) {
        backupPath = backupFile(configPath, opts.now);
        writeJsonFile(configPath, nextConfig);
        messages.push(`backed up ${configPath} -> ${backupPath} before unwrapping`);
    }
    messages.push(...(unwrapped.length ? unwrapped.map((name) => `${name}: unwrapped`) : ['no MCPSnitch-wrapped stdio servers found']));
    return { ok: true, configPath, backupPath, changed: unwrapped.length > 0, unwrapped, messages };
}
//# sourceMappingURL=mcp.js.map