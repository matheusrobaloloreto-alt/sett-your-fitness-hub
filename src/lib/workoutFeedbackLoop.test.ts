import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildWorkoutFeedbackRecord,
  normalizeWorkoutFeedbackPayload,
} from "../../supabase/functions/_shared/student-workout-feedback";

const MIGRATION = "supabase/migrations/20260824120000_workout_feedback_trainer_replies.sql";
const EDGE = "supabase/functions/student-workout-feedback/index.ts";

const read = (path: string) => readFileSync(path, "utf8");

describe("student workout feedback edge payload", () => {
  it("normalizes legacy and new payloads without accepting emoji-only feedback", () => {
    expect(() => normalizeWorkoutFeedbackPayload({ feedback: "🔥🔥" })).toThrow(/texto/i);

    expect(normalizeWorkoutFeedbackPayload({
      perception: "Difícil",
      reflection: "Senti a lombar no final.",
      workout_title: "Treino A - Inferiores <script>",
      workout_session_id: "session-1",
    })).toEqual({
      perception: "Difícil",
      reflection: "Senti a lombar no final.",
      workoutTitle: "Treino A - Inferiores",
      workoutSessionId: "session-1",
    });

    expect(normalizeWorkoutFeedbackPayload({
      rating: "Bom",
      feedback: "Foi controlado.",
    })).toMatchObject({
      perception: "Bom",
      reflection: "Foi controlado.",
    });
  });

  it("builds the persisted row with a sanitized workout title and no WhatsApp dependency", () => {
    const row = buildWorkoutFeedbackRecord({
      studentId: "student-1",
      companyId: "company-1",
      payload: normalizeWorkoutFeedbackPayload({
        perception: "Ótimo",
        reflection: "Sem dor hoje.",
        workout_title: " Treino B  ",
        workout_session_id: "session-1",
      }),
    });

    expect(row).toMatchObject({
      student_id: "student-1",
      company_id: "company-1",
      workout_session_id: "session-1",
      workout_title: "Treino B",
      difficulty: 3,
      notes: "Percepção: Ótimo\nSem dor hoje.",
      pain_areas: [],
    });
  });
});

describe("workout feedback trainer reply migration contract", () => {
  it("adds nullable reply columns, size/coherence checks, and no speculative index", () => {
    const migration = read(MIGRATION);

    expect(migration).toContain("add column if not exists workout_title text");
    expect(migration).toContain("add column if not exists trainer_reply text");
    expect(migration).toContain("add column if not exists trainer_replied_at timestamptz");
    expect(migration).toContain("add column if not exists trainer_replied_by uuid");
    expect(migration).toContain("add column if not exists trainer_reply_author_name text");
    expect(migration).toContain("workout_feedback_workout_title_length");
    expect(migration).toContain("workout_feedback_trainer_reply_length");
    expect(migration).toContain("workout_feedback_trainer_reply_complete");
    expect(migration).toContain("columns are nullable and have no backfill");
    expect(migration).not.toMatch(/create\s+index/i);
    expect(migration).not.toMatch(/not\s+valid/i);
  });

  it("uses a fail-closed RPC so staff cannot forge reply authorship or cross tenants", () => {
    const migration = read(MIGRATION);

    expect(migration).toContain("create or replace function public.reply_to_workout_feedback");
    expect(migration).toContain("auth.uid() is null");
    expect(migration).toContain("public.is_company_staff(v_actor, v_feedback.company_id)");
    expect(migration).toContain("trainer_replied_by = v_actor");
    expect(migration).toContain("trainer_reply_author_name = v_author_name");
    expect(migration).toContain("drop policy if exists \"Company staff update workout feedback\"");
    expect(migration).toContain("revoke update on public.workout_feedback from authenticated");
    expect(migration).toContain("revoke all on function public.reply_to_workout_feedback(uuid, text) from public");
    expect(migration).toContain("grant execute on function public.reply_to_workout_feedback(uuid, text) to authenticated");
    expect(migration).toContain("revoke all on function public.guard_workout_feedback_reply_columns() from public");
  });

  it("keeps the edge on the app database record before optional WhatsApp delivery", () => {
    const edge = read(EDGE);

    expect(edge).toContain("normalizeWorkoutFeedbackPayload");
    expect(edge).toContain("buildWorkoutFeedbackRecord");
    expect(edge.indexOf(".from(\"workout_feedback\").insert")).toBeLessThan(edge.indexOf(".from(\"whatsapp_messages\").insert"));
  });
});
