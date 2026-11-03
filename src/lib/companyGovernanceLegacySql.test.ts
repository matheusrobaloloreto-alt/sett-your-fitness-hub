import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Existing optional PGlite convention; fresh in-memory database, never a shared port.
describe.runIf(Boolean(process.env.SETT_TEST_PGLITE_MODULE))('legacy governance SQL', () => {
  it('initializes only the legacy admin with CAS, audit and replay protection', async () => {
    const { PGlite } = await import(/* @vite-ignore */ process.env.SETT_TEST_PGLITE_MODULE!);
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        grant usage on schema public,auth to authenticated,anon,service_role;
        create type public.app_role as enum ('master','admin','coordinator','trainer','student');
        create table public.companies(id uuid primary key, owner_id uuid, name text);
        create table public.company_members(company_id uuid, user_id uuid, primary key(company_id,user_id));
        create table public.user_roles(user_id uuid, role public.app_role);
        create table public.profiles(user_id uuid, full_name text);
        create table public.staff_permissions(company_id uuid,user_id uuid,permission text,enabled boolean);
        create function public.has_role(uuid,public.app_role) returns boolean language sql stable security definer as $$select exists(select 1 from public.user_roles where user_id=$1 and role=$2)$$;
        create function public.is_company_staff(uuid,uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.company_members m join public.user_roles r on r.user_id=m.user_id where m.user_id=$1 and m.company_id=$2 and r.role in ('admin','coordinator','trainer'))$$;
        insert into auth.users select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,6) i;
        insert into companies values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','One'),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','Two');
        insert into company_members values
          ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
          ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),
          ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003'),
          ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004'),
          ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005');
        insert into user_roles values
          ('00000000-0000-4000-8000-000000000001','admin'),('00000000-0000-4000-8000-000000000002','admin'),
          ('00000000-0000-4000-8000-000000000003','trainer'),('00000000-0000-4000-8000-000000000004','admin'),
          ('00000000-0000-4000-8000-000000000005','student');
      `);
      await db.exec(readFileSync('supabase/migrations/20261028103721_company_governance.sql','utf8'));
      const company = '10000000-0000-4000-8000-000000000001';
      const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
      const actor = async (n: number) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user(n)}',false); set role authenticated;`); };
      const read = async () => (await db.query('select public.get_company_governance($1) as value',[company])).rows[0].value;
      const change = async (action: string, payload: object, version: number) => (await db.query('select public.change_company_governance($1,$2,$3::jsonb,$4) as value',[company,action,JSON.stringify(payload),version])).rows[0].value;
      await db.exec("alter table companies add column owner_user_id uuid;");
      await db.exec(readFileSync('supabase/migrations/20261103124026_company_governance_legacy_initialization.sql','utf8'));
      await db.exec(readFileSync('supabase/migrations/20261103131053_company_governance_init_expired_requests.sql','utf8'));
      await db.exec(`update companies set owner_id=null,owner_user_id='${user(1)}' where id='${company}'`);
      await db.exec(`update companies set owner_user_id=null where id='${company}'`);
      await actor(1);
      expect((await read()).can_initialize).toBe(false);
      await db.exec(`reset role; update companies set owner_user_id='${user(1)}' where id='${company}'; set role authenticated;`);
      await db.exec(`reset role; insert into profiles(user_id,full_name) values ('${user(1)}','Proprietário legado teste'); set role authenticated;`);
      for (const reader of [2,3]) {
        await actor(reader);
        const visible=await read();
        expect(visible.can_initialize).toBe(false);
        expect(visible.legacy_owner_id).toBe(user(1));
        expect(visible.owner_id).toBeNull();
        expect(visible.pending_confirmation).toBe(true);
        expect(visible.members.find((member:{user_id:string})=>member.user_id===visible.legacy_owner_id).name).toBe('Proprietário legado teste');
        await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},0)).rejects.toMatchObject({code:'42501'});
      }
      await actor(2);
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},0)).rejects.toMatchObject({code:'42501'});
      await actor(4);
      await expect(read()).rejects.toMatchObject({code:'42501'});
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},0)).rejects.toMatchObject({code:'42501'});
      await actor(1);
      expect((await read()).can_initialize).toBe(true);
      expect((await read()).owner_id).toBeNull();
      await expect(change('request_transfer',{recipient_id:user(2)},0)).rejects.toMatchObject({code:'42501'});
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(2)},0)).rejects.toMatchObject({code:'PT409'});
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},1)).rejects.toMatchObject({code:'PT409'});
      await db.exec(`reset role; delete from company_members where company_id='${company}' and user_id='${user(1)}'; set role authenticated;`);
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},0)).rejects.toMatchObject({code:'42501'});
      await db.exec(`reset role; insert into company_members values ('${company}','${user(1)}'); delete from user_roles where user_id='${user(1)}'; set role authenticated;`);
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},0)).rejects.toMatchObject({code:'42501'});
      await db.exec(`reset role; insert into user_roles values ('${user(1)}','admin'); update companies set owner_id='${user(2)}' where id='${company}'; set role authenticated;`);
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},0)).rejects.toMatchObject({code:'PT409'});
      expect((await read()).owner_id).toBe(user(2));
      await db.exec(`reset role; update companies set owner_id=null where id='${company}'; set role authenticated;`);
      const otherCompany='10000000-0000-4000-8000-000000000002';
      await db.exec(`reset role;
        insert into company_ownership_requests(company_id,requester_id,recipient_id,expires_at) values
        ('${company}','${user(1)}','${user(2)}',now()+interval '1 hour'),
        ('${otherCompany}','${user(4)}','${user(2)}',now()-interval '1 hour');
        set role authenticated;`);
      expect((await read()).can_initialize).toBe(false);
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},0)).rejects.toMatchObject({code:'PT409'});
      await db.exec(`reset role; update company_ownership_requests set expires_at=now()-interval '1 hour' where company_id='${company}'; set role authenticated;`);
      expect((await read()).can_initialize).toBe(true);
      expect((await read()).transfers[0].status).toBe('expired');
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},1)).rejects.toMatchObject({code:'PT409'});
      await db.exec('reset role');
      expect((await db.query('select status from company_ownership_requests where company_id=$1',[company])).rows[0].status).toBe('pending');
      expect((await db.query('select count(*)::int as count from company_governance_audit where company_id=$1',[company])).rows[0].count).toBe(0);
      await actor(1);
      const saved=await change('initialize_owner',{expected_legacy_owner_id:user(1)},0);
      expect(saved.owner_id).toBe(user(1));
      expect(saved.version).toBe(1);
      expect(saved.owner_kind).toBe('registered');
      expect(saved.audit).toHaveLength(2);
      expect(saved.audit.map((entry:{action:string})=>entry.action).sort()).toEqual(['expire_transfer','initialize_owner']);
      expect(saved.audit.every((entry:{version:number})=>entry.version===1)).toBe(true);
      await db.exec('reset role');
      expect((await db.query('select status from company_ownership_requests where company_id=$1',[otherCompany])).rows[0].status).toBe('pending');
      await actor(1);
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},1)).rejects.toMatchObject({code:'PT409'});
      expect((await read()).version).toBe(1);
      expect((await read()).audit).toHaveLength(2);
      await actor(3);
      await expect(change('initialize_owner',{expected_legacy_owner_id:user(1)},1)).rejects.toMatchObject({code:'42501'});
      await db.exec('reset role; set role anon;');
      await expect(read()).rejects.toMatchObject({code:'42501'});
    } finally { await db.close(); }
  }, 30000);
});
