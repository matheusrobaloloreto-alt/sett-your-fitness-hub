begin;

create index automation_dispatch_acked_receipt_idx on public.automation_dispatch_attempts (provider_message_id)
  where state = 'acked' and provider_message_id is not null;
create index company_message_parts_acked_receipt_idx on public.company_message_parts (receipt)
  where state = 'acked' and receipt is not null;

-- The receipt can arrive before or after the webhook inserts the message.
-- Scope legacy receipts to their owner and only exclude automated sequences.
create function public.is_automated_cadence_receipt(_company_id uuid, _chat_id uuid, _receipt text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (public.has_role(auth.uid(), 'master'::public.app_role) or exists (
    select 1 from public.company_members member
    where member.user_id = auth.uid() and member.company_id = _company_id
  )) and public.has_automated_whatsapp_receipt(_company_id, _chat_id, _receipt);
$$;

revoke all on function public.is_automated_cadence_receipt(uuid,uuid,text) from public, anon;
grant execute on function public.is_automated_cadence_receipt(uuid,uuid,text) to authenticated;

do $migration$
declare
  definition text := pg_get_functiondef('public.operational_contact_cadence(uuid,uuid[])'::regprocedure);
  source text := $source$m.origin in ('panel_manual', 'provider_live', 'provider_history_sync')$source$;
begin
  if strpos(definition, source) = 0 then raise exception 'Contact cadence origin definition changed'; end if;
  execute replace(definition, source, $replacement$m.origin = 'panel_manual'
        or (m.origin in ('provider_live', 'provider_history_sync')
          and not public.is_automated_cadence_receipt(m.company_id, m.chat_id, m.message_id_external))$replacement$);
end
$migration$;

commit;
