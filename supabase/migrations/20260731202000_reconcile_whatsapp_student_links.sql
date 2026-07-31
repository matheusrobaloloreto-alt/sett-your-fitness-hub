-- Keep WhatsApp audience filters connected to the canonical student record.
-- Only direct phone JIDs and unambiguous company-local phone matches are linked.
create or replace function public.sett_phone_key(_value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  with cleaned as (
    select regexp_replace(_value, '[^0-9]', '', 'g') as digits
  )
  select case
    when length(digits) >= 11 then right(digits, 11)
    when length(digits) >= 10 then right(digits, 10)
    else null
  end
  from cleaned;
$$;

create or replace function public.link_whatsapp_chat_to_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_key text;
  v_student_id uuid;
  v_matches integer;
begin
  if new.student_id is not null or new.remote_jid not like '%@s.whatsapp.net' then
    return new;
  end if;

  v_phone_key := public.sett_phone_key(split_part(new.remote_jid, '@', 1));
  if v_phone_key is null then return new; end if;

  select (array_agg(s.id order by s.id))[1], count(distinct s.id)
  into v_student_id, v_matches
  from public.students s
  where s.company_id = new.company_id
    and v_phone_key in (public.sett_phone_key(s.whatsapp), public.sett_phone_key(s.phone));

  if v_matches = 1 then new.student_id := v_student_id; end if;
  return new;
end;
$$;

drop trigger if exists trg_link_whatsapp_chat_to_student on public.whatsapp_chats;
create trigger trg_link_whatsapp_chat_to_student
before insert or update of company_id, remote_jid, student_id on public.whatsapp_chats
for each row execute function public.link_whatsapp_chat_to_student();

create or replace function public.link_student_to_existing_whatsapp_chats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.whatsapp_chats c
  set student_id = new.id
  where c.company_id = new.company_id
    and c.student_id is null
    and c.remote_jid like '%@s.whatsapp.net'
    and public.sett_phone_key(split_part(c.remote_jid, '@', 1)) in (
      public.sett_phone_key(new.whatsapp),
      public.sett_phone_key(new.phone)
    )
    and 1 = (
      select count(distinct candidate.id)
      from public.students candidate
      where candidate.company_id = new.company_id
        and public.sett_phone_key(split_part(c.remote_jid, '@', 1)) in (
          public.sett_phone_key(candidate.whatsapp),
          public.sett_phone_key(candidate.phone)
        )
    );
  return new;
end;
$$;

drop trigger if exists trg_link_student_existing_whatsapp_chats on public.students;
create trigger trg_link_student_existing_whatsapp_chats
after insert or update of company_id, whatsapp, phone on public.students
for each row execute function public.link_student_to_existing_whatsapp_chats();

-- One-time repair for chats imported before automatic linking existed.
with candidates as (
  select
    c.id as chat_id,
    (array_agg(s.id order by s.id))[1] as student_id,
    count(distinct s.id) as matches
  from public.whatsapp_chats c
  join public.students s
    on s.company_id = c.company_id
   and public.sett_phone_key(split_part(c.remote_jid, '@', 1)) in (
     public.sett_phone_key(s.whatsapp),
     public.sett_phone_key(s.phone)
   )
  where c.student_id is null
    and c.remote_jid like '%@s.whatsapp.net'
  group by c.id
)
update public.whatsapp_chats c
set student_id = candidate.student_id
from candidates candidate
where c.id = candidate.chat_id
  and candidate.matches = 1;

revoke all on function public.sett_phone_key(text) from public;
grant execute on function public.sett_phone_key(text) to authenticated, service_role;
revoke all on function public.link_whatsapp_chat_to_student() from public;
revoke all on function public.link_student_to_existing_whatsapp_chats() from public;
