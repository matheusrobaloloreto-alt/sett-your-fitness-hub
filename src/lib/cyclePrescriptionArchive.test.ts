import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  archiveCyclePrescriptionForStudent,
  buildCyclePrescriptionArchivePayload,
  buildCyclePrescriptionArchivePreviewPayload,
  buildCyclePrescriptionArchiveSuccessMessage,
  buildCyclePrescriptionRestorePayload,
  previewCyclePrescriptionArchiveForStudent,
  restoreCyclePrescriptionForStudent,
} from "./cyclePrescriptionArchive";

const migration = () =>
  readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260908131327_archive_student_cycle_prescription.sql"),
    "utf8",
  );

describe("cycle prescription archive", () => {
  it("builds a deterministic conflict-aware archive payload", () => {
    expect(buildCyclePrescriptionArchivePayload({
      studentId: "student-1",
      cycleId: "cycle-1",
      expectedWorkoutIds: ["workout-b", "workout-a", "workout-a"],
      expectedContentSignature: "  content-v1  ",
      reason: "  refazer do zero  ",
    })).toEqual({
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
      p_expected_workout_ids: ["workout-a", "workout-b"],
      p_expected_content_signature: "content-v1",
      p_reason: "refazer do zero",
    });
  });

  it("builds a restore payload scoped to student and cycle", () => {
    expect(buildCyclePrescriptionRestorePayload({
      studentId: "student-1",
      cycleId: "cycle-1",
      clearEventId: "event-1",
      reason: "  engano  ",
    })).toEqual({
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
      p_clear_event_id: "event-1",
      p_reason: "engano",
    });
  });

  it("builds a staff-only preview payload scoped to student and cycle", () => {
    expect(buildCyclePrescriptionArchivePreviewPayload({
      studentId: "student-1",
      cycleId: "cycle-1",
    })).toEqual({
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
    });
  });

  it("calls only the cycle-level RPCs", async () => {
    const client = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: { ok: true, content_signature: "content-v1" }, error: null })
        .mockResolvedValueOnce({ data: { ok: true }, error: null })
        .mockResolvedValueOnce({ data: { ok: true }, error: null }),
    };

    await previewCyclePrescriptionArchiveForStudent(client, {
      studentId: "student-1",
      cycleId: "cycle-1",
    });
    await archiveCyclePrescriptionForStudent(client, {
      studentId: "student-1",
      cycleId: "cycle-1",
      expectedWorkoutIds: ["workout-1"],
      expectedContentSignature: "content-v1",
    });
    await restoreCyclePrescriptionForStudent(client, {
      studentId: "student-1",
      cycleId: "cycle-1",
    });

    expect(client.rpc).toHaveBeenNthCalledWith(1, "preview_student_cycle_prescription_archive", {
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "archive_student_cycle_prescription", {
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
      p_expected_workout_ids: ["workout-1"],
      p_expected_content_signature: "content-v1",
      p_reason: null,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(3, "restore_student_cycle_prescription", {
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
      p_clear_event_id: null,
      p_reason: null,
    });
  });

  it("lets callers omit only the legacy workout-id snapshot when they send the content signature", () => {
    expect(buildCyclePrescriptionArchivePayload({
      studentId: "student-1",
      cycleId: "cycle-1",
      expectedContentSignature: "content-v1",
    })).toEqual({
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
      p_expected_workout_ids: null,
      p_expected_content_signature: "content-v1",
      p_reason: null,
    });
  });

  it("surfaces RPC errors without swallowing the server reason", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "cycle_prescription_changed_reload_before_clearing" } }),
    };

    await expect(archiveCyclePrescriptionForStudent(client, {
      studentId: "student-1",
      cycleId: "cycle-1",
      expectedContentSignature: "content-v1",
    })).rejects.toThrow("cycle_prescription_changed_reload_before_clearing");
  });

  it("communicates soft archive semantics", () => {
    const message = buildCyclePrescriptionArchiveSuccessMessage(3);

    expect(message.title).toBe("Prescrição do ciclo removida");
    expect(message.description).toContain("ficou vazio de treino");
    expect(message.description).toContain("histórico preservado");
  });

  it("creates a staff-readable event ledger and explicit cleared marker", () => {
    const sql = migration();

    expect(sql).toContain("missing_dependency_training_cycles_superseded_by_cycle_id_apply_20260828023000_first");
    expect(sql).toContain("missing_dependency_workouts_superseded_at_apply_20260903234059_first");
    expect(sql).toContain("missing_dependency_archive_student_workouts_apply_20260908120000_first");
    expect(sql).toContain("missing_dependency_cycle_prescription_tables_apply_prescription_schema_first");
    expect(sql).toContain("missing_dependency_staff_scope_helpers_apply_20260820113000_first");
    expect(sql).toContain("missing_dependency_cycle_prescription_column_%.%");
    expect(sql).toContain("('running_plans', 'status')");
    expect(sql).toContain("create table if not exists public.cycle_prescription_clear_events");
    expect(sql).toContain("alter table public.cycle_prescription_clear_events enable row level security");
    expect(sql).toContain("public.can_read_staff_student(company_id, student_id)");
    expect(sql).not.toContain("s.user_id = auth.uid()");
    expect(sql).toContain("add column if not exists prescription_cleared_at");
    expect(sql).toContain("add column if not exists prescription_cleared_event_id");
    expect(sql).toContain("add column if not exists prescription_cleared_signature");
    expect(sql).toContain("training_cycles_prescription_cleared_event_id_fkey");
  });

  it("exposes a manage-only preview signature without exposing snapshots", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.preview_student_cycle_prescription_archive");
    expect(sql).toContain("public.can_manage_staff_student(cycle.company_id, p_student_id)");
    expect(sql).toContain("'content_signature', active_content_signature");
    expect(sql).toContain("'active_workout_ids', active_workout_ids");
    expect(sql).not.toMatch(/preview_student_cycle_prescription_archive[\\s\\S]*workout_snapshot/);
    expect(sql).toContain("grant execute on function public.preview_student_cycle_prescription_archive(uuid, uuid) to authenticated, service_role");
  });

  it("fails closed to staff managing the exact student/company/cycle", () => {
    const sql = migration();

    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("if actor is null then");
    expect(sql).toContain("cycle.student_id = p_student_id is not true");
    expect(sql).toContain("public.can_manage_staff_student(cycle.company_id, p_student_id)");
    expect(sql).toContain("forbidden_cross_tenant_cycle_prescription_archive");
    expect(sql).toContain("forbidden_cross_tenant_cycle_prescription_restore");
  });

  it("allows only current or future cycles to be cleared", () => {
    const sql = migration();

    expect(sql).toContain("today date := public.current_business_date()");
    expect(sql).toContain("cycle.end_date is null or cycle.end_date < today");
    expect(sql).toContain("only_current_or_future_cycles_can_be_cleared");
  });

  it("archives all active cycle workouts with the existing per-workout recovery path", () => {
    const sql = migration();

    expect(sql).toContain("p_expected_workout_ids uuid[] default null");
    expect(sql).toContain("p_expected_content_signature text,");
    expect(sql).toContain("archive_student_cycle_prescription(uuid, uuid, text, uuid[], text)");
    expect(sql).toContain("cycle_prescription_signature_required");
    expect(sql).toContain("active_content_signature");
    expect(sql).toContain("cycle_prescription_content_changed_reload_before_clearing");
    expect(sql).toContain("cycle_prescription_changed_reload_before_clearing");
    expect(sql).toContain("perform public.archive_student_workout");
    expect(sql).toContain("perform public.restore_student_workout");
    expect(sql).toContain("archived_workouts");
    expect(sql).not.toMatch(/delete\s+from\s+public\.(workouts|workout_logs|workout_sessions|training_cycles)/i);
  });

  it("detaches workout bundles and training plans so cleared content cannot reappear as current", () => {
    const sql = migration();

    expect(sql).toContain("update public.prescription_bundles bundle");
    expect(sql).toContain("training_cycle_id = null");
    expect(sql).toContain("status = 'superseded'");
    expect(sql).toContain("update public.ai_strength_plans strength");
    expect(sql).toContain("update public.running_plans running");
    expect(sql).toContain("end_date = least(coalesce(running.end_date, today), today - 1)");
    expect(sql).not.toContain("update public.nutrition_plans nutrition");
  });

  it("restores only from the archived state and does not promote superseded revisions", () => {
    const sql = migration();

    expect(sql).toContain("and bundle.training_cycle_id is null");
    expect(sql).toContain("coalesce(bundle.status, 'active') = 'superseded'");
    expect(sql).toContain("and bundle.nutrition_plan_id is not distinct from nullif(snapshot_item->>'nutrition_plan_id', '')::uuid");
    expect(sql).toContain("where modality = 'nutricao'");
    expect(sql).toContain("cycle.prescription_cleared_event_id is distinct from clear_event.id");
    expect(sql).toContain("cycle_prescription_clear_event_not_current_for_cycle");
    expect(sql).toContain("cycle_prescription_restore_conflict_archived_bundle_changed");
    expect(sql).toContain("cycle_prescription_restore_conflict_archived_strength_changed");
    expect(sql).toContain("cycle_prescription_restore_conflict_archived_running_changed");
    expect(sql).toContain("cycle_prescription_restore_conflict_bundle_items_changed");
    expect(sql).toContain("and strength.bundle_id is null");
    expect(sql).toContain("and running.bundle_id is null");
    expect(sql).toContain("status = snapshot_item->>'status'");
    expect(sql).not.toMatch(/set\s+status\s*=\s*'active'/i);
    expect(sql).not.toContain("clear_event.cycle_snapshot->>'bundle_id'");
    expect(sql).not.toContain("update public.training_cycles training_cycle\n  set\n    bundle_id");
  });

  it("resets the cleared marker atomically when new training content is inserted", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.reset_cycle_prescription_clear_marker_for_training_content");
    expect(sql).toContain("new_training_content_created");
    expect(sql).toContain("cycle_prescription_clear_marker_workout_cycle_company_mismatch");
    expect(sql).toContain("cycle_prescription_clear_marker_running_cycle_scope_mismatch");
    expect(sql).toContain("drop trigger if exists workouts_reset_cycle_prescription_clear_marker");
    expect(sql).toContain("after insert or update of cycle_id, exercises");
    expect(sql).toContain("drop trigger if exists running_reset_cycle_prescription_clear_marker");
    expect(sql).toContain("when jsonb_typeof(coalesce(new.exercises, '[]'::jsonb)) = 'array'");
    expect(sql).toContain("then jsonb_array_length(coalesce(new.exercises, '[]'::jsonb))");
    expect(sql).toContain("coalesce(new.status, 'active') in ('active', 'scheduled')");
    expect(sql).toContain("when jsonb_typeof(coalesce(new.weeks, '[]'::jsonb)) = 'array'");
    expect(sql).toContain("then jsonb_array_length(coalesce(new.weeks, '[]'::jsonb))");
    expect(sql).not.toContain("bundles_reset_cycle_prescription_clear_marker");
    expect(sql).not.toContain("strength_reset_cycle_prescription_clear_marker");
    expect(sql).not.toContain("nutrition_reset_cycle_prescription_clear_marker");
  });
});
