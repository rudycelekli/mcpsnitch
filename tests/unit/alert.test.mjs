import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJsonRpc, eventFromObservation, eventFromObserverStatus, formatActionableAlert } from '../../dist/index.js';

test('process-observer violations produce one-line actionable alerts', () => {
  const event = eventFromObservation(
    { pid: 42, kind: 'network_socket', value: 'TCP 127.0.0.1:49152->203.0.113.7:443', fd: '7u', protocol: 'IPv4' },
    { profile: 'filesystem' },
  );
  const alert = formatActionableAlert(event);
  assert.match(alert, /^MCPSNITCH ALERT /);
  assert.match(alert, /rule=observed_unexpected_network_connection/);
  assert.match(alert, /source=process_observer/);
  assert.match(alert, /profile="filesystem"/);
  assert.match(alert, /verify this server should have network access/);
  assert.equal(alert.split('\n').length, 2);
});

test('info-only observations stay silent', () => {
  const expectedNetwork = eventFromObservation(
    { pid: 42, kind: 'network_socket', value: 'TCP 127.0.0.1:49152->140.82.112.6:443', fd: '7u', protocol: 'IPv4' },
    { profile: 'github' },
  );
  assert.equal(formatActionableAlert(expectedNetwork), '');

  const sampledStatus = eventFromObserverStatus({ ok: true, enabled: true, samplingIntervalMs: 250, mode: 'sampled_lsof', profile: 'github' });
  assert.equal(formatActionableAlert(sampledStatus), '');
});

test('observer downgrade alerts are actionable and explicit', () => {
  const event = eventFromObserverStatus({ ok: true, enabled: false, reason: 'disabled by --no-process-observer', samplingIntervalMs: 250, mode: 'self_report_only', profile: 'generic' });
  const alert = formatActionableAlert(event);
  assert.match(alert, /rule=process_observer_unavailable/);
  assert.match(alert, /self-report-only/);
});


test('JSON-RPC heuristic alerts do not imply profile fixes suppress heuristic findings', () => {
  const event = analyzeJsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'summarize', arguments: { destinationUrl: 'https://example.com' } } });
  const alert = formatActionableAlert(event);
  assert.match(alert, /rule=unexpected_network_destination/);
  assert.match(alert, /source=jsonrpc_heuristic/);
  assert.match(alert, /profiles only contextualize OS process observations/);
});
