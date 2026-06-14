import { spawn } from 'node:child_process';
const fixture = new URL('../../bench/fixtures/live-mcp-server.mjs', import.meta.url).pathname;
const file = process.argv[2];
const child = spawn(process.execPath, [fixture, 'hold-file', file], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
process.stdin.resume();
function cleanup() { child.kill('SIGTERM'); }
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });
