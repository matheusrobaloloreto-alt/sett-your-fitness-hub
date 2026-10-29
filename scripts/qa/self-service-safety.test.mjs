import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalUrl, assertProject, LOCAL_PROJECT } from './self-service-safety.mjs';

test('only the isolated QA Supabase URL is accepted', () => {
  assert.equal(assertLocalUrl('http://127.0.0.1:57421/rest/v1/'), 'http://127.0.0.1:57421/rest/v1/');
  for (const url of ['https://zshrcgbyhzxpnlccssyz.supabase.co', 'http://127.0.0.1:54321',
    'http://localhost:57421', 'http://127.0.0.1:57421@evil.example', 'http://127.0.0.1:57422']) {
    assert.throws(() => assertLocalUrl(url), /isolated/i);
  }
});

test('project identity rejects linked or canonical projects', () => {
  assert.equal(assertProject(LOCAL_PROJECT, false), LOCAL_PROJECT);
  assert.throws(() => assertProject('zshrcgbyhzxpnlccssyz', false), /isolated/i);
  assert.throws(() => assertProject(LOCAL_PROJECT, true), /linked/i);
});
