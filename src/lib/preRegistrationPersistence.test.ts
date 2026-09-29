import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreRegistrationData } from "./preRegistration";

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  readError: null as { message: string } | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => ({
    select: () => {
      const query = {
        eq: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: table === "student_anamneses" ? state.row : null, error: state.readError }),
      };
      return query;
    },
    update: (payload: Record<string, unknown>) => ({ eq: async () => {
      state.updates.push({ table, payload });
      if (table === "student_anamneses") state.row = { ...state.row, ...payload };
      return { error: null };
    } }),
  }) },
}));
import {
  canonicalPreRegistrationData,
  loadStudentPreRegistration,
  updateStudentPreRegistration,
} from "./preRegistrationData";

const data: PreRegistrationData = {
  recordId: "synthetic", source: "student_anamnesis", submittedAt: null,
  budgetRange: "300_400", preferredContactPeriod: "afternoon", manualNotes: "Internal",
  answers: { has_kitchen: false, modalities: ["strength"], goals: "Walk", days_strength: 3 },
};

describe("canonical staff editing round trip", () => {
  beforeEach(() => {
    state.row = {
      id: "synthetic", has_kitchen: true, wants_running: true, has_nutritionist: true,
      training_modality: "old", prescribed_modalities: ["old"],
      custom_answers: { intake: { label: "Original", value: "Preserve" } },
    };
    state.updates = [];
    state.readError = null;
  });

  it("reloads kitchen, aliases, extensions and metadata after the real UPDATE path", async () => {
    await updateStudentPreRegistration(data);
    const reloaded = canonicalPreRegistrationData(state.row);
    expect(reloaded).toMatchObject({
      answers: { has_kitchen: false, modalities: ["strength"], goals: "Walk", days_strength: 3 },
      budgetRange: "300_400", preferredContactPeriod: "afternoon", manualNotes: "Internal",
    });
    expect(state.row.custom_answers).toMatchObject({ intake: { label: "Original", value: "Preserve" } });
    expect(state.updates[0].payload).not.toHaveProperty("wants_running");
    expect(state.updates[0].payload).not.toHaveProperty("has_nutritionist");
    expect(state.row).toMatchObject({ wants_running: true, has_nutritionist: true });
  });

  it("preserves existing extension answers on a notes-only save", async () => {
    state.row.custom_answers = { intake: { label: "Original", value: "Preserve" }, staff_pre_registration: {
      answers: { goals: "Old goal", modalities: ["running"] },
      budgetRange: "300_400", preferredContactPeriod: "morning",
    } };
    const loaded = canonicalPreRegistrationData(state.row)!;
    await updateStudentPreRegistration({ ...loaded, manualNotes: "New note" });
    expect(canonicalPreRegistrationData(state.row)).toMatchObject({
      answers: { goals: "Old goal", modalities: ["running"] }, manualNotes: "New note",
    });
  });

  it("merges custom answers for the lead-to-canonical update too", async () => {
    await updateStudentPreRegistration({ ...data, source: "lead", recordId: "lead", canonicalRecordId: "synthetic" });
    expect(state.updates.map((entry) => entry.table)).toEqual(["leads", "student_anamneses"]);
    expect(canonicalPreRegistrationData(state.row)?.answers.has_kitchen).toBe(false);
    expect(state.row.custom_answers).toMatchObject({ intake: { label: "Original", value: "Preserve" } });
  });

  it("does not start either write if loading existing extension fails", async () => {
    state.readError = { message: "Read denied" };
    await expect(updateStudentPreRegistration({ ...data, source: "lead", canonicalRecordId: "synthetic" }))
      .rejects.toThrow("Read denied");
    expect(state.updates).toEqual([]);
  });

  it("reloads persisted extension through the actual canonical fallback loader", async () => {
    await updateStudentPreRegistration(data);
    const loaded = await loadStudentPreRegistration({ studentId: "synthetic", companyId: "synthetic-company" });
    expect(loaded).toMatchObject({
      recordId: "synthetic", source: "student_anamnesis",
      answers: { has_kitchen: false, goals: "Walk", modalities: ["strength"] },
    });
  });

  it("keeps canonical notes in one editor instead of exposing an ignored duplicate answer", () => {
    state.row.notes = "Original note";
    const loaded = canonicalPreRegistrationData(state.row)!;
    expect(loaded.manualNotes).toBe("Original note");
    expect(loaded.answers).not.toHaveProperty("notes");
  });

  it("does not resurrect cleared pain or notes on canonical reload or lead alias fallback", async () => {
    await updateStudentPreRegistration({
      ...data, source: "lead", canonicalRecordId: "synthetic", manualNotes: "",
      answers: { current_pain: "", injuries: "Old pain", notes: "Old note" },
    });
    expect(state.row).toMatchObject({ injuries: null, notes: null });
    const reloaded = canonicalPreRegistrationData(state.row)!;
    expect(reloaded.manualNotes).toBe("");
    expect(reloaded.answers).not.toHaveProperty("injuries");
    const leadAnswers = state.updates[0].payload.pre_registration_answers as Record<string, unknown>;
    expect(leadAnswers.injuries).toBe("");
    expect(leadAnswers).not.toHaveProperty("notes");
  });
});
