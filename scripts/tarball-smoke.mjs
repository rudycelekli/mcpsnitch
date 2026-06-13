#!/usr/bin/env node
import { mkdtempSync } from 'node:fs';
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

const version = run('npx', ['mcpsnitch', '--version'], { cwd: root }).stdout.trim();
if (version !== '0.1.4') throw new Error(`expected CLI version 0.1.4, got ${version}`);

const help = run('npx', ['mcpsnitch', 'run', '--help'], { cwd: root }).stdout;
if (!/Silent-when-clean/.test(help) || !/auto-match\s+known server commands/.test(help)) {
  throw new Error(`run help did not advertise silent run/auto profile behavior\n${help}`);
}

const verify = run('npx', ['mcpsnitch', 'verify', '--root', root, '--json'], { cwd: root });
if (!JSON.parse(verify.stdout).ok) throw new Error(verify.stdout);

const imports = run('node', ['--input-type=module', '-e', "import { MCPSNITCH_VERSION, inferProfileFromCommand, formatActionableAlert } from 'mcpsnitch'; if (MCPSNITCH_VERSION !== '0.1.4') throw new Error('bad version export'); if (inferProfileFromCommand('npx', ['@modelcontextprotocol/server-github']) !== 'github') throw new Error('bad profile export'); if (typeof formatActionableAlert !== 'function') throw new Error('missing alert export');"], { cwd: root });
if (imports.stderr) throw new Error(imports.stderr);

console.log(JSON.stringify({ ok: true, root, tarball }));
