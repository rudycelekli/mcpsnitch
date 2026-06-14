import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLsofOutput, eventFromObservation, eventFromObserverStatus, listProfiles } from '../../dist/index.js';

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
  assert.ok(net.findings.some((f) => f.rule === 'observed_unexpected_network_connection'));
  assert.ok(net.findings.every((f) => f.evidence.sampled === true));
  const file = eventFromObservation({ pid: 12345, kind: 'file_open', value: '/Users/rudy/project/.env', fd: '23r' }, { sessionId: 's' });
  assert.equal(file.source, 'process_observer');
  assert.ok(file.findings.some((f) => f.rule === 'observed_sensitive_file_open'));
});



test('package-manager launcher bootstrap network is recorded as info, not a server-profile violation', () => {
  const event = eventFromObservation(
    { pid: 12345, kind: 'network_socket', value: 'TCP 127.0.0.1:1->104.16.0.1:443', fd: '22u', protocol: 'IPv4' },
    { sessionId: 's', profile: 'filesystem', launcherBootstrap: true, launcherCommand: 'npx' },
  );
  assert.equal(event.findings[0].rule, 'observed_expected_launcher_network_connection');
  assert.equal(event.findings[0].severity, 'info');
  assert.equal(event.findings[0].evidence.launcherBootstrap, true);
});

test('server profiles contextualize expected network observations', () => {
  const net = eventFromObservation({ pid: 12345, kind: 'network_socket', value: 'TCP 127.0.0.1:1->140.82.112.6:443', fd: '22u', protocol: 'IPv4' }, { sessionId: 's', profile: 'github' });
  assert.equal(net.findings[0].rule, 'observed_expected_network_connection');
  assert.equal(net.findings[0].severity, 'info');
  assert.equal(net.findings[0].evidence.profile, 'github');
});

test('observer status events make sampled mode and self-report-only downgrade visible', () => {
  const sampled = eventFromObserverStatus({ ok: true, enabled: true, samplingIntervalMs: 250, mode: 'sampled_lsof', profile: 'generic' }, { sessionId: 's' });
  assert.equal(sampled.findings[0].rule, 'process_observer_sampled_mode');
  assert.equal(sampled.findings[0].severity, 'info');
  const downgraded = eventFromObserverStatus({ ok: true, enabled: false, reason: 'lsof not found', samplingIntervalMs: 250, mode: 'self_report_only', profile: 'generic' }, { sessionId: 's' });
  assert.equal(downgraded.findings[0].rule, 'process_observer_unavailable');
  assert.equal(downgraded.findings[0].severity, 'high');
});

test('built-in profiles include common MCP behavior classes', () => {
  const names = listProfiles().map((p) => p.name);
  assert.ok(names.includes('generic'));
  assert.ok(names.includes('filesystem'));
  assert.ok(names.includes('github'));
});
