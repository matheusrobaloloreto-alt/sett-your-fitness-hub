-- Keep the dashboard subscription separate from the chat panel's channel.
-- Postgres Changes still enforces the message table's SELECT policy.
create policy "Staff read their dashboard cadence channel"
on realtime.messages for select to authenticated
using (
  realtime.topic() = 'dashboard-cadence:'
    || public.get_user_company_id(auth.uid())::text || ':' || auth.uid()::text
);
