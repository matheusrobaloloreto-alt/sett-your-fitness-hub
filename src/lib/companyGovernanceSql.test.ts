import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Existing optional PGlite convention; fresh in-memory database, never a shared port.
describe.runIf(Boolean(process.env.SETT_TEST_PGLITE_MODULE))('company governance SQL', () => {
  it('enforces tenant, recipient, OCC, expiry and permission consumers after reload', async () => {
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
      await actor(1);
      expect((await read()).version).toBe(0);
      await expect(change('request_transfer',{recipient_id:user(4)},0)).rejects.toMatchObject({code:'22023'});
      await expect(change('request_transfer',{recipient_id:user(3)},0)).rejects.toMatchObject({code:'22023'});
      const requested = await change('request_transfer',{recipient_id:user(2)},0);
      const transfer = requested.transfers[0].id;
      expect(requested.owner_id).toBe(user(1));
      await expect(change('accept_transfer',{request_id:transfer},1)).rejects.toMatchObject({code:'42501'});
      await actor(4);
      await expect(read()).rejects.toMatchObject({code:'42501'});
      await expect(change('accept_transfer',{request_id:transfer},1)).rejects.toMatchObject({code:'42501'});
      await actor(3);
      await expect(change('accept_transfer',{request_id:transfer},1)).rejects.toMatchObject({code:'42501'});
      await actor(2);
      expect((await read()).transfers[0].recipient_id).toBe(user(2));
      await expect(change('accept_transfer',{request_id:transfer},0)).rejects.toMatchObject({code:'PT409'});
      // Revalidate live membership/roles and owner, not just the original request.
      await db.exec(`reset role; update public.companies set owner_id='${user(2)}' where id='${company}'; set role authenticated;`);
      await expect(change('accept_transfer',{request_id:transfer},1)).rejects.toMatchObject({code:'PT409'});
      await db.exec(`reset role; update public.companies set owner_id='${user(1)}' where id='${company}'; delete from public.user_roles where user_id='${user(2)}'; set role authenticated;`);
      await expect(change('accept_transfer',{request_id:transfer},1)).rejects.toMatchObject({code:'42501'});
      await db.exec(`reset role; insert into public.user_roles values ('${user(2)}','admin'); set role authenticated;`);
      const accepted = await change('accept_transfer',{request_id:transfer},1);
      expect(accepted.owner_id).toBe(user(2));
      expect((await read()).owner_id).toBe(user(2));
      await expect(change('accept_transfer',{request_id:transfer},2)).rejects.toMatchObject({code:'PT409'});
      expect((await read()).members.filter((m: {roles:string[]})=>m.roles.includes('admin'))).toHaveLength(2);
      await expect(change('save_role',{name:'Forbidden',permissions:['master']},2)).rejects.toMatchObject({code:'22023'});
      const saved = await change('save_role',{name:'Visão da equipe',permissions:['company_dashboard_full']},2);
      const roleId = saved.bundles[0].id;
      await expect(change('assign_role',{role_id:roleId,user_id:user(4)},3)).rejects.toMatchObject({code:'22023'});
      await expect(change('assign_role',{role_id:roleId,user_id:user(5)},3)).rejects.toMatchObject({code:'22023'});
      await change('assign_role',{role_id:roleId,user_id:user(3)},3);
      await actor(3);
      expect((await db.query('select public.has_staff_permission($1,$2) as yes',[company,'company_dashboard_full'])).rows[0].yes).toBe(true);
      expect((await db.query('select public.has_staff_permission($1,$2) as yes',['10000000-0000-4000-8000-000000000002','company_dashboard_full'])).rows[0].yes).toBe(false);
      await expect(change('save_role',{name:'Escalate',permissions:[]},4)).rejects.toMatchObject({code:'42501'});
      await actor(2);
      await change('unassign_role',{role_id:roleId,user_id:user(3)},4);
      await actor(3);
      expect((await db.query('select public.has_staff_permission($1,$2) as yes',[company,'company_dashboard_full'])).rows[0].yes).toBe(false);
      await db.exec(`reset role; insert into staff_permissions values ('${company}','${user(3)}','company_dashboard_full',true); set role authenticated;`);
      expect((await db.query('select public.has_staff_permission($1,$2) as yes',[company,'company_dashboard_full'])).rows[0].yes).toBe(true);
      await actor(2);
      const pending = await change('request_transfer',{recipient_id:user(1)},5);
      await change('cancel_transfer',{request_id:pending.transfers.find((t:{status:string})=>t.status==='pending').id},6);
      const expiring = await change('request_transfer',{recipient_id:user(1)},7);
      const expiredId = expiring.transfers.find((t:{status:string})=>t.status==='pending').id;
      await db.exec(`reset role; update public.company_ownership_requests set expires_at=now()-interval '1 second' where id='${expiredId}'; set role authenticated;`);
      await actor(1);
      expect((await read()).transfers.find((t:{id:string})=>t.id===expiredId).status).toBe('expired');
      await expect(change('accept_transfer',{request_id:expiredId},8)).rejects.toMatchObject({code:'PT409'});
      const expired = await change('expire_transfer',{request_id:expiredId},8);
      expect(expired.version).toBe(9);
      expect(expired.audit.some((e:{action:string})=>e.action==='expire_transfer')).toBe(true);
      const renamed=await change('save_role',{role_id:roleId,name:'Visão renomeada',permissions:['company_dashboard_full']},9);
      expect(renamed.bundles[0].name).toBe('Visão renomeada');
      await change('delete_role',{role_id:roleId},10);
      expect((await read()).bundles).toHaveLength(0);
      await expect(db.query('update public.company_governance_state set version=99')).rejects.toMatchObject({code:'42501'});
      await actor(5);
      await expect(read()).rejects.toMatchObject({code:'42501'});
      await db.exec('reset role; set role anon;');
      await expect(read()).rejects.toMatchObject({code:'42501'});
    } finally { await db.close(); }
  }, 30000);
});
