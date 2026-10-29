-- Local-only: existing staff access stays intact; this opt-in is admin/master only.
begin;
create or replace function public.guard_company_ai_whatsapp_toggle()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare changes_flag boolean;
begin
  if tg_op = 'DELETE' then
    changes_flag := old.bnito_whatsapp_enabled is true;
  elsif tg_op = 'INSERT' then
    changes_flag := new.bnito_whatsapp_enabled is true;
  else
    changes_flag := new.bnito_whatsapp_enabled is distinct from old.bnito_whatsapp_enabled
      or (new.company_id is distinct from old.company_id and new.bnito_whatsapp_enabled is true);
  end if;
  if changes_flag and current_user not in ('postgres', 'service_role')
    and not (public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'master'::public.app_role)) then
    raise exception 'company_ai_whatsapp_admin_required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_company_ai_whatsapp_toggle() from public, anon;
create trigger guard_company_ai_whatsapp_toggle before insert or update or delete on public.company_ai_config
for each row execute function public.guard_company_ai_whatsapp_toggle();
commit;
