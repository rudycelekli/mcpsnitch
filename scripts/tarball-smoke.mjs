#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed\n${result.stderr || result.stdout}`);
  return result;
}

const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-smoke-'));
const pack = run('npm', ['pack', '--silent', '--pack-destination', root]);
const tarballName = pack.stdout.trim().split('\n').at(-1);
const tarball = join(root, tarballName);
run('npm', ['install', tarball, '--silent'], { cwd: root });

const pkgRoot = join(root, 'node_modules', 'mcpsnitch');
const pluginManifest = join(pkgRoot, '.claude-plugin', 'plugin.json');
const marketplace = join(pkgRoot, '.claude-plugin', 'marketplace.json');
const realMcpHarness = join(pkgRoot, 'bench', 'real-mcp-process.mjs');
if (!existsSync(pluginManifest) || !existsSync(marketplace)) {
  throw new Error('plugin manifest/marketplace missing from package');
}
if (!existsSync(realMcpHarness)) throw new Error('real MCP process harness missing from package');
const marketplaceJson = JSON.parse(readFileSync(marketplace, 'utf8'));
if (!marketplaceJson.plugins?.some((entry) => entry.name === 'mcpsnitch' && entry.source === './')) {
  throw new Error('marketplace entry does not resolve mcpsnitch from ./');
}

const version = run('npx', ['mcpsnitch', '--version'], { cwd: root }).stdout.trim();
if (version !== '0.1.6') throw new Error(`expected CLI version 0.1.6, got ${version}`);

const runHelp = run('npx', ['mcpsnitch', 'run', '--help'], { cwd: root }).stdout;
if (!/Silent-when-clean/.test(runHelp) || !/auto-match\s+known server commands/.test(runHelp)) {
  throw new Error(`run help did not advertise silent run/auto profile behavior\n${runHelp}`);
}
const initHelp = run('npx', ['mcpsnitch', 'init', '--help'], { cwd: root }).stdout;
if (!/Wrap configured stdio MCP servers/.test(initHelp) || !/--wrapper-command/.test(initHelp)) {
  throw new Error(`init help did not advertise config wrapping\n${initHelp}`);
}

const configRoot = mkdtempSync(join(tmpdir(), 'mcpsnitch-smoke-config-'));
writeFileSync(join(configRoot, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } } }, null, 2));
const init = run('npx', ['mcpsnitch', 'init', '--root', configRoot, '--dry-run', '--json'], { cwd: root });
const initJson = JSON.parse(init.stdout);
if (!initJson.ok || !initJson.servers?.some((server) => server.name === 'github' && server.profile === 'github')) throw new Error(init.stdout);

const verify = run('npx', ['mcpsnitch', 'verify', '--root', root, '--json'], { cwd: root });
if (!JSON.parse(verify.stdout).ok) throw new Error(verify.stdout);

const imports = run('node', ['--input-type=module', '-e', "import { MCPSNITCH_VERSION, inferProfileFromCommand, formatActionableAlert, initMcpSnitch } from 'mcpsnitch'; if (MCPSNITCH_VERSION !== '0.1.6') throw new Error('bad version export'); if (inferProfileFromCommand('npx', ['@modelcontextprotocol/server-github']) !== 'github') throw new Error('bad profile export'); if (typeof formatActionableAlert !== 'function') throw new Error('missing alert export'); if (typeof initMcpSnitch !== 'function') throw new Error('missing init export');"], { cwd: root });
if (imports.stderr) throw new Error(imports.stderr);

console.log(JSON.stringify({ ok: true, root, tarball }));
