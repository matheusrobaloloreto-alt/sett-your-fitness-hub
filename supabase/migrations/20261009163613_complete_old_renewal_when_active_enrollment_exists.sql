-- An older renewal alert must not remain open after a later enrollment is active.
create or replace function public.complete_prior_renewals_on_activation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;

  update public.enrollments prior
  set status = 'completed'
  where prior.student_id = new.student_id
    and prior.company_id = new.company_id
    and prior.id <> new.id
    and prior.status = 'awaiting_renewal'
    and prior.created_at < new.created_at
    and prior.end_date < new.start_date;
  return new;
end;
$$;

revoke all on function public.complete_prior_renewals_on_activation()
  from public, anon, authenticated;
drop trigger if exists zz_complete_prior_renewals_on_activation on public.enrollments;
create trigger zz_complete_prior_renewals_on_activation
after insert or update of status on public.enrollments
for each row execute function public.complete_prior_renewals_on_activation();
