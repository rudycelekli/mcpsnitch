#!/usr/bin/env node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-smoke-'));
const pack = spawnSync('npm', ['pack', '--silent'], { encoding: 'utf8' });
if (pack.status !== 0) throw new Error(pack.stderr || pack.stdout);
const tarball = pack.stdout.trim().split('\n').at(-1);
const install = spawnSync('npm', ['install', process.cwd() + '/' + tarball, '--silent'], { cwd: root, encoding: 'utf8' });
if (install.status !== 0) throw new Error(install.stderr || install.stdout);
const cli = spawnSync('npx', ['mcpsnitch', 'verify', '--root', root, '--json'], { cwd: root, encoding: 'utf8' });
if (cli.status !== 0) throw new Error(cli.stderr || cli.stdout);
console.log(JSON.stringify({ ok: true, root, tarball }));
