# Studio integrated publication checks

The fixture suite uses a disposable PostgreSQL database. Apply the migration to that fixture only.

```sh
psql -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/studio_strength_publication_fixture.sql \
  -f supabase/migrations/20260908090000_intercycle_anamnesis.sql \
  -f supabase/migrations/20260909152020_intercycle_manual_link_ready.sql \
  -f supabase/migrations/20260914104500_return_workout_revision_rows.sql \
  -f supabase/migrations/20261026174533_automation_dispatch_recovery.sql \
  -f supabase/migrations/20261026180257_automation_dispatch_status.sql \
  -f supabase/migrations/20261107124507_atomic_studio_strength_publication.sql \
  -f supabase/migrations/20261107141629_studio_strength_generation_idempotency.sql \
  -f supabase/tests/studio_integrated_modalities_fixture.sql \
  -f supabase/migrations/20261109030903_studio_integrated_modalities_publication.sql \
  -f supabase/tests/studio_strength_publication_assertions.sql \
  -f supabase/tests/studio_integrated_modalities_assertions.sql

# Use the same disposable loopback database through PGHOST, PGPORT, PGUSER and PGDATABASE.
node supabase/tests/studio_integrated_modalities_race.mjs

deno test --allow-env --frozen supabase/tests/studio_modality_edges_test.ts supabase/tests/studio_student_visibility_edges_test.ts
npm run test -- src/pages/admin/PrescriptionStudio.generation.test.tsx src/lib/publishStrengthPlan.test.ts src/lib/appIntegrationContracts.test.ts src/lib/cardioPlanEdgeContract.test.ts src/lib/cardioPlanPersistence.test.ts
```

- PostgreSQL assertions cover private generation, exact bundle/cycle/tenant scope, student visibility, restricted write grants, cached clients, omitted modalities, the strength-only shortcut, stale revisions, a new intercycle response with EVA 8, a forced failure after strength and three cardio writes, full commit, replay, prior bundle statuses, and future nutrition visibility.
- The race script waits for actual lock contention in `pg_stat_activity`. An edit that wins the lock invalidates a concurrent publish request with the old version. Two concurrent requests with identical reviewed versions yield one publication and one replay.
- The Edge tests execute the real deterministic generators, editor, meal upload and student BNITO handlers with the Supabase SDK and a synthetic HTTP adapter. They cover cached requests with and without the new marker, undated legacy callers, authentication, rejected stale writes, preservation of future nutrition on upload, and the date scope of student context.
- The Studio tests cover the complete package RPC, an unconfirmed modality, isolated strength, and recovery after a lost generation response.

Dated plans publish one cycle at a time. A nutrition-only or cardio-only bundle keeps the existing strength pointer on the cycle. If a preceding cycle is still a private draft when its successor is published, the successor uses the generated context and omits the live previous-plan foreign key.

For a separately approved release, apply the migration before activating the Edge changes and the Studio frontend. The database guards cover dated requests from cached Studio clients during the transition. An already open, unmarked dated package must be regenerated. Undated legacy endpoints retain live persistence.
