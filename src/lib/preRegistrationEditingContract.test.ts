import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalAnamnesisUpdateFromPreRegistration } from "@/lib/preRegistrationData";

function source(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

describe("pre-registration editing contract", () => {
  it("maps editable staff fields back to canonical anamnesis columns", () => {
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
        current_pain: "joelho leve",
      },
    });

    expect(update).toMatchObject({
      objective: "performance",
      days_per_week_strength: 4,
      days_per_week_cardio: 2,
      session_duration_min: 60,
      injuries: "joelho leve",
      notes: "Priorizar técnica antes de carga.",
    });
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
