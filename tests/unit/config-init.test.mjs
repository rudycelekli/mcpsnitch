import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_WRAPPER_PACKAGE, buildProfilesConfig, defaultMcpConfigCandidates, findMcpConfigPath, initMcpSnitch, uninitMcpSnitch, readProfileSpecForServer, isRemoteMcpServer, isWrappedMcpServer } from '../../dist/index.js';

function tmpRoot() { return mkdtempSync(join(tmpdir(), 'mcpsnitch-init-')); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }

test('buildProfilesConfig auto-assigns known stdio profiles and marks remote servers not process-observable', () => {
  const config = {
    mcpServers: {
      github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      files: { command: 'npx', args: ['@modelcontextprotocol/server-filesystem', '/tmp'] },
      search: { command: 'uvx', args: ['brave-search-mcp'] },
      db: { command: 'node', args: ['postgres-mcp.js'] },
      custom: { command: 'node', args: ['custom.js'] },
      notion: { type: 'http', url: 'https://mcp.notion.com/mcp' },
      sse: { transport: 'sse', serverUrl: 'https://example.com/sse' },
    },
  };
  const profiles = buildProfilesConfig(config, '2026-06-13T00:00:00.000Z');
  assert.equal(profiles.profiles.github, 'github');
  assert.equal(profiles.profiles.files, 'filesystem');
  assert.equal(profiles.profiles.search, 'fetch');
  assert.equal(profiles.profiles.db, 'database');
  assert.equal(profiles.profiles.custom, 'generic');
  assert.equal(profiles.profiles.notion, 'generic');
  assert.equal(profiles.profiles.sse, 'generic');
  assert.equal(profiles.servers.find((s) => s.name === 'notion').kind, 'remote');
  assert.equal(profiles.servers.find((s) => s.name === 'sse').kind, 'remote');
  assert.match(profiles.servers.find((s) => s.name === 'notion').reason, /not_process_observable/);
  assert.equal(profiles.honesty.observabilityOnly, true);
});

test('init wraps stdio MCP servers, writes editable profiles config, and creates mandatory backup', () => {
  const root = tmpRoot();
  const configPath = join(root, '.mcp.json');
  writeFileSync(configPath, JSON.stringify({
    mcpServers: {
      github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' } },
      unknown: { command: 'node', args: ['server.js'] },
      remote: { type: 'http', url: 'https://example.com/mcp' },
    },
  }, null, 2));

  const result = initMcpSnitch({ root, wrapperCommand: process.execPath, wrapperArgs: ['/tmp/mcpsnitch-cli.js'], now: new Date('2026-06-13T00:00:00.000Z') });
  assert.equal(result.changed, true);
  assert.ok(result.backupPath.endsWith('.mcp.json.bak'));
  assert.ok(existsSync(result.backupPath));
  assert.ok(result.messages[0].includes('backed up'));
  assert.ok(result.messages.some((m) => m.includes('remote HTTP/SSE server not wrapped')));

  const wrapped = readJson(configPath);
  assert.equal(wrapped.mcpServers.github.command, process.execPath);
  assert.deepEqual(wrapped.mcpServers.github.args.slice(0, 3), ['/tmp/mcpsnitch-cli.js', 'run', '--server-name']);
  assert.ok(wrapped.mcpServers.github.args.includes('github'));
  assert.ok(wrapped.mcpServers.github.args.includes('--profile-config'));
  assert.ok(wrapped.mcpServers.github.args.includes('--'));
  assert.equal(wrapped.mcpServers.github.env.GITHUB_TOKEN, '${GITHUB_TOKEN}');
  assert.equal(wrapped.mcpServers.remote.command, undefined);

  const profileConfig = readJson(join(root, '.mcpsnitch', 'profiles.json'));
  assert.equal(profileConfig.profiles.github, 'github');
  assert.equal(profileConfig.profiles.unknown, 'generic');
  assert.equal(profileConfig.profiles.remote, 'generic');
  assert.equal(readProfileSpecForServer(join(root, '.mcpsnitch', 'profiles.json'), 'github'), 'github');
});

test('uninit restores wrapped commands and backs up before unwrapping', () => {
  const root = tmpRoot();
  const configPath = join(root, '.mcp.json');
  writeFileSync(configPath, JSON.stringify({ mcpServers: { files: { command: 'npx', args: ['@modelcontextprotocol/server-filesystem', '/tmp'] } } }, null, 2));
  initMcpSnitch({ root, wrapperCommand: process.execPath, wrapperArgs: ['/tmp/mcpsnitch-cli.js'] });
  const result = uninitMcpSnitch({ root, now: new Date('2026-06-13T00:00:01.000Z') });
  assert.equal(result.changed, true);
  assert.deepEqual(result.unwrapped, ['files']);
  assert.ok(result.backupPath.includes('.bak.'));
  const restored = readJson(configPath);
  assert.equal(restored.mcpServers.files.command, 'npx');
  assert.deepEqual(restored.mcpServers.files.args, ['@modelcontextprotocol/server-filesystem', '/tmp']);
});


test('wrapped detection and uninit work when mcpsnitch is the wrapper command itself', () => {
  const root = tmpRoot();
  const configPath = join(root, '.mcp.json');
  writeFileSync(configPath, JSON.stringify({ mcpServers: { custom: { command: 'node', args: ['server.js'] } } }, null, 2));
  initMcpSnitch({ root, wrapperCommand: 'mcpsnitch', profileConfigPath: 'profiles.json' });
  const wrapped = readJson(configPath).mcpServers.custom;
  assert.equal(wrapped.command, 'mcpsnitch');
  assert.equal(isWrappedMcpServer(wrapped), true);
  const result = uninitMcpSnitch({ root });
  assert.deepEqual(result.unwrapped, ['custom']);
  const restored = readJson(configPath).mcpServers.custom;
  assert.equal(restored.command, 'node');
  assert.deepEqual(restored.args, ['server.js']);
});




test('default npx wrapper pins the GitHub package to this release tag', () => {
  const root = tmpRoot();
  const configPath = join(root, '.mcp.json');
  writeFileSync(configPath, JSON.stringify({ mcpServers: { custom: { command: 'node', args: ['server.js'] } } }, null, 2));
  initMcpSnitch({ root });
  const wrapped = readJson(configPath).mcpServers.custom;
  assert.equal(wrapped.command, 'npx');
  assert.ok(wrapped.args.includes(DEFAULT_WRAPPER_PACKAGE));
});

test('default config discovery does not include global Claude config unless explicitly requested', () => {
  const root = tmpRoot();
  assert.equal(defaultMcpConfigCandidates(root).some((path) => path.endsWith('.claude.json')), false);
  assert.equal(defaultMcpConfigCandidates(root, true).some((path) => path.endsWith('.claude.json')), true);
  assert.throws(() => findMcpConfigPath(root), /pass --global/);
});

test('wrapped detection avoids unrelated run separators and remote schema variants are not wrapped', () => {
  assert.equal(isWrappedMcpServer({ command: 'node', args: ['server.js', 'run', '--', 'mcpsnitch'] }), false);
  assert.equal(isWrappedMcpServer({ command: 'npx', args: ['-y', 'some-mcpsnitch-helper', 'run', '--', 'node', 'server.js'] }), false);
  assert.equal(isRemoteMcpServer({ transport: 'sse', serverUrl: 'https://example.com/sse', command: 'node', args: ['fallback.js'] }), true);
});

test('profile config custom paths resolve relative to root, not wrapper cwd', () => {
  const root = tmpRoot();
  mkdirSync(join(root, '.mcpsnitch', 'profiles'), { recursive: true });
  const custom = join(root, '.mcpsnitch', 'profiles', 'slack.json');
  writeFileSync(custom, JSON.stringify({ name: 'slack', allowNetwork: true, allowFileRead: true, allowSensitiveFiles: false }, null, 2));
  writeFileSync(join(root, '.mcpsnitch', 'profiles.json'), JSON.stringify({ profiles: { slack: '.mcpsnitch/profiles/slack.json' } }, null, 2));
  assert.equal(readProfileSpecForServer(join(root, '.mcpsnitch', 'profiles.json'), 'slack', root), custom);
});
