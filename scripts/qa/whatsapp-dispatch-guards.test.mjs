import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractWhatsAppDeliveryUpdates, shouldApplyWhatsAppDeliveryStatus } from "../../supabase/functions/_shared/whatsappDeliveryStatus.ts";

// Run with SETT_QA_PGLITE_MODULE pointing to an installed PGlite ESM entry.
const { PGlite } = await import(process.env.SETT_QA_PGLITE_MODULE || "@electric-sql/pglite");
const cadenceRollbackSql = readFileSync(new URL("../../supabase/tests/contact_cadence_rollback.sql", import.meta.url), "utf8");
const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

const company = "00000000-0000-0000-0000-000000000001";
const flow = "00000000-0000-0000-0000-000000000002";
const chat = "00000000-0000-0000-0000-000000000003";
const student = "00000000-0000-0000-0000-000000000004";
const instance = "00000000-0000-0000-0000-000000000005";
const owner = "00000000-0000-0000-0000-000000000006";
const lease = "00000000-0000-0000-0000-000000000007";
const actor = "00000000-0000-0000-0000-000000000008";
const foreignCompany = "00000000-0000-0000-0000-000000000009";
const trainerActor = "00000000-0000-0000-0000-000000000014";
const studentActor = "00000000-0000-0000-0000-000000000015";
const recipient = "15550100100@s.whatsapp.net";

test("synthetic weekly dispatch and cadence migrations on isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema commercial_private;
    revoke all on schema commercial_private from public, anon, authenticated;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create table public.companies(id uuid primary key);
    create type public.app_role as enum ('master', 'admin', 'coordinator', 'trainer', 'student');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('sett.test_actor', true), '')::uuid $$;
    create table public.user_roles(user_id uuid, role public.app_role);
    create function public.has_role(_actor uuid, _role app_role) returns boolean
      language sql stable security definer set search_path = '' as $$
        select exists(select 1 from public.user_roles where user_id = _actor and role = _role)
      $$;
    create table public.company_members(user_id uuid, company_id uuid);
    create table public.role_permissions(company_id uuid, role text, module text, enabled boolean);
    create table public.fixture_company_features(company_id uuid, feature text, allowed boolean);
    create function commercial_private.feature_allowed(_company_id uuid, _feature text) returns boolean
      language sql stable security definer set search_path = '' as $$
        select coalesce((select allowed from public.fixture_company_features
          where company_id = _company_id and feature = _feature), true)
      $$;
    create table public.company_product_settings(company_id uuid, settings jsonb);
    create table public.students(id uuid primary key, company_id uuid, full_name text, status text, whatsapp text, phone text,
      weekly_contact_recipient_generation bigint, opted_in boolean, user_id uuid);
    create table public.enrollments(id uuid default gen_random_uuid(), company_id uuid, student_id uuid, status text,
      payment_status text, training_start_date date, start_date date, end_date date, created_at timestamptz default now());
    create table public.workout_sessions(student_id uuid, status text, completed_at timestamptz, session_date date);
    create table public.payments(id uuid, student_id uuid, status text, created_at timestamptz);
    create table public.payment_recovery_events(id uuid, company_id uuid, student_id uuid, plan_id uuid,
      payment_id uuid, enrollment_id uuid, event_type text, occurred_at timestamptz);
    create function public.mark_payment_recovery_abandoned() returns integer language sql as $$ select 0 $$;
    create function public.get_automation_start_node(uuid) returns text language sql as $$ select 'node'::text $$;
    create table public.whatsapp_instances(id uuid primary key, company_id uuid, status text);
    create table public.whatsapp_chats(id uuid primary key, company_id uuid, student_id uuid, remote_jid text,
      instance_id uuid, contact_name text, created_at timestamptz default now(), cadence_muted boolean, is_archived boolean);
    create table public.whatsapp_messages(chat_id uuid, company_id uuid, timestamp timestamptz,
      failed_at timestamptz, is_from_me boolean, status text, type text, origin text, sender_id text, message_id_external text);
    create unique index test_provider_message_key on public.whatsapp_messages (chat_id, message_id_external);
    create table public.automation_flows(id uuid primary key, company_id uuid, is_active boolean, trigger_type text);
    create table public.automation_flow_edges(flow_id uuid, source_node_id text, target_node_id text);
    create table public.flow_sessions(id uuid primary key default gen_random_uuid(), flow_id uuid, chat_id uuid, current_node_id text,
      status text, context jsonb, created_at timestamptz default now(), started_at timestamptz, last_activity_at timestamptz, updated_at timestamptz);
    create table public.intercycle_anamnesis_deliveries(id uuid primary key, company_id uuid, student_id uuid, status text,
      last_error_code text, next_attempt_at timestamptz, updated_at timestamptz, scheduled_for timestamptz, sent_at timestamptz);
    create table public.webhook_dispatch_owners(id uuid primary key, company_id uuid, chat_id uuid,
      status text, dispatch_lease_token uuid, dispatch_lease_until timestamptz);
    create table public.company_message_sequences(id uuid primary key, company_id uuid, chat_id uuid, scope jsonb, snapshot jsonb);
    create table public.company_message_parts(sequence_id uuid, part_index integer, state text, token uuid, receipt text, updated_at timestamptz);
    create function public.weekly_contact_recipient_key(text) returns text language sql immutable as
      $$ select split_part($1, '@', 1) $$;
    create function public.weekly_contact_current_recipient_key(text,text,text) returns text language sql immutable as
      $$ select split_part(coalesce($1,$2), '@', 1) $$;
    create function public.weekly_contact_consent_is_current(uuid,uuid,text,bigint) returns boolean
      language sql stable as $$ select opted_in from public.students
        where id = $1 and company_id = $2 and weekly_contact_recipient_generation = $4 $$;
    create function public.get_company_dashboard_snapshot(_company_id uuid) returns jsonb
      language plpgsql stable security definer set search_path = '' as $$
    begin
      if not public.is_company_staff(auth.uid(), _company_id) then
        raise exception 'Company dashboard access denied' using errcode='42501';
      end if;
      return (with students_scope as (select id from public.students where company_id = _company_id)
        select jsonb_build_object('contactCadence', (select m.last_inbound_at from (values (null::text)) m(last_inbound_at)),
          'atRiskStudents', '[]'::jsonb, 'dashboardMarker', 'preserved'));
    end
    $$;
  `);
  const staffMigration = migration("20260718120000_harden_student_tenant_isolation");
  await db.exec(staffMigration.slice(staffMigration.indexOf("create or replace function public.is_company_staff"),
    staffMigration.indexOf("create or replace function public.is_student_company_staff")));
  const entitlements = migration("20261026174537_company_feature_entitlements");
  await db.exec(entitlements.slice(entitlements.indexOf("create function public.company_feature_allowed("),
    entitlements.indexOf("create function public.set_company_feature_policy(")));
  await db.exec(entitlements.slice(entitlements.indexOf("-- Wrap the actual dedicated report"),
    entitlements.indexOf("do $install$ begin\n  if to_regprocedure('public.reassign_student_trainer")));
  await db.exec(migration("20260903110927_track_whatsapp_delivery_receipts"));
  await db.exec(`
    grant select on public.whatsapp_chats, public.whatsapp_messages, public.students, public.company_members, public.user_roles, public.role_permissions to authenticated;
    alter table public.whatsapp_chats enable row level security;
    alter table public.whatsapp_messages enable row level security;
    create policy staff_chats on public.whatsapp_chats for select to authenticated
      using (public.is_company_staff(auth.uid(), company_id));
    create policy staff_messages on public.whatsapp_messages for select to authenticated
      using (public.is_company_staff(auth.uid(), company_id));
    create policy feature_chats on public.whatsapp_chats as restrictive for select to authenticated
      using (public.company_feature_allowed(company_id, 'hasWhatsApp'));
    create policy feature_messages on public.whatsapp_messages as restrictive for select to authenticated
      using (public.company_feature_allowed(company_id, 'hasWhatsApp'));
  `);
  const consentMigration = migration("20260910103000_weekly_contact_consent_ledger");
  await db.exec(consentMigration.slice(consentMigration.indexOf("create or replace function public.process_automation_triggers()"), consentMigration.lastIndexOf("commit;")));
  const policyMigration = migration("20261026093137_company_communication_cadence");
  await db.exec(`${policyMigration.split("-- One durable receipt")[0]} commit;`);
  await db.exec(migration("20261026174533_automation_dispatch_recovery"));
  const webhookMigration = migration("20261028130000_communications_reconciliation");
  await db.exec(webhookMigration.slice(webhookMigration.indexOf("alter table public.automation_dispatch_attempts drop constraint"),
    webhookMigration.indexOf("create function public.claim_webhook_dispatch")));
  await db.exec(migration("20261028114539_company_agenda_availability"));
  const cadenceMigration = migration("20261109055838_contact_cadence_company_closures");
  const checkMissingCadencePrerequisite = async () => {
    await assert.rejects(() => db.exec(cadenceMigration), /Install the agenda, original cadence, and provider receipt migrations/);
    await db.exec("rollback");
  };
  await checkMissingCadencePrerequisite();
  await db.exec(migration("20261107225000_contact_cadence_unanswered"));
  await db.exec(migration("20261109002000_weekly_contact_dispatch_guards"));
  await checkMissingCadencePrerequisite();
  await db.exec(migration("20261109002100_contact_cadence_provider_echoes"));
  await db.exec(cadenceMigration.replace(/commit;\s*$/i, "rollback;"));
  assert.equal(await scalar("select to_regprocedure('operational_contact_cadence_status(uuid, uuid[])') result"), null);
  await db.exec(cadenceMigration);
  await db.exec(migration("20261110120000_index_contact_cadence_message_lookup"));
  await db.exec(`
    select set_config('sett.test_actor', '${actor}', false);
    insert into auth.users values ('${actor}'), ('${trainerActor}'), ('${studentActor}');
    insert into public.companies values ('${company}'), ('${foreignCompany}');
    insert into public.user_roles values ('${actor}', 'admin'), ('${trainerActor}', 'trainer'), ('${studentActor}', 'student');
    insert into company_members values ('${actor}', '${company}'), ('${trainerActor}', '${company}'), ('${studentActor}', '${company}');
    insert into public.role_permissions values ('${company}', 'trainer', 'whatsapp', true);
    insert into students values ('${student}', '${company}', 'Synthetic Student', 'active', '${recipient}', null, 1, true);
    insert into enrollments(company_id,student_id,status,start_date,end_date)
      values ('${company}', '${student}', 'active',
        (now() at time zone 'America/Sao_Paulo')::date - 1,
        (now() at time zone 'America/Sao_Paulo')::date + 1);
    insert into whatsapp_instances values ('${instance}', '${company}', 'connected');
    insert into whatsapp_chats(id,company_id,student_id,instance_id,remote_jid)
      values ('${chat}', '${company}', '${student}', '${instance}', '${recipient}');
    insert into automation_flows values ('${flow}', '${company}', true, 'weekly_contact');
    insert into flow_sessions(id, flow_id, chat_id, status, context, dispatch_lease_token, dispatch_lease_until)
    values ('${owner}', '${flow}', '${chat}', 'processing', jsonb_build_object('trigger_type','weekly_contact',
      'student_id','${student}','recipient_candidate','${recipient}','recipient_generation',1), '${lease}', now()+interval '1 hour');
  `);
  const prepare = () => scalar("select prepare_automation_dispatch('flow',$1,$2,'message') result", [owner, lease]);
  const authorize = () => scalar("select authorize_automation_dispatch('flow',$1,$2,'message') result", [owner, lease]);
  const state = () => scalar("select state result from automation_dispatch_attempts where owner_id=$1", [owner]);
  const check = () => scalar("select weekly_contact_dispatch_check($1) result", [owner]);

  await t.test("rejects revoked consent, changed generation, closed window and a foreign enrollment", async () => {
    assert.equal(await prepare(), "prepared");
    await db.exec("update students set opted_in=false");
    await assert.rejects(authorize, /weekly_contact_ineligible/);
    assert.equal(await state(), "prepared");
    await db.exec("update students set opted_in=true, weekly_contact_recipient_generation=2");
    assert.equal(await check(), "weekly_contact_ineligible");
    await db.exec("update students set weekly_contact_recipient_generation=1");
    await db.exec(`insert into company_product_settings values ('${company}', '{"contact_policy":{"weekdays":[]}}');`);
    assert.equal(await check(), "weekly_contact_window_closed");
    await db.exec(`delete from company_product_settings;
      update enrollments set company_id='${foreignCompany}';`);
    assert.equal(await check(), "weekly_contact_ineligible");
    await db.exec(`update enrollments set company_id='${company}';`);
    assert.equal(await check(), "eligible");
  });

  await t.test("scheduler and dispatcher share configurable inactivity and tenant checks", async () => {
    const queued = () => scalar("select (process_automation_triggers()->>'weekly_contact')::int result");
    await db.exec(`update flow_sessions set status='cancelled' where id='${owner}';
      update automation_flows set weekly_contact_inactivity_hours=24;
      update whatsapp_chats set created_at=now()-interval '8 days';
      update enrollments set company_id='${foreignCompany}';`);
    assert.equal(await queued(), 0);
    await db.exec(`update enrollments set company_id='${company}';
      insert into whatsapp_messages values ('${chat}','${company}',now(),null,false,'sent','text','provider_live',null,'recent-inbound');`);
    assert.equal(await queued(), 0);
    await db.exec("update whatsapp_messages set type='reaction' where message_id_external='recent-inbound'");
    assert.equal(await queued(), 1);
    assert.equal(await queued(), 0);
    await db.exec(`delete from flow_sessions where id <> '${owner}';
      update flow_sessions set status='processing' where id='${owner}';
      update whatsapp_messages set type='text' where message_id_external='recent-inbound';`);
    assert.equal(await check(), "weekly_contact_conversation_active");
    await assert.rejects(authorize, /weekly_contact_conversation_active/);
    assert.equal(await state(), "prepared");
    const sequence = "00000000-0000-0000-0000-000000000011";
    const scope = { kind: "flow", ownerId: owner, leaseToken: lease };
    await db.query("insert into company_message_sequences values ($1,$2,$3,$4,'{}')", [sequence, company, chat, scope]);
    await db.query("insert into company_message_parts values ($1,0,'pending',null,null,now())", [sequence]);
    await assert.rejects(() => db.query("select claim_company_message_part($1,0,$2)", [sequence, scope]),
      /weekly_contact_conversation_active/);
    assert.equal(await scalar("select state result from company_message_parts where sequence_id=$1", [sequence]), "pending");
    await db.query("update company_message_parts set state='acked', receipt='automated-echo' where sequence_id=$1", [sequence]);
    await db.exec("update whatsapp_messages set is_from_me=true, message_id_external='automated-echo'");
    assert.equal(await check(), "eligible");
    await db.exec("update whatsapp_messages set message_id_external='direct-outgoing'");
    assert.equal(await check(), "weekly_contact_conversation_active");
    await db.exec("delete from company_message_parts; delete from company_message_sequences; delete from whatsapp_messages; update automation_flows set weekly_contact_inactivity_hours=0");
    assert.equal(await check(), "eligible");
  });

  await t.test("scheduler and worker reject expired and future enrollment dates", async () => {
    const queued = () => scalar("select (process_automation_triggers()->>'weekly_contact')::int result");
    const localDay = "(now() at time zone 'America/Sao_Paulo')::date";
    for (const [start, end] of [[-8, -1], [1, 8]]) {
      await db.exec(`update enrollments set status='active', start_date=${localDay} + (${start}), end_date=${localDay} + (${end});`);
      await assert.rejects(authorize, /weekly_contact_ineligible/);
      await db.exec(`update flow_sessions set status='cancelled' where id='${owner}'`);
      assert.equal(await queued(), 0);
      await db.exec(`update flow_sessions set status='processing' where id='${owner}'`);
      assert.equal(await state(), "prepared");
    }
    await db.exec(`update enrollments set status='awaiting_training', training_start_date=null,
      start_date=${localDay}, end_date=${localDay}`);
    assert.equal(await check(), "eligible");
    const at = (stamp) => scalar("select weekly_contact_eligibility($1,$2,$3,$4,1,$5,$6) result",
      [flow, chat, student, recipient, owner, stamp]);
    await db.exec("update enrollments set start_date='2026-11-09',end_date='2026-11-09'");
    assert.equal(await at("2026-11-09T02:59:59Z"), "weekly_contact_ineligible");
    assert.equal(await at("2026-11-09T03:00:00Z"), "eligible");
    assert.equal(await at("2026-11-10T02:59:59Z"), "eligible");
    assert.equal(await at("2026-11-10T03:00:00Z"), "weekly_contact_ineligible");
    await db.exec(`update enrollments set status='active', start_date=${localDay}-1, end_date=${localDay}+1`);
  });

  await t.test("only legacy webhook in-flight attempts authorize, and each lease authorizes once", async () => {
    await db.query("select begin_automation_dispatch('flow',$1,$2,'legacy-flow')", [owner, lease]);
    await assert.rejects(() => db.query("select authorize_automation_dispatch('flow',$1,$2,'legacy-flow')", [owner, lease]),
      /dispatch_attempt_lost/);
    await db.exec("delete from automation_dispatch_attempts where send_key='legacy-flow'");
    const webhook = "00000000-0000-0000-0000-000000000012";
    await db.query("insert into webhook_dispatch_owners values ($1,$2,$3,'processing',$4,now()+interval '1 hour')",
      [webhook, company, chat, lease]);
    await db.query("select begin_automation_dispatch('webhook',$1,$2,'text')", [webhook, lease]);
    const authorizeWebhook = () => db.query("select authorize_automation_dispatch('webhook',$1,$2,'text')", [webhook, lease]);
    await authorizeWebhook();
    await assert.rejects(authorizeWebhook, /dispatch_attempt_lost/);
    await assert.rejects(() => db.query("select begin_automation_dispatch('webhook',$1,$2,'text')", [webhook, lease]),
      /dispatch_uncertain/);
  });

  await t.test("queued or cancelled rows without intent consume zero budget; acknowledged and uncertain sends still count", async () => {
    const historical = "00000000-0000-0000-0000-000000000010";
    await db.exec(`insert into flow_sessions(id,flow_id,chat_id,status,context,created_at)
      values ('${historical}', '${flow}', '${chat}', 'cancelled',
        '{"trigger_type":"weekly_contact","student_id":"${student}"}', now());`);
    assert.equal(await check(), "eligible");
    await db.query("update flow_sessions set created_at=now()-interval '8 days' where id=$1", [historical]);
    for (const evidence of ["prepared", "in_flight", "acked"]) {
      await db.query(`insert into automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state)
        values ('flow',$1,'message',$2,$3)
        on conflict(kind,owner_id,send_key) do update set state=excluded.state`, [historical, lease, evidence]);
      assert.equal(await check(), evidence === "prepared" ? "eligible" : "weekly_contact_interval_blocked");
    }
    await db.exec(`delete from automation_dispatch_attempts where owner_id='${historical}';
      delete from flow_sessions where id='${historical}';`);
  });

  await t.test("pausing cancels queued work and preserves uncertain dispatch for reconciliation", async () => {
    await authorize();
    await assert.rejects(authorize, /dispatch_attempt_lost/);
    assert.equal(await state(), "in_flight");
    await assert.rejects(prepare, /dispatch_uncertain/);
    await db.exec(`
      insert into flow_sessions(id, flow_id, chat_id, status)
        values (gen_random_uuid(), '${flow}', '${chat}', 'active'),
          (gen_random_uuid(), '${flow}', '${chat}', 'waiting_response');
      update automation_flows set is_active=false;
      insert into flow_sessions(id, flow_id, chat_id, status)
        values (gen_random_uuid(), '${flow}', '${chat}', 'active');
    `);
    assert.equal(await scalar("select count(*)::int result from flow_sessions where status='cancelled'"), 2);
    assert.equal(await scalar("select context->>'dispatch_error' result from flow_sessions where id=$1", [owner]), "dispatch_uncertain");
    await assert.rejects(authorize, /dispatch_lease_lost/);
    await db.exec("update automation_flows set is_active=true");
    assert.equal(await scalar("select count(*)::int result from claim_automation_sessions(25)"), 0);
    await assert.rejects(() => db.query("select ack_automation_dispatch('flow',$1,gen_random_uuid(),'message','late')", [owner]),
      /dispatch_lease_lost/);
    await db.query("select ack_automation_dispatch('flow',$1,$2,'message','late')", [owner, lease]);
    assert.equal(await state(), "acked");
    assert.equal(await scalar("select status result from flow_sessions where id=$1", [owner]), "cancelled");
    assert.equal(await scalar("select count(*)::int result from claim_automation_sessions(25)"), 0);
  });

  await t.test("cadence SQL fixture rolls back clocks, calendar, messages and access probes", async () => {
    try {
      await db.exec(cadenceRollbackSql);
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
    assert.equal(await scalar("select count(*)::int result from company_agenda_availability"), 0);
    assert.equal(await scalar("select count(*)::int result from whatsapp_messages"), 0);
    assert.equal(await scalar("select count(*)::int result from whatsapp_chats"), 1);
    assert.equal(await scalar("select count(*)::int result from pg_policies where policyname like 'cadence_fixture_%'"), 0);
  });

  await t.test("unknown provider echoes never reset cadence before or after reconciliation", async () => {
    const outgoing = (receipt, timestamp, origin, sender = null) => db.query(`insert into whatsapp_messages
      values ($1,$2,$3,null,true,'sent','text',$4,$5,$6)`, [chat, company, timestamp, origin, sender, receipt]);
    const ack = (receipt, key) => db.query(`insert into automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state,provider_message_id)
      values ('flow',$1,$2,$3,'acked',$4)`, [owner, key, lease, receipt]);
    const last = () => scalar("select to_char(last_team_message_at at time zone 'UTC','HH24:MI') result from operational_contact_cadence($1)", [company]);
    await outgoing("legacy", "2025-11-09T09:00:00Z", "unknown", actor);
    assert.equal(await last(), "09:00");
    await outgoing(null, "2025-11-09T09:30:00Z", "provider_history_sync");
    await outgoing("echo-first", "2025-11-09T10:00:00Z", "provider_live");
    assert.equal(await last(), "09:00");
    await ack("echo-first", "echo");
    assert.equal(await last(), "09:00");
    await ack("ack-first", "ack");
    await outgoing("ack-first", "2025-11-09T11:00:00Z", "provider_live", actor);
    assert.equal(await last(), "09:00");
    await outgoing("student-actor", "2025-11-09T11:15:00Z", "provider_live", studentActor);
    await outgoing("untrusted-actor", "2025-11-09T11:30:00Z", "provider_live", "5511999990002@s.whatsapp.net");
    assert.equal(await last(), "09:00");
    await outgoing("staff-provider", "2025-11-09T12:00:00Z", "provider_history_sync", actor);
    assert.equal(await last(), "12:00");
  });

  await t.test("literal webhook ACKs preserve the confirmed manual send and never qualify placeholders", async () => {
    const at = "2025-11-10T08:00:00Z";
    await db.query("insert into whatsapp_messages values ($1,$2,$3,null,true,'sent','text','panel_manual',$4,'manual-ack')",
      [chat, company, at, actor]);
    const assertLast = (expected) => scalar("select last_team_message_at = $2::timestamptz result from operational_contact_cadence($1)",
      [company, expected]).then(actual => assert.equal(actual, true));
    for (const status of [2, "SENT", "DELIVERY_ACK", "READ"]) {
      const [receipt] = extractWhatsAppDeliveryUpdates({ event: "MESSAGES_UPDATE", data: { keyId: "manual-ack", status } });
      assert.equal(receipt.normalizedStatus, status === "READ" ? "read" : status === "DELIVERY_ACK" ? "delivered" : "accepted");
      const previous = await scalar("select status result from whatsapp_messages where message_id_external = $1", [receipt.messageExternalId]);
      assert.equal(shouldApplyWhatsAppDeliveryStatus(previous, receipt.normalizedStatus), true);
      await db.query(`update whatsapp_messages set status=$1, provider_status=$2, provider_status_at=now()
        where company_id=$3 and message_id_external=$4 and is_from_me`,
      [receipt.normalizedStatus, receipt.providerStatus, company, receipt.messageExternalId]);
      await assertLast(at);
    }
    await db.query(`insert into whatsapp_messages
      (chat_id, company_id, timestamp, is_from_me, status, type, origin, sender_id, message_id_external, provider_status, provider_status_at)
      values ($1,$2,now(),true,'accepted','text','panel_manual',$3,'generic-ack','ACCEPTED',now()),
        ($1,$2,now(),true,'accepted','text','panel_manual',$3,'missing-ack-time','SERVER_ACK',null),
        ($1,$2,now(),true,'accepted','text','panel_manual',null,'missing-actor','SERVER_ACK',now()),
        ($1,$2,now(),true,'accepted','text','panel_manual',$3,null,'SERVER_ACK',now()),
        ($1,$2,now(),true,'sent','text','panel_manual',$3,'',null,null),
        ($1,$2,now(),true,'accepted','text','provider_live',null,'provider-only-ack','SENT',now())`, [chat, company, actor]);
    await assertLast(at);
  });
});
