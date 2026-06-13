import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLsofOutput, eventFromObservation } from '../../dist/index.js';

const SAMPLE = `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345 rudy  cwd    DIR   1,18      640  123 /Users/rudy/project
node    12345 rudy   22u  IPv4   0x0      0t0  TCP 127.0.0.1:50123->93.184.216.34:443 (ESTABLISHED)
node    12345 rudy   23r   REG   1,18       42  456 /Users/rudy/project/.env
`;

test('parses lsof file and network observations', () => {
  const observations = parseLsofOutput(SAMPLE, 12345);
  assert.equal(observations.length, 3);
  assert.ok(observations.some((o) => o.kind === 'network_socket' && o.value.includes('93.184.216.34')));
  assert.ok(observations.some((o) => o.kind === 'file_open' && o.value.endsWith('/.env')));
});

test('process observations become explicit process_observer audit events', () => {
  const net = eventFromObservation({ pid: 12345, kind: 'network_socket', value: 'TCP 127.0.0.1:1->93.184.216.34:443', fd: '22u', protocol: 'IPv4' }, { sessionId: 's' });
  assert.equal(net.source, 'process_observer');
  assert.equal(net.method, 'process/network_socket');
  assert.ok(net.findings.some((f) => f.rule === 'observed_network_connection'));
  const file = eventFromObservation({ pid: 12345, kind: 'file_open', value: '/Users/rudy/project/.env', fd: '23r' }, { sessionId: 's' });
  assert.equal(file.source, 'process_observer');
  assert.ok(file.findings.some((f) => f.rule === 'observed_sensitive_file_open'));
});
