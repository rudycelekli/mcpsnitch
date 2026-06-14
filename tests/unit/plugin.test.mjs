import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function read(path) { return readFileSync(path, 'utf8'); }

test('Claude Code plugin manifest and marketplace resolve to the MCPSnitch plugin', () => {
  const pluginPath = join(ROOT, '.claude-plugin', 'plugin.json');
  const marketplacePath = join(ROOT, '.claude-plugin', 'marketplace.json');
  assert.ok(existsSync(pluginPath));
  assert.ok(existsSync(marketplacePath));
  const plugin = readJson(pluginPath);
  const marketplace = readJson(marketplacePath);
  assert.equal(plugin.name, 'mcpsnitch');
  assert.equal(plugin.version, '0.1.6');
  assert.equal(plugin.commands, './commands');
  assert.equal(plugin.skills, './skills');
  assert.equal(marketplace.name, 'mcpsnitch');
  assert.ok(marketplace.plugins.some((entry) => entry.name === 'mcpsnitch' && entry.source === './'));
});

test('Claude Code slash commands are thin wrappers over existing CLI commands', () => {
  const init = read(join(ROOT, 'commands', 'mcpsnitch-init.md'));
  const run = read(join(ROOT, 'commands', 'mcpsnitch-run.md'));
  const report = read(join(ROOT, 'commands', 'mcpsnitch-report.md'));
  assert.match(init, /npx -y github:rudycelekli\/mcpsnitch#v0\.1\.6 init \$ARGUMENTS/);
  assert.match(init, /mcpsnitch#v0\.1\.6 uninit/);
  assert.match(init, /backed up/);
  assert.match(init, /--global/);
  assert.match(run, /npx -y github:rudycelekli\/mcpsnitch#v0\.1\.6 run \$ARGUMENTS/);
  assert.match(run, /only speaks when the process observer sees/);
  assert.match(report, /mcpsnitch#v0\.1\.6 report \$ARGUMENTS/);
  assert.match(report, /mcpsnitch#v0\.1\.6 verify \$ARGUMENTS/);
});

test('silent-guard skill preserves observability-not-prevention honesty', () => {
  const skill = read(join(ROOT, 'skills', 'silent-guard', 'SKILL.md'));
  assert.match(skill, /observability and a tripwire, not prevention/);
  assert.match(skill, /Remote HTTP\/SSE MCP servers are not locally process-observable/);
  assert.match(skill, /\/mcpsnitch:mcpsnitch-init/);
  assert.match(skill, /--global/);
});
