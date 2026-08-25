# CRM feedback staging rollout

This runbook is limited to the isolated staging project
`ifymocggowdlqqcxugko`. It must not be reused against production without a new
inventory, backup, review, and explicit release gate. Synthetic tests must use
invented tenant, student, phone, JID, and session identifiers; they must not call
the WhatsApp provider or send a message.

## Gate and inventory

- Independent read-only review of commit `cf1b8c7` returned GO with no P0/P1.
- Staging `workout_feedback` currently has zero rows, zero rows with a non-null
  `workout_session_id`, and zero duplicate `(student_id, workout_session_id)`
  groups.
- The table has RLS enabled. The migration adds no table, column, function,
  trigger, policy, grant, role, or search path change.
- Current rollback anchors are staging edge versions
  `student-workout-feedback` v1 and `whatsapp-manager` v3. Retrieve both current
  sources/version metadata immediately before deploy; keep them outside Git and
  do not print their environment values.

Re-run this aggregate-only preflight immediately before the migration. A nonzero
result is a hard stop; feedback must never be deleted, merged, or selected by
name to make the migration pass.

```sql
select count(*)::bigint as duplicate_session_groups
from (
  select student_id, workout_session_id
  from public.workout_feedback
  where workout_session_id is not null
  group by student_id, workout_session_id
  having count(*) > 1
) duplicates;
```

Also inventory table size, non-null session count, RLS state, policies, ACLs,
indexes, and dependent foreign keys before and after. Compare metadata only; do
not export feedback contents.

## Index and lock safety

The partial unique index on `(student_id, workout_session_id)` is the database
idempotency boundary for feedback retries. It both rejects a second feedback for
the same completed session and supports the exact lookup used to return the
already-persisted feedback. Nullable legacy feedback remains outside the key by
design.

`CREATE UNIQUE INDEX` takes a bounded table lock and scans the table. Staging is
currently empty, so use the ordinary form there and verify it immediately. For
production, repeat inventory and choose a separately reviewed maintenance or
online-index plan based on the live row count and write rate; this staging run is
not evidence that a production lock is safe.

## Deploy order

1. Confirm the duplicate preflight is zero and capture metadata-only inventory.
2. Retrieve the two deployed edge versions/sources as rollback material.
3. Apply `20260825150000_workout_feedback_session_idempotency.sql`.
4. Verify the partial unique index definition, duplicate count, RLS, policies,
   table grants/ACLs, and that no function/search-path metadata changed.
5. Deploy `student-workout-feedback`, preserving `verify_jwt = false` because it
   performs its own bearer authentication and tenant checks.
6. Deploy `whatsapp-manager` with JWT verification enabled.
7. Run no-send synthetic contracts: reuse an old unlinked direct JID for the
   same tenant and instance; reject an invalid phone; retry one session without
   a new feedback/chat; reject a cross-tenant chat; reject a mismatched or
   disconnected instance. Provider invocation count must remain zero.
8. Inspect staging function logs and database aggregates. Do not promote.

## Rollback

Rollback never deletes or rewrites feedback:

1. Stop the synthetic runner and redeploy the saved pre-change edge versions
   (`student-workout-feedback` v1, then `whatsapp-manager` v3).
2. Pause feedback writes before removing the idempotency boundary.
3. Run `drop index if exists public.workout_feedback_student_session_key;` only
   if rollback of the schema is required.
4. Recheck feedback row counts, duplicates, RLS, policies, ACLs, and logs.

Dropping the index reopens the duplicate-write risk. Keep feedback submission
paused until the fixed edge and index are restored. Never compensate by deleting
the newer feedback row or merging chats by display name.

## ACL and schema invariants

The migration must leave `public.workout_feedback` ownership, RLS, policies,
table grants, default privileges, and foreign keys unchanged. It introduces no
function, so it must introduce no `SECURITY DEFINER`, `search_path`, execution
grant, or function ACL. Any metadata drift is a rollback condition.
