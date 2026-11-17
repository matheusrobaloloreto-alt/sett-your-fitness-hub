import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalAnamnesisUpdateFromPreRegistration, canonicalPreRegistrationData } from "@/lib/preRegistrationData";

function source(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

describe("pre-registration editing contract", () => {
  it("clears active pain and notes while preserving legacy clinical history on reload", () => {
    const existing = { injuries: "Cirurgia anterior | Dor atual: joelho", notes: "Nota anterior" };
    const update = canonicalAnamnesisUpdateFromPreRegistration({
      source: "student_anamnesis", submittedAt: null, budgetRange: null, preferredContactPeriod: null,
      manualNotes: "", answers: { injuries: "Cirurgia anterior", current_pain: "" }, editedFields: ["current_pain"],
    }, {}, existing.injuries);
    expect(update).not.toHaveProperty("injuries");
    expect(update.notes).toBeNull();
    const reloaded = canonicalPreRegistrationData({ ...existing, ...update });
    expect(reloaded).toMatchObject({
      answers: { injuries: "Cirurgia anterior", current_pain: "" }, manualNotes: "",
    });
  });
  it.each([true, false, null])("persists kitchen availability %s without changing absent preferences", (hasKitchen) => {
    const update = canonicalAnamnesisUpdateFromPreRegistration({
      source: "student_anamnesis", budgetRange: null, preferredContactPeriod: null,
      submittedAt: null, answers: { has_kitchen: hasKitchen },
    });
    expect(update).toHaveProperty("has_kitchen", hasKitchen);
    expect(update).not.toHaveProperty("wants_nutrition");
    expect(update).not.toHaveProperty("has_endurance_coach");
  });

  it("preserves non-column editable answers in the canonical extension", () => {
    const update = canonicalAnamnesisUpdateFromPreRegistration({
      source: "student_anamnesis", budgetRange: "300_400", preferredContactPeriod: "afternoon",
      submittedAt: null, answers: { goals: "Keep moving", training_days: ["monday"], current_pain: false },
    });
    expect(update).toMatchObject({
      custom_answers: { staff_pre_registration: {
        answers: { goals: "Keep moving", training_days: ["monday"], current_pain: false },
        budgetRange: "300_400", preferredContactPeriod: "afternoon",
      } },
    });
    expect(update).not.toHaveProperty("injuries");
    expect(update).not.toHaveProperty("goals");
    expect(update).not.toHaveProperty("wants_strength");
  });

  it("does not reinterpret intake integration preferences as canonical staff edits", () => {
    const update = canonicalAnamnesisUpdateFromPreRegistration({
      source: "lead", budgetRange: null, preferredContactPeriod: null, submittedAt: null,
      answers: { wants_running: false, has_nutritionist: false, shown_blocks: ["strength"] },
    });
    expect(update).not.toHaveProperty("wants_running");
    expect(update).not.toHaveProperty("has_nutritionist");
    expect(update).not.toHaveProperty("shown_blocks");
    expect(update).toMatchObject({ custom_answers: { staff_pre_registration: { answers: {
      wants_running: false, has_nutritionist: false, shown_blocks: ["strength"],
    } } } });
  });

  it("maps editable staff fields to canonical columns and keeps active pain separate", () => {
    const update = canonicalAnamnesisUpdateFromPreRegistration({
      recordId: "anamnesis-1",
      source: "student_anamnesis",
      budgetRange: null,
      preferredContactPeriod: null,
      submittedAt: "2026-09-21T12:00:00.000Z",
      manualNotes: "Priorizar técnica antes de carga.",
      answers: {
        objective: "performance",
        days_strength: 4,
        days_cardio: 2,
        session_duration_min: 60,
        injuries: "Cirurgia anterior",
        current_pain: "joelho leve",
      },
    });

    expect(update).toMatchObject({
      objective: "performance",
      days_per_week_strength: 4,
      days_per_week_cardio: 2,
      session_duration_min: 60,
      injuries: "Cirurgia anterior",
      custom_answers: { staff_pre_registration: { answers: { current_pain: "joelho leve" } } },
      notes: "Priorizar técnica antes de carga.",
    });
    expect(update).not.toHaveProperty("current_pain");
    expect(update).not.toHaveProperty("current_volume_unit");
    expect(update).not.toHaveProperty("nutrition_context");
  });

  it("keeps the requested priority order and an editable notes area", () => {
    const details = source("src/components/admin/PreRegistrationDetails.tsx");
    const requestedOrder = [
      '"objective"',
      '"goals"',
      '"training_days"',
      '"available_days"',
      '"days_strength"',
      '"session_duration"',
      '"days_cardio"',
      '"training_location"',
      '"current_pain"',
    ];
    requestedOrder.reduce((previous, field) => {
      const current = details.indexOf(field);
      expect(current).toBeGreaterThan(previous);
      return current;
    }, -1);
    expect(details).toContain("Editar anamnese");
    expect(details).toContain("Anotações internas sobre o aluno");
    expect(details).toContain("Salvar alterações");
  });

  it("gives both pre-registration popovers a bounded native scroll region", () => {
    const workoutBuilder = source("src/pages/admin/WorkoutBuilder.tsx");
    const whatsapp = source("src/pages/admin/WhatsAppChat.tsx");
    for (const page of [workoutBuilder, whatsapp]) {
      expect(page).toContain("h-[min(78dvh,46rem)]");
      expect(page).toContain('aria-label="Anamnese completa do aluno"');
      expect(page).toContain("updateStudentPreRegistration");
    }
    expect(workoutBuilder).toContain("overflow-y-auto overscroll-contain");
    expect(whatsapp).toContain('<ScrollArea className="min-h-0 flex-1">');
  });
});
