import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreRegistrationData } from "./preRegistration";

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  lead: null as Record<string, unknown> | null,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  rejectRevision: false,
  readError: null as { message: string } | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => ({
    select: () => {
      const query = {
        eq: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: table === "student_anamneses" ? state.row : state.lead, error: state.readError }),
      };
      return query;
    },
    update: (payload: Record<string, unknown>) => {
      const commit = async () => {
        if (state.rejectRevision) return { data: null, error: null };
        state.updates.push({ table, payload });
        if (table === "student_anamneses") state.row = { ...state.row, ...payload };
        return { data: { id: state.row.id }, error: null };
      };
      const query = {
        eq: () => query, is: () => query, select: () => query,
        maybeSingle: commit,
        then: (resolve: (value: Awaited<ReturnType<typeof commit>>) => void) => commit().then(resolve),
      };
      return query;
    },
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
    state.lead = null;
    state.readError = null;
    state.rejectRevision = false;
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

  it("records only the explicitly edited effective fields, not a notes-only save", async () => {
    state.row.objective = "saude";
    state.row.equipment = "Academia";
    const loaded = canonicalPreRegistrationData(state.row)!;
    await updateStudentPreRegistration({ ...loaded, manualNotes: "New note", editedFields: [] });
    expect(state.updates[0].payload).not.toHaveProperty("objective");
    await updateStudentPreRegistration({
      ...loaded, answers: { ...loaded.answers, objective: "forca" }, editedFields: ["objective"],
    });
    expect(state.row).toMatchObject({
      objective: "forca", equipment: "Academia",
      custom_answers: { staff_pre_registration: { field_updated_at: { objective: expect.any(String) } } },
    });
    expect(state.updates[1].payload).not.toHaveProperty("equipment");
  });

  it("reports a stale scoped write without applying the staff correction", async () => {
    state.row.objective = "saude";
    state.row.updated_at = "2026-10-01T10:00:00Z";
    state.rejectRevision = true;
    const loaded = canonicalPreRegistrationData(state.row)!;
    await expect(updateStudentPreRegistration({
      ...loaded, answers: { ...loaded.answers, objective: "forca" }, editedFields: ["objective"],
      effectiveScope: { companyId: "synthetic-company", studentId: "synthetic-student" },
    })).rejects.toThrow("O registro mudou");
    expect(state.row.objective).toBe("saude");
    expect(state.updates).toEqual([]);
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

  it("prefers canonical answers to an older linked intake and preserves commercial context", async () => {
    state.lead = { id: "lead", pre_registration_answers: { goals: "Old goal", notes: "Old note" }, budget_range: "200_300" };
    await updateStudentPreRegistration({ ...data, budgetRange: null, manualNotes: "" });
    const loaded = await loadStudentPreRegistration({ studentId: "synthetic", companyId: "synthetic-company", phone: "48999990000" });
    expect(loaded).toMatchObject({ source: "student_anamnesis", answers: { goals: "Walk" }, budgetRange: "200_300", manualNotes: "" });
    expect(state.updates.map(entry => entry.table)).toEqual(["student_anamneses"]);
  });

  it("keeps canonical notes in one editor instead of exposing an ignored duplicate answer", () => {
    state.row.notes = "Original note";
    const loaded = canonicalPreRegistrationData(state.row)!;
    expect(loaded.manualNotes).toBe("Original note");
    expect(loaded.answers).not.toHaveProperty("notes");
  });

  it("keeps injuries and current pain separate in canonical and lead writes", async () => {
    state.row.injuries = "Cirurgia anterior";
    await updateStudentPreRegistration({
      ...data, source: "lead", canonicalRecordId: "synthetic", manualNotes: "",
      answers: { current_pain: "", injuries: "Cirurgia anterior", notes: "Old note" },
    });
    expect(state.row).toMatchObject({ injuries: "Cirurgia anterior", notes: null });
    const reloaded = canonicalPreRegistrationData(state.row)!;
    expect(reloaded.answers).toMatchObject({ injuries: "Cirurgia anterior", current_pain: "" });
    const leadAnswers = state.updates[0].payload.pre_registration_answers as Record<string, unknown>;
    expect(leadAnswers).toMatchObject({ injuries: "Cirurgia anterior", current_pain: "" });
    expect(leadAnswers).not.toHaveProperty("notes");
  });

  it("retains the separately labelled current pain when staff replaces old combined history", async () => {
    state.row.injuries = "Cirurgia anterior | Dor atual: joelho EVA 8 | Medicamentos: exemplo";
    const loaded = canonicalPreRegistrationData(state.row)!;
    expect(loaded.answers).toMatchObject({ injuries: "Cirurgia anterior | Medicamentos: exemplo", current_pain: "joelho EVA 8" });
    await updateStudentPreRegistration({
      ...loaded, answers: { ...loaded.answers, injuries: "Histórico revisto" }, editedFields: ["injuries"],
    });
    expect(canonicalPreRegistrationData(state.row)?.answers).toMatchObject({ injuries: "Histórico revisto", current_pain: "joelho EVA 8" });
  });
});
