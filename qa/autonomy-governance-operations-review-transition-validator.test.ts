import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modulePath = process.env.SETT_TEST_PGLITE_MODULE;
// Full real operations migration + real forward fix, fresh in-memory database.
// Synthetic dependencies/auth only; never attaches to ROOT's native preview.
test('QA2 nonempty default transitions: 42883 before forward, save/readback and guards after forward',
  { skip: !modulePath, timeout: 30000 }, async () => {
    const { PGlite } = await import(modulePath!);
    const db = new PGlite();
    const company = '10000000-0000-0000-0000-000000000001';
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth; create schema commercial_private;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
        create function auth.role() returns text language sql stable as $$select current_setting('qa.role',true)$$;
        create type public.app_role as enum('master','admin','coordinator','trainer','student');
        create table companies(id uuid primary key);
        create table company_members(company_id uuid,user_id uuid);
        create table user_roles(user_id uuid,role app_role);
        create table students(id uuid primary key,company_id uuid,status text,sales_stage text);
        create table leads(id uuid primary key,company_id uuid,stage text);
        create table company_commercial_settings(company_id uuid,settings jsonb);
        create function public.has_role(uuid,app_role) returns boolean language sql stable security definer as $$select exists(select 1 from user_roles where user_id=$1 and role=$2)$$;
        create function public.can_manage_company_commercial(uuid) returns boolean language sql stable security definer as $$select exists(select 1 from company_members where company_id=$1 and user_id=auth.uid()) and has_role(auth.uid(),'admin')$$;
        create function public.commercial_plain_text(jsonb,integer) returns boolean language sql immutable as $$select jsonb_typeof($1)='string' and length($1#>>'{}')<=$2$$;
        create function public.company_feature_allowed(uuid,text) returns boolean language sql stable as $$select true$$;
        create function commercial_private.feature_allowed(uuid,text) returns boolean language sql stable as $$select true$$;
        grant usage on schema public,auth,commercial_private to authenticated,service_role;
        insert into auth.users values('00000000-0000-0000-0000-000000000001');
        insert into companies values('${company}');
        insert into company_members values('${company}','00000000-0000-0000-0000-000000000001');
        insert into user_roles values('00000000-0000-0000-0000-000000000001','admin');
        select set_config('qa.uid','00000000-0000-0000-0000-000000000001',false);
        select set_config('qa.role','authenticated',false);
      `);
      await db.exec(readFileSync('supabase/migrations/20261028113017_company_operations.sql', 'utf8'));
      const metadata = async () => (await db.query(`select oid::text,proacl::text,prosecdef,provolatile,proconfig
        from pg_proc where oid='public.validate_company_operations(jsonb)'::regprocedure`)).rows[0];
      const before = await metadata();
      await db.exec('set role authenticated');
      const read = async () => (await db.query('select get_company_operations($1) as value', [company])).rows[0].value;
      const save = async (settings: unknown, version: number) => db.query(
        'select save_company_operations($1,$2::jsonb,$3::integer) as value', [company, JSON.stringify(settings), version]);
      const original = await read();
      const defaults = original.settings;
      assert.equal(original.version, 0);
      assert.equal(defaults.transitions.length, 10);
      assert.ok(defaults.transitions.some((t: { from: string; to: string }) => t.from === 'lost' && t.to === 'contacted'));
      await assert.rejects(save(defaults, 0), { code: '42883' });
      assert.deepEqual(await read(), original, 'failed pre-fix save changed snapshot');
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::integer as n from company_operations_history')).rows[0].n, 0);

      await db.exec(readFileSync('supabase/migrations/20261028143000_operations_transition_pair_validation.sql', 'utf8'));
      assert.deepEqual(await metadata(), before, 'forward fix changed function identity/ACL/security configuration');
      await db.exec('set role authenticated');
      const saved = (await save(defaults, 0)).rows[0].value;
      assert.equal(saved.version, 1);
      assert.deepEqual(saved.settings, defaults, 'valid nonempty defaults were rewritten');
      assert.deepEqual(await read(), saved, 'saved nonempty transitions not persisted');
      await assert.rejects(save(defaults, 0), { code: 'PT409' });
      for (const transitions of [
        [...defaults.transitions, defaults.transitions[0]],
        [{ from: 'interested', to: 'interested' }],
        [{ from: 'lost', to: 'fiscal_registration_pending' }],
        [{ from: 'interested', to: 'active' }],
      ]) {
        await assert.rejects(save({ ...defaults, transitions }, 1), { code: '22023' });
      }
      await assert.rejects(save({ ...defaults, reports: [{ id: 'unsafe', title: 'Unsafe', metric: 'paid', display: 'count' }] }, 1), { code: '22023' });
      assert.deepEqual(await read(), saved, 'denied mutation changed version/settings');
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::integer as n from company_operations_history')).rows[0].n, 1);
      await db.exec(`select set_config('qa.uid','00000000-0000-0000-0000-000000000002',false); set role authenticated;`);
      await assert.rejects(save(defaults, 1), { code: '42501' });
    } finally { await db.close(); }
  });
