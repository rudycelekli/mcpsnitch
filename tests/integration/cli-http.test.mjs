import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../../dist/cli/index.js', import.meta.url).pathname;

test('CLI analyze/report/verify call real endpoints', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-cli-'));
  const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'summarize', arguments: { url: 'https://evil.example' } } });
  const a = spawnSync(process.execPath, [CLI, 'analyze', msg, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr || a.stdout);
  const r = spawnSync(process.execPath, [CLI, 'report', '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout);
  const report = JSON.parse(r.stdout);
  assert.equal(report.toolCalls, 1);
  assert.ok(report.findings.some((f) => f.rule === 'unexpected_network_destination'));
  const v = spawnSync(process.execPath, [CLI, 'verify', '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stdout);
});

test('HTTP server exposes POST /analyze and GET /report', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-http-'));
  const child = spawn(process.execPath, [CLI, 'serve', '--root', root], { stdio: ['ignore', 'pipe', 'pipe'] });
  let line = '';
  for await (const chunk of child.stdout) { line += chunk.toString(); if (line.includes('\n')) break; }
  const { port } = JSON.parse(line);
  const versionRes = await fetch(`http://127.0.0.1:${port}/version`);
  const version = await versionRes.json();
  assert.equal(version.version, '0.1.6');
  assert.ok(version.endpoints.includes('GET /version'));
  const msg = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_file', arguments: { path: '/etc/passwd' } } };
  const res = await fetch(`http://127.0.0.1:${port}/analyze`, { method: 'POST', body: JSON.stringify(msg) });
  assert.equal(res.status, 200);
  const reportRes = await fetch(`http://127.0.0.1:${port}/report`);
  const report = await reportRes.json();
  assert.equal(report.toolCalls, 1);
  const verifyRes = await fetch(`http://127.0.0.1:${port}/verify`);
  assert.equal((await verifyRes.json()).ok, true);
  const profilesRes = await fetch(`http://127.0.0.1:${port}/profiles`);
  const profiles = await profilesRes.json();
  assert.ok(profiles.profiles.some((p) => p.name === 'github'));
  child.kill('SIGTERM');
});


test('CLI profile init and learn are real endpoints', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-profile-cli-'));
  const profilePath = join(root, 'profiles', 'custom.json');
  const init = spawnSync(process.execPath, [CLI, 'profile:init', '--name', 'custom-api', '--out', profilePath, '--allow-network', '--json'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const initialized = JSON.parse(init.stdout);
  assert.equal(initialized.profile.allowNetwork, true);

  const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fetch_url', arguments: { url: 'https://example.com' } } });
  assert.equal(spawnSync(process.execPath, [CLI, 'analyze', msg, '--root', root, '--json'], { encoding: 'utf8' }).status, 0);
  const learn = spawnSync(process.execPath, [CLI, 'profile:learn', '--name', 'learned-empty-process', '--out', join(root, 'learned.json'), '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(learn.status, 0, learn.stderr || learn.stdout);
  const learned = JSON.parse(learn.stdout);
  assert.equal(learned.profile.name, 'learned-empty-process');
  assert.equal(learned.profile.allowSensitiveFiles, false);
});
