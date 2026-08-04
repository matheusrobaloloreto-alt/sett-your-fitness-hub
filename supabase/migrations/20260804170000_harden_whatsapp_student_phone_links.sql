-- WhatsApp may identify a Brazilian mobile number with or without its ninth digit.
-- Canonicalize both representations and only link a chat when exactly one student
-- in the same company owns the resulting number.
create or replace function public.sett_phone_key(_value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  with cleaned as (
    select regexp_replace(_value, '[^0-9]', '', 'g') as digits
  ), localized as (
    select case
      when left(digits, 2) = '55' and length(digits) in (12, 13) then substr(digits, 3)
      when length(digits) in (10, 11) then digits
      else null
    end as digits
    from cleaned
  )
  select case
    when length(digits) = 11 and substr(digits, 3, 1) = '9'
      then left(digits, 2) || substr(digits, 4)
    when length(digits) = 10 then digits
    else null
  end
  from localized;
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

-- Repair conversations imported before canonical matching was available.
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
