import { describe, expect, it } from "vitest";
import { preRegistrationToStudioAnamnesis, type PreRegistrationData } from "@/lib/preRegistration";

describe("pre-registration data in Prescription Studio", () => {
  it("adapts the new pre-registration answers to the studio anamnesis contract", () => {
    const preRegistration: PreRegistrationData = {
      source: "lead",
      submittedAt: "2026-08-25T12:00:00.000Z",
      budgetRange: "300_400",
      preferredContactPeriod: "afternoon",
      answers: {
        objective: "hipertrofia",
        activity_level: "moderado",
        requested_services: ["strength", "running"],
        training_days: "segunda - musculação; terça - corrida",
        available_days: 4,
        days_strength: 3,
        days_cardio: 2,
        session_duration: "de 45 a 60 minutos",
        endurance_session_duration: "de 30 a 45 minutos",
        training_location: "Academia de Rede",
        available_equipment: ["Halteres até 30kg ou +", "Máquinas"],
        injuries: "dor lombar leve",
        nutrition: "come pouco no café da manhã",
      },
    };

    const anamnese = preRegistrationToStudioAnamnesis(preRegistration, {
      studentId: "student-1",
      companyId: "company-1",
    });

    expect(anamnese.source).toBe("pre_registration_lead");
    expect(anamnese.objective).toBe("hipertrofia");
    expect(anamnese.training_modality).toContain("strength");
    expect(anamnese.days_per_week_strength).toBe(3);
    expect(anamnese.days_per_week_cardio).toBe(2);
    expect(anamnese.session_duration_min).toBe(60);
    expect(anamnese.endurance_session_duration_min).toBe(45);
    expect(anamnese.wants_strength).toBe(true);
    expect(anamnese.wants_running).toBe(true);
    expect(anamnese.injuries).toContain("dor lombar leve");
    expect(anamnese.notes).toContain("Fonte: pré-cadastro novo");
    expect(anamnese.raw_answers).toBe(preRegistration.answers);
  });
});
