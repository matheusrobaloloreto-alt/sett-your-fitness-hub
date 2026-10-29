import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sql } from './self-service-local.mjs';
import { communicationPolicyFixture } from '../../supabase/tests/communication_policy_source.mjs';

const read = file => readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8');
function isolated(label, fixture) {
  const database = `self_service_automation_${label}_${randomUUID().replaceAll('-', '')}`;
  sql(`create database ${database};`);
  try { return sql(fixture, database); }
  finally { sql(`drop database ${database} with (force);`); }
}

test('canonical company communication cadence and consent predicates in fresh local Postgres', { timeout: 120000 }, () => {
  assert.match(isolated('cadence', communicationPolicyFixture()), /communication_policy_local_passed/);
});

test('canonical atomic graph: module grants, rollback, reserved keys and PT409 in fresh local Postgres', { timeout: 120000 }, () => {
  const fixture = read('tests/atomic_automation_graph_fixture.sql')
    .replace('-- ATOMIC_MIGRATION', () => read('migrations/20261026101425_atomic_company_automation_graph.sql'));
  assert.match(isolated('graph', fixture), /atomic_automation_graph_local_passed/);
});
