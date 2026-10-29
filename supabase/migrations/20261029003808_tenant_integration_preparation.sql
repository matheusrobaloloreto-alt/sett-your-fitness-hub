-- Preparation only. No resolver, network call, active-provider toggle or plaintext read RPC.
-- Vault must already be installed; do not silently create an unencrypted fallback.
do $$
begin
 if to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null then
  raise exception 'Vault prerequisite missing' using errcode='55000';
 end if;
 if has_any_column_privilege('anon','vault.secrets','SELECT') or has_any_column_privilege('authenticated','vault.secrets','SELECT')
 or has_any_column_privilege('anon','vault.decrypted_secrets','SELECT') or has_any_column_privilege('authenticated','vault.decrypted_secrets','SELECT') then
  raise exception 'Vault client access must be revoked before preparation' using errcode='55000';
 end if;
end $$;

create schema if not exists integration_private;
revoke all on schema integration_private from public,anon,authenticated,service_role;
create table integration_private.credentials (
 company_id uuid not null references public.companies(id) on delete cascade,
 provider text not null check(provider in ('asaas','whatsapp_evolution')),
 secret_id uuid unique references vault.secrets(id),
 version integer not null check(version>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(company_id,provider)
);
alter table integration_private.credentials enable row level security;
revoke all on integration_private.credentials from public,anon,authenticated,service_role;

create function integration_private.assert_admin(_company_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or _company_id is null or not exists(select 1 from public.companies where id=_company_id)
 or not (public.has_role(auth.uid(),'master'::public.app_role) or
 (public.has_role(auth.uid(),'admin'::public.app_role) and exists(
 select 1 from public.company_members where company_id=_company_id and user_id=auth.uid()))) then
  raise exception 'Not authorized' using errcode='42501';
 end if;
end $$;

create function integration_private.validate_credentials(_provider text,_credentials jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare k text;
begin
 if _provider is null or _provider not in ('asaas','whatsapp_evolution') or jsonb_typeof(_credentials) is distinct from 'object'
 or octet_length(_credentials::text)>6000 then raise exception 'Invalid integration configuration' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(_credentials))<>2 then raise exception 'Invalid integration fields' using errcode='22023';end if;
 k:=_credentials->>'api_key';
 if jsonb_typeof(_credentials->'api_key') is distinct from 'string' or k is null or length(k)<16 or length(k)>4096
 or k ~ '[^!-~]' then raise exception 'Invalid credential format' using errcode='22023';end if;
 if _provider='asaas' then
  if not (_credentials ?& array['api_key','environment']) or jsonb_typeof(_credentials->'environment') is distinct from 'string'
  or (_credentials->>'environment') not in ('sandbox','production') then raise exception 'Invalid Asaas environment' using errcode='22023';end if;
 else
  if not (_credentials ?& array['api_key','base_url']) or jsonb_typeof(_credentials->'base_url') is distinct from 'string'
  or length(_credentials->>'base_url')>500
  or (_credentials->>'base_url') !~ '^https://([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(:443)?(/[A-Za-z0-9_./~-]*)?$'
  then raise exception 'Invalid Evolution HTTPS base URL' using errcode='22023';end if;
 end if;
end $$;

create function public.get_company_integration_status(_company_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform integration_private.assert_admin(_company_id);
 select jsonb_agg(jsonb_build_object('provider',p.provider,'configured',c.secret_id is not null,
 'mask',case when c.secret_id is not null then '••••••••' else null end,
 'version',coalesce(c.version,0),'consumer_enabled',false) order by p.provider) into result
 from (values ('asaas'),('whatsapp_evolution')) p(provider)
 left join integration_private.credentials c on c.company_id=_company_id and c.provider=p.provider;
 return result;
end $$;

create function public.save_company_integration_credentials(_company_id uuid,_provider text,_credentials jsonb,_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_row integration_private.credentials;new_secret uuid;
begin
 perform integration_private.assert_admin(_company_id);
 perform integration_private.validate_credentials(_provider,_credentials);
 if _expected_version is null or _expected_version<0 then raise exception 'Expected version required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('integration:'||_company_id::text||':'||_provider,0));
 select * into current_row from integration_private.credentials where company_id=_company_id and provider=_provider for update;
 if coalesce(current_row.version,0)<>_expected_version then raise exception 'Reload integration status' using errcode='PT409';end if;
 new_secret:=vault.create_secret(_credentials::text);
 if new_secret is null then raise exception 'Vault unavailable' using errcode='55000';end if;
 insert into integration_private.credentials(company_id,provider,secret_id,version,updated_by)
 values(_company_id,_provider,new_secret,_expected_version+1,auth.uid())
 on conflict(company_id,provider) do update set secret_id=excluded.secret_id,version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
 if current_row.secret_id is not null then delete from vault.secrets where id=current_row.secret_id;end if;
 return public.get_company_integration_status(_company_id);
exception when sqlstate '42501' then raise exception 'Not authorized' using errcode='42501';
 when sqlstate '22023' then raise exception 'Invalid integration configuration' using errcode='22023';
 when sqlstate 'PT409' then raise exception 'Reload integration status' using errcode='PT409';
 when others then raise exception 'Integration vault write unavailable' using errcode='55000';
end $$;

create function public.remove_company_integration_credentials(_company_id uuid,_provider text,_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_row integration_private.credentials;
begin
 perform integration_private.assert_admin(_company_id);
 if _provider is null or _provider not in ('asaas','whatsapp_evolution') or _expected_version is null or _expected_version<0 then
 raise exception 'Invalid integration request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('integration:'||_company_id::text||':'||_provider,0));
 select * into current_row from integration_private.credentials where company_id=_company_id and provider=_provider for update;
 if coalesce(current_row.version,0)<>_expected_version then raise exception 'Reload integration status' using errcode='PT409';end if;
 -- Keep a versioned tombstone: stale drafts cannot recreate deleted credentials.
 insert into integration_private.credentials(company_id,provider,secret_id,version,updated_by)
 values(_company_id,_provider,null,_expected_version+1,auth.uid())
 on conflict(company_id,provider) do update set secret_id=null,version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
 if current_row.secret_id is not null then delete from vault.secrets where id=current_row.secret_id;end if;
 return public.get_company_integration_status(_company_id);
exception when sqlstate '42501' then raise exception 'Not authorized' using errcode='42501';
 when sqlstate '22023' then raise exception 'Invalid integration configuration' using errcode='22023';
 when sqlstate 'PT409' then raise exception 'Reload integration status' using errcode='PT409';
 when others then raise exception 'Integration vault removal unavailable' using errcode='55000';
end $$;

create function integration_private.cleanup_secret() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.secret_id is not null then delete from vault.secrets where id=old.secret_id;end if;
 return old;
end $$;
create trigger cleanup_company_integration_secret after delete on integration_private.credentials
 for each row execute function integration_private.cleanup_secret();
revoke all on all functions in schema integration_private from public,anon,authenticated,service_role;
revoke all on function public.get_company_integration_status(uuid),public.save_company_integration_credentials(uuid,text,jsonb,integer),public.remove_company_integration_credentials(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_company_integration_status(uuid),public.save_company_integration_credentials(uuid,text,jsonb,integer),public.remove_company_integration_credentials(uuid,text,integer) to authenticated;
