import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { AuditEvent } from '../schema.js';

export const ServerProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().default('Custom MCPSnitch expected-behavior profile.'),
  allowNetwork: z.boolean().default(false),
  allowFileRead: z.boolean().default(true),
  allowSensitiveFiles: z.boolean().default(false),
  expectedNetworkDestinations: z.array(z.string()).optional(),
  expectedFilePaths: z.array(z.string()).optional(),
});

export type ServerProfile = z.infer<typeof ServerProfileSchema>;

export const BUILTIN_PROFILES: Record<string, ServerProfile> = {
  generic: {
    name: 'generic',
    description: 'Default locked-down profile: network and sensitive file opens are unexpected until explicitly profiled.',
    allowNetwork: false,
    allowFileRead: true,
    allowSensitiveFiles: false,
  },
  filesystem: {
    name: 'filesystem',
    description: 'Local filesystem MCP server: ordinary file opens are expected; network and sensitive files remain unexpected.',
    allowNetwork: false,
    allowFileRead: true,
    allowSensitiveFiles: false,
  },
  fetch: {
    name: 'fetch',
    description: 'Fetch/browser/search-style MCP server: network sockets are expected; sensitive local files remain unexpected.',
    allowNetwork: true,
    allowFileRead: true,
    allowSensitiveFiles: false,
  },
  github: {
    name: 'github',
    description: 'GitHub/API MCP server: network sockets are expected; sensitive local files remain unexpected.',
    allowNetwork: true,
    allowFileRead: true,
    allowSensitiveFiles: false,
    expectedNetworkDestinations: ['github.com', 'api.github.com'],
  },
  database: {
    name: 'database',
    description: 'Database MCP server: network sockets may be expected; sensitive local files remain unexpected.',
    allowNetwork: true,
    allowFileRead: true,
    allowSensitiveFiles: false,
  },
};

function readProfileFile(path: string): ServerProfile {
  const raw = readFileSync(path, 'utf8');
  try {
    return ServerProfileSchema.parse(JSON.parse(raw));
  } catch (e) {
    throw new Error(`invalid MCPSnitch profile ${path}: ${(e as Error).message}`);
  }
}

/** Resolve a built-in profile name or a JSON profile file path. */
export function resolveProfile(spec = 'generic'): ServerProfile {
  if (BUILTIN_PROFILES[spec]) return BUILTIN_PROFILES[spec];
  const path = resolve(spec);
  if (existsSync(path)) return readProfileFile(path);
  return BUILTIN_PROFILES.generic;
}

export function listProfiles(): ServerProfile[] {
  return Object.values(BUILTIN_PROFILES);
}

export function profileToJson(profile: ServerProfile): string {
  return JSON.stringify(ServerProfileSchema.parse(profile), null, 2) + '\n';
}

export function writeProfile(path: string, profile: ServerProfile): ServerProfile {
  const parsed = ServerProfileSchema.parse(profile);
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, profileToJson(parsed));
  return parsed;
}

export function makeProfile(opts: Partial<ServerProfile> & { name: string }): ServerProfile {
  return ServerProfileSchema.parse({
    description: 'Custom MCPSnitch expected-behavior profile.',
    allowNetwork: false,
    allowFileRead: true,
    allowSensitiveFiles: false,
    ...opts,
  });
}

export function learnProfileFromEvents(events: AuditEvent[], opts: { name: string; description?: string }): ServerProfile {
  const hasNetwork = events.some((event) => event.source === 'process_observer' && event.observation?.kind === 'network_socket');
  const hasFile = events.some((event) => event.source === 'process_observer' && event.observation?.kind === 'file_open');
  const networkDestinations = [...new Set(events
    .filter((event) => event.source === 'process_observer' && event.observation?.kind === 'network_socket')
    .map((event) => event.observation?.value)
    .filter((value): value is string => !!value))];
  const filePaths = [...new Set(events
    .filter((event) => event.source === 'process_observer' && event.observation?.kind === 'file_open')
    .map((event) => event.observation?.value)
    .filter((value): value is string => !!value))];
  return ServerProfileSchema.parse({
    name: opts.name,
    description: opts.description ?? `Learned from ${events.length} MCPSnitch audit events. Review before using in enforcement mode.`,
    allowNetwork: hasNetwork,
    allowFileRead: hasFile || true,
    // Never auto-learn sensitive-file permission. That must be deliberate.
    allowSensitiveFiles: false,
    expectedNetworkDestinations: networkDestinations.slice(0, 50),
    expectedFilePaths: filePaths.slice(0, 50),
  });
}
