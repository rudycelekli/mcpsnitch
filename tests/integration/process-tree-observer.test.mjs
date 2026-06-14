import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lsofAvailable, readDescendantPids, readProcessTreeObservations } from '../../dist/index.js';

const PARENT = new URL('../fixtures/spawn-child-hold-file.mjs', import.meta.url).pathname;

function waitForLine(stream, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timeout waiting for line; got ${buf}`)), timeoutMs);
    stream.on('data', function onData(chunk) {
      buf += chunk.toString();
      if (buf.includes('\n')) {
        clearTimeout(timer);
        stream.off('data', onData);
        resolve(buf.split('\n')[0] + '\n');
      }
    });
  });
}

test('process observer samples descendants of npx-style launcher parents', async (t) => {
  if (!(await lsofAvailable())) return t.skip('lsof unavailable');
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-tree-'));
  const file = join(root, 'held.txt');
  writeFileSync(file, 'held by grandchild\n');
  const parent = spawn(process.execPath, [PARENT, file], { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    await waitForLine(parent.stdout);
    const descendants = await readDescendantPids(parent.pid);
    assert.ok(descendants.length >= 1, `expected descendants for ${parent.pid}`);
    const observations = await readProcessTreeObservations(parent.pid);
    assert.ok(observations.some((obs) => obs.pid !== parent.pid && obs.value === realpathSync(file)), JSON.stringify(observations, null, 2));
  } finally {
    parent.kill('SIGTERM');
    parent.stdin.end();
    await Promise.race([new Promise((resolve) => parent.once('close', resolve)), new Promise((resolve) => setTimeout(resolve, 1000))]);
  }
});
