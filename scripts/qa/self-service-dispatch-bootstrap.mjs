import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sql, privateFile, verifyProject } from './self-service-local.mjs';
import { captureData, assertDataUnchanged, quote } from '../../qa/self-service-dispatch-snapshot.mjs';

// Never replay whole historical migrations: rollout/backfill/DML is excluded.
const files = {
  base: '20260330175153_fa8a3919-7cf0-4576-a68d-6daf91bd7ed4.sql',
  recovery: '20260612230939_progress_photos_automation_recovery.sql',
  phone: '20260804170000_harden_whatsapp_student_phone_links.sql',
  ledger: '20260910103000_weekly_contact_consent_ledger.sql',
  claim: '20260717143000_automation_session_dispatcher.sql',
  intercycle: '20260908090000_intercycle_anamnesis.sql',
};
const sources = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8')]));
function routine(source, name) {
  const match = source.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\bas\\s+(\\$[a-z_]*\\$)[\\s\\S]*?\\1\\s*;`, 'i'));
  assert.ok(match, `Canonical routine missing: ${name}`); return match[0];
}
function table(source, name) {
  const match = source.match(new RegExp(`create table(?: if not exists)? (?:public|private)\\.${name} \\([\\s\\S]*?\\n\\);`, 'i'));
  assert.ok(match, `Canonical table missing: ${name}`);
  return match[0].replace(/^create table(?: if not exists)?/i, 'create table if not exists');
}
verifyProject();
const protectedNames = ['process_automation_triggers','mark_payment_recovery_abandoned','company_contact_window_open','company_communication_number','process_intercycle_anamnesis_schedule'];
const protectedDefinitions = () => JSON.parse(sql(`select json_agg(json_build_object('name',p.proname,'md5',md5(pg_get_functiondef(p.oid))) order by p.proname)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${protectedNames.map(quote).join(',')});`));
const protectedBefore = protectedDefinitions();
assert.equal(protectedBefore.length, protectedNames.length, 'Root cadence/scheduler functions must already be installed');
const before = captureData();
privateFile('self-service-dispatch-bootstrap-before.private.json', JSON.stringify(before));
const statements = [
  'begin;',
  "select pg_advisory_xact_lock(hashtextextended('qa:self-service-dispatch-bootstrap',0));",
  table(sources.base, 'payments'), table(sources.recovery, 'payment_recovery_events'),
  table(sources.base, 'whatsapp_labels'), table(sources.base, 'whatsapp_chat_labels'),
  table(sources.ledger, 'weekly_contact_consent_events'),
  'create schema if not exists private;',
  table(sources.ledger, 'weekly_contact_boolean_write_authorizations'),
  readFileSync(new URL('../../qa/self-service-dispatch-dependencies.sql', import.meta.url), 'utf8'),
  routine(sources.phone, 'sett_phone_key'), routine(sources.recovery, 'get_automation_start_node'),
  ...['weekly_contact_policy_version','weekly_contact_recipient_key','weekly_contact_stored_recipient_key',
    'weekly_contact_current_recipient_key','track_weekly_contact_recipient_generation',
    'guard_weekly_contact_consent_event','guard_weekly_contact_boolean_write','weekly_contact_consent_is_current',
    'record_weekly_contact_consent','weekly_contact_consent_status'].map(name => routine(sources.ledger, name)),
  routine(sources.claim, 'claim_automation_sessions'), routine(sources.intercycle, 'claim_intercycle_anamnesis_deliveries'),
  'create or replace trigger track_weekly_contact_recipient_generation before insert or update on public.students for each row execute function public.track_weekly_contact_recipient_generation();',
  'create or replace trigger guard_weekly_contact_consent_event before insert or update or delete on public.weekly_contact_consent_events for each row execute function public.guard_weekly_contact_consent_event();',
  'create or replace trigger guard_weekly_contact_boolean_write before update of weekly_contact_enabled on public.students for each row execute function public.guard_weekly_contact_boolean_write();',
  ...['payments','payment_recovery_events','whatsapp_labels','whatsapp_chat_labels','weekly_contact_consent_events','whatsapp_chats','whatsapp_messages','flow_sessions'].map(name => `alter table public.${name} enable row level security;`),
  'revoke all on schema private from public,anon,authenticated;',
  'revoke all on private.weekly_contact_boolean_write_authorizations from public,anon,authenticated,service_role;',
  'revoke all on public.weekly_contact_consent_events from public,anon,authenticated;',
  'grant select on public.weekly_contact_consent_events to authenticated;',
  'grant all on public.payments,public.payment_recovery_events,public.whatsapp_labels,public.whatsapp_chat_labels,public.whatsapp_chats,public.whatsapp_messages,public.flow_sessions to service_role;',
  // Exact canonical grants for ledger helpers and consent write RPC.
  sources.ledger.slice(sources.ledger.indexOf('revoke execute on function public.weekly_contact_policy_version()'), sources.ledger.indexOf('create or replace function public.process_automation_triggers()')),
  'revoke all on function public.claim_automation_sessions(integer),public.claim_intercycle_anamnesis_deliveries(integer),public.get_automation_start_node(uuid) from public,anon,authenticated;',
  'grant execute on function public.claim_automation_sessions(integer),public.claim_intercycle_anamnesis_deliveries(integer),public.get_automation_start_node(uuid) to service_role;',
  'revoke all on function public.sett_phone_key(text) from public;',
  'grant execute on function public.sett_phone_key(text) to authenticated,service_role;',
];
// Add named canonical constraints/policies only if absent, using catalog inspection
// in JS (no SET ROLE, exception probe or migration replay).
const constraints = JSON.parse(sql("select coalesce(json_agg(conname),'[]') from pg_constraint where conrelid='public.students'::regclass;"));
if (!constraints.includes('students_weekly_contact_recipient_generation_nonnegative')) statements.push('alter table public.students add constraint students_weekly_contact_recipient_generation_nonnegative check(weekly_contact_recipient_generation>=0);');
const policies = JSON.parse(sql("select coalesce(json_agg(tablename||':'||policyname),'[]') from pg_policies where schemaname='public';"));
if (!policies.includes('weekly_contact_consent_events:weekly_contact_consent_events_staff_read')) statements.push('create policy weekly_contact_consent_events_staff_read on public.weekly_contact_consent_events for select to authenticated using(public.can_manage_staff_student(company_id,student_id));');
statements.push("notify pgrst,'reload schema';", 'commit;');
const ddl = statements.join('\n');
const manifest = { qaOnly: true, canonicalSources: Object.entries(files).map(([key,file]) => ({ file,sha256:createHash('sha256').update(sources[key]).digest('hex') })),
  additiveFixture: 'qa/self-service-dispatch-dependencies.sql', generatedSha256:createHash('sha256').update(ddl).digest('hex'), protectedBefore };
privateFile('self-service-dispatch-bootstrap.generated.sql', ddl);
privateFile('self-service-dispatch-bootstrap-manifest.private.json', JSON.stringify(manifest,null,2));
if (process.argv[2] === '--apply') {
  sql(ddl);
  const after = assertDataUnchanged(before);
  assert.deepEqual(protectedDefinitions(), protectedBefore, 'Installed cadence/scanners changed');
  privateFile('self-service-dispatch-bootstrap-after.private.json', JSON.stringify(after));
  console.log('QA-only additive dispatcher dependencies installed; preexisting data and cadence/scanner hashes unchanged.');
} else {
  assert.equal(process.argv[2], '--plan', 'Usage: node scripts/qa/self-service-dispatch-bootstrap.mjs --plan|--apply');
  console.log('QA-only plan generated privately; no DDL applied. See qa/self-service-dispatch-dependencies.sql and bootstrap source.');
}
