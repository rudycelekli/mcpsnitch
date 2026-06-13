#!/usr/bin/env node
import { openSync, closeSync, writeFileSync } from 'node:fs';
import net from 'node:net';

const mode = process.argv[2];
const arg = process.argv[3];
const held = [];
function ready(extra = {}) {
  process.stdout.write(JSON.stringify({ ready: true, mode, ...extra }) + '\n');
}
function stayAlive() {
  setInterval(() => undefined, 10_000).unref?.();
  process.stdin.resume();
}

if (mode === 'hold-file') {
  const fd = openSync(arg, 'r');
  held.push(() => closeSync(fd));
  ready({ path: arg });
  stayAlive();
} else if (mode === 'hold-socket') {
  const [host, portText] = arg.split(':');
  const socket = net.connect(Number(portText), host, () => ready({ host, port: Number(portText) }));
  held.push(() => socket.destroy());
  stayAlive();
} else if (mode === 'short-socket') {
  const [host, portText] = arg.split(':');
  const socket = net.connect(Number(portText), host, () => {
    socket.end();
    ready({ host, port: Number(portText), shortLived: true });
  });
  stayAlive();
} else if (mode === 'write-and-hold-file') {
  writeFileSync(arg, 'MCPSNITCH_TEST_SECRET=1\n');
  const fd = openSync(arg, 'r');
  held.push(() => closeSync(fd));
  ready({ path: arg });
  stayAlive();
} else {
  console.error(`unknown mode ${mode}`);
  process.exit(2);
}

process.on('SIGTERM', () => { for (const fn of held) { try { fn(); } catch {} } process.exit(0); });
process.on('SIGINT', () => { for (const fn of held) { try { fn(); } catch {} } process.exit(0); });
