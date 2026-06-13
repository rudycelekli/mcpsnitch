import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeProfile, writeProfile, resolveProfile, learnProfileFromEvents, eventFromObservation } from '../../dist/index.js';

test('custom profile files can be declared and resolved', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-profile-'));
  const file = join(root, 'custom.json');
  writeProfile(file, makeProfile({ name: 'slack', description: 'Slack MCP server', allowNetwork: true, allowFileRead: true, allowSensitiveFiles: false }));
  const profile = resolveProfile(file);
  assert.equal(profile.name, 'slack');
  assert.equal(profile.allowNetwork, true);
  const net = eventFromObservation({ pid: 42, kind: 'network_socket', value: 'TCP 127.0.0.1:1->203.0.113.7:443', fd: '7u', protocol: 'IPv4' }, { profile });
  assert.equal(net.findings[0].rule, 'observed_expected_network_connection');
});

test('learned profiles infer network/file behavior but never sensitive-file permission', () => {
  const events = [
    eventFromObservation({ pid: 1, kind: 'network_socket', value: 'TCP 127.0.0.1:1->203.0.113.7:443', fd: '1u', protocol: 'IPv4' }, { profile: 'generic' }),
    eventFromObservation({ pid: 1, kind: 'file_open', value: '/Users/alice/project/.env', fd: '2r' }, { profile: 'generic' }),
  ];
  const profile = learnProfileFromEvents(events, { name: 'learned-server' });
  assert.equal(profile.allowNetwork, true);
  assert.equal(profile.allowFileRead, true);
  assert.equal(profile.allowSensitiveFiles, false);
  assert.ok(profile.expectedNetworkDestinations.some((value) => value.includes('203.0.113.7')));
  assert.ok(profile.expectedFilePaths.some((value) => value.endsWith('/.env')));
});
