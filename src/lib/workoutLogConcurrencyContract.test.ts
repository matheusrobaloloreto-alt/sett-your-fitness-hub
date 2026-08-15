import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("workout log optimistic concurrency", () => {
  it("saves through a revision-checked RPC instead of a blind upsert", () => {
    const portal = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260814203000_workout_log_revision_guard.sql",
      "utf8",
    );

    expect(portal).toContain('rpc("save_workout_logs_if_current"');
    expect(portal).toContain("canonicalizeWorkoutLogBatchRows(rows)");
    expect(portal).toContain("{ _rows: canonicalRows }");
    expect(portal).not.toContain('.upsert(rows, { onConflict: "student_id,workout_id,exercise_index,set_number,session_date" })');
    expect(migration).toContain("where id = current_row.id and revision = expected_revision");
    expect(migration).toContain("current_row.revision <> expected_revision");
    expect(migration).toContain("jsonb_array_length(_rows) > 200");
    expect(migration).toContain("join public.training_cycles tc on tc.id = w.cycle_id");
    expect(migration).toContain("tc.student_id = s.id");
    expect(migration).toContain("tc.company_id = s.company_id");
    expect(migration).toContain("w.company_id = s.company_id");
    expect(migration).toContain("exercise_index is required");
    expect(migration).toContain("set_number is required");
    expect(migration).toContain("session_date is required");
    expect(migration).toContain("workout_logs_identity_fields_required");
    expect(migration).toContain("exercise_index is not null");
    expect(migration).toContain("session_date is not null");
    expect(migration).toContain("item_exercise_index >= jsonb_array_length(workout_exercises)");
    expect(migration).toContain("exercise_index out of workout range");
    expect(migration).toContain("greatest(base_set_count, weekly_set_count, 1) + 5");
    expect(migration).toContain("set_number exceeds prescribed sets plus five extras");
    expect(migration).toContain("tombstone set_number exceeds prescribed sets plus five extras");
    expect(migration).toContain("rpe out of range");
    expect(migration).toContain("session_date out of range");
    expect(migration).toContain("security definer");
    expect(migration).toContain("owner_user_id is distinct from caller_user_id");
    expect(migration).toContain("public.is_company_staff(caller_user_id, owner_company_id)");
    expect(migration).toContain("caller_role <> 'service_role'");
    expect(migration).toContain("actor cannot write workout logs for this student tenant");
    expect(migration).toContain("to authenticated, service_role");
  });

  it("keeps the valid path bounded to real exercise JSON and five UI extras", () => {
    const portal = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260814203000_workout_log_revision_guard.sql",
      "utf8",
    );

    expect(migration).toContain("exercise_definition := workout_exercises -> item_exercise_index");
    expect(migration).toContain("then exercise_definition->'weekly_prescription'");
    expect(migration).toContain("saved := saved || jsonb_build_array(to_jsonb(current_row))");
    expect(portal).toContain("const MAX_EXTRA_SETS = 5");
    expect(portal).toContain("current >= MAX_EXTRA_SETS");
    expect(portal).toContain("inferExtraSetsFromPersistedLogs(allLogs, workoutId, selectedWorkout.exercises, todayStr)");
    expect(portal).toContain("extraSetsByWorkoutRef.current[workoutId]");
  });

  it("persists deletion and renumbering as one revision-guarded transaction", () => {
    const portal = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
    const card = readFileSync("src/components/student/ExerciseCard.tsx", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260814203000_workout_log_revision_guard.sql",
      "utf8",
    );
    const conflictGate = migration.indexOf("if jsonb_array_length(conflicts) > 0 then");
    const deleteOffset = migration.indexOf("delete from public.workout_logs", conflictGate);
    const upsertOffset = migration.indexOf("insert into public.workout_logs", deleteOffset);

    expect(portal).toContain("removeAndRenumberWorkoutSet(");
    expect(portal).toContain("deleted: log.deleted === true");
    expect(portal).toContain("if (deletionConflict)");
    expect(card).toContain("onRemoveSet(idx, s + 1)");
    expect(migration).toContain("deleted must be a boolean");
    expect(migration).toContain("requested_deleted");
    expect(migration).toContain("target_has_tombstone");
    expect(migration).toContain("for update of w");
    expect(conflictGate).toBeGreaterThan(0);
    expect(deleteOffset).toBeGreaterThan(conflictGate);
    expect(upsertOffset).toBeGreaterThan(deleteOffset);
  });

  it("rejects duplicate identities before DML and only permits a tombstone replacement pair", () => {
    const migration = readFileSync(
      "supabase/migrations/20260814203000_workout_log_revision_guard.sql",
      "utf8",
    );
    const fn = migration.slice(migration.indexOf("create or replace function public.save_workout_logs_if_current"));
    const uniquenessGate = fn.indexOf("duplicate workout log identity in batch");
    const canonicalAssignment = fn.indexOf("_rows := canonical_rows");
    const firstWorkoutLock = fn.indexOf("for update of w");
    const firstDelete = fn.indexOf("delete from public.workout_logs");
    const firstUpdate = fn.indexOf("update public.workout_logs");
    const firstInsert = fn.indexOf("insert into public.workout_logs");

    expect(fn).toContain("count(*) = 2");
    expect(fn).toContain("canonical_rows jsonb := '[]'::jsonb");
    expect(fn).toContain("'exercise_index', item_exercise_index");
    expect(fn).toContain("'set_number', item_set_number");
    expect(fn).toContain("'session_date', to_char(item_session_date, 'YYYY-MM-DD')");
    expect(canonicalAssignment).toBeGreaterThan(0);
    expect(canonicalAssignment).toBeLessThan(uniquenessGate);
    expect(canonicalAssignment).toBeLessThan(firstWorkoutLock);
    expect(fn).toContain("count(*) filter (where coalesce((item->>'deleted')::boolean, false)) = 1");
    expect(fn).toContain("replacement paired with tombstone must be a new insert");
    expect(fn).toContain("item ? 'base_revision' and jsonb_typeof(item->'base_revision') <> 'null'");
    expect(fn).toContain("item ? 'id' and jsonb_typeof(item->'id') <> 'null'");
    expect(fn.indexOf("replacement paired with tombstone must be a new insert")).toBeLessThan(fn.indexOf("for update of w"));
    expect(uniquenessGate).toBeGreaterThan(0);
    expect(firstDelete).toBeGreaterThan(uniquenessGate);
    expect(firstUpdate).toBeGreaterThan(uniquenessGate);
    expect(firstInsert).toBeGreaterThan(uniquenessGate);
  });

  it("denies direct browser DML while preserving tenant reads and the guarded RPC", () => {
    const accessMigration = readFileSync(
      "supabase/migrations/20260814220000_lock_down_workout_log_dml.sql",
      "utf8",
    );
    expect(accessMigration).toContain("revoke insert, update, delete on public.workout_logs from public, anon, authenticated");
    expect(accessMigration).toContain('drop policy if exists "Student manages own logs"');
    expect(accessMigration).toContain('drop policy if exists "Company staff manage workout logs"');
    expect(accessMigration).toContain('drop policy if exists "Master full access"');
    expect(accessMigration).toContain('create policy "Students read own workout logs"');
    expect(accessMigration).toContain('create policy "Company staff read workout logs"');
    expect(accessMigration).toContain("grant all on public.workout_logs to service_role");
    expect(accessMigration).toContain("grant execute on function public.save_workout_logs_if_current(jsonb)");
  });

  it("has no runtime direct writer outside the guarded RPC", () => {
    const matches = execFileSync("rg", [
      "-l", "workout_logs", "src", "supabase/functions", "--glob", "*.ts", "--glob", "*.tsx",
    ], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    expect(matches).toContain("src/pages/student/StudentPortal.tsx");
    for (const file of matches) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from\(["']workout_logs["']\)\s*\.(insert|update|delete|upsert)\s*\(/s);
    }
  });
});
