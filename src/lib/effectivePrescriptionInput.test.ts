import { describe, expect, it } from "vitest";
import { intercycleProjection, mergeEffectiveAnamnesis } from "../../supabase/functions/_shared/effective-anamnesis";
import { applyEffectivePrescriptionInput } from "../../supabase/functions/_shared/prescription/effective-input";
import { buildCardioProgram } from "../../supabase/functions/_shared/prescription/cardio/cardioEngine";
import { buildPrescriptionInputFromEdgePayload } from "../../supabase/functions/_shared/prescription/adapters/inputAdapter";

const scope = { companyId: "company", studentId: "student" };
const base = {
  id: "canonical", objective: "saude", days_per_week_strength: 4, days_per_week_cardio: 3,
  session_duration_min: 60, endurance_session_duration_min: 55, equipment: "Academia",
  has_kitchen: false, stress_score: 0, current_volume_weekly: 0, injuries: "Cirurgia anterior",
  answers: { goals: "Objetivo antigo", available_equipment: "Equipamento antigo" },
};
function row(id: string, day: string, answers: Record<string, unknown>) {
  return { id, submitted_at: `2026-10-${day}T10:00:00Z`, company_id: scope.companyId, student_id: scope.studentId,
    sensitive_consent: true, ...answers };
}
function effective(rows: Record<string, unknown>[], canonical: Record<string, unknown> = base) {
  const intercycle = intercycleProjection(scope, rows, canonical);
  return { intercycle, anamnesis: mergeEffectiveAnamnesis(canonical, intercycle), staffCorrections: {} };
}
const stale = {
  draft_only: true,
  anamnese_id: "stale-id", objective: "emagrecimento", days_per_week: 5, equipment: "Esteira",
  session_duration: 90, has_microwave: true, stress_score: 9, current_volume: 50,
  prescription_integration: { athlete_profile: { objective: "stale" }, risk_screening: { pain_regions: ["stale"] } },
};

describe("effective inputs at the prescription API boundary", () => {
  it("projects the same fresh answers into engine, cardio and nutrition inputs", () => {
    const resolved = effective([
      row("a", "01", { goals_continue: false, new_goals: "Força", availability_changed: true, available_days: ["Seg", "Qua"], session_duration_minutes: 35 }),
      row("b", "02", { goals_continue: true, availability_changed: true, available_equipment: "Halteres", pain_present: false }),
    ]);
    const strength = applyEffectivePrescriptionInput(stale, resolved, "strength");
    const { input } = buildPrescriptionInputFromEdgePayload({ payload: strength, catalog: [] });
    expect(input).toMatchObject({ objective: "forca", daysPerWeek: 2, equipment: "Halteres", injuries: "Cirurgia anterior" });
    expect(strength.anamnese_context.answers).not.toHaveProperty("goals");
    expect(strength.anamnese_id).toBe("canonical");
    expect(strength.prescription_integration.athlete_profile).toMatchObject({ objective: "forca", session_duration_min: 35, endurance_session_duration_min: 35 });
    expect(strength.prescription_integration.risk_screening.pain_regions).not.toContain("stale");
    expect(applyEffectivePrescriptionInput(stale, resolved, "cardio")).toMatchObject({
      days_per_week: 3, session_duration: 35, current_volume: 0, diet_type: "forca",
    });
    expect(applyEffectivePrescriptionInput(stale, resolved, "nutrition")).toMatchObject({
      objective: "forca", has_microwave: false, stress_score: 0,
    });
  });

  it("reads each first-block cardio volume from its own sport in the saved intake", () => {
    const resolved = effective([], {
      ...base, current_volume_weekly: 25, current_volume_unit: "km_week",
      answers: { swim_volume: "3000m/sem" },
      notes: "CICLISMO: speed, volume 4,5 h/sem, FTP/potência 210 W",
    });
    const payload = { ...stale, block_number: 1, current_volume: 25, current_volume_unit: "km_week" };
    for (const [sport, current_volume, current_volume_unit] of [
      ["corrida", 25, "km_week"],
      ["natacao", 3, "km_week"],
      ["ciclismo", 4.5, "hours_week"],
    ] as const) {
      expect(applyEffectivePrescriptionInput({ ...payload, sport }, resolved, "cardio"))
        .toMatchObject({ current_volume, current_volume_unit });
    }
    const swimmingInput = applyEffectivePrescriptionInput({ ...payload, sport: "natacao" }, resolved, "cardio");
    const swimming = buildCardioProgram(swimmingInput);
    const swimmingWithRunningVolume = buildCardioProgram({ ...swimmingInput, current_volume: 25 });
    expect(swimming.weeks[0].volume_hours).toBeLessThan(swimmingWithRunningVolume.weeks[0].volume_hours);
  });

  it("clears ambiguous first-block and stale later-block volumes while honoring an explicit legacy input", () => {
    const resolved = effective([], { ...base, current_volume_weekly: 25, notes: "NATAÇÃO: volume treino quando possível" });
    const payload = { ...stale, sport: "natacao", current_volume_unit: "km_week" };
    expect(applyEffectivePrescriptionInput({ ...payload, block_number: 1 }, resolved, "cardio"))
      .toMatchObject({ current_volume: null, current_volume_unit: null });
    const timed = effective([], { ...base, notes: "NATAÇÃO: volume 2x40min" });
    expect(applyEffectivePrescriptionInput({ ...payload, block_number: 1 }, timed, "cardio"))
      .toMatchObject({ current_volume: 80 / 60, current_volume_unit: "hours_week" });
    const known = effective([], { ...base, notes: "NATAÇÃO: volume 3 km/sem, melhor tempo/pace 2:00" });
    expect(applyEffectivePrescriptionInput({ ...payload, block_number: 2 }, known, "cardio"))
      .toMatchObject({ current_volume: null, current_volume_unit: null });
    expect(applyEffectivePrescriptionInput({ ...payload, draft_only: false, current_volume: 2 }, known, "cardio"))
      .toMatchObject({ current_volume: 2, current_volume_unit: "km_week" });
  });

  it("keeps an unambiguous legacy volume for its own sport and refuses to borrow it for another sport", () => {
    const canonical = { ...base, sport: "ciclismo", current_volume_weekly: 6, current_volume_unit: "hours_week" };
    const payload = { ...stale, block_number: 1 };
    expect(applyEffectivePrescriptionInput({ ...payload, sport: "ciclismo" }, effective([], canonical), "cardio"))
      .toMatchObject({ current_volume: 6, current_volume_unit: "hours_week" });
    expect(applyEffectivePrescriptionInput({ ...payload, sport: "natacao" }, effective([], canonical), "cardio"))
      .toMatchObject({ current_volume: null, current_volume_unit: null });
    expect(applyEffectivePrescriptionInput({ ...payload, sport: "corrida" }, effective([], canonical), "cardio"))
      .toMatchObject({ current_volume: null, current_volume_unit: null });
    expect(applyEffectivePrescriptionInput({ ...payload, sport: "ciclismo" }, effective([], { ...canonical, wants_running: true }), "cardio"))
      .toMatchObject({ current_volume: null, current_volume_unit: null });
  });

  it("calibrates a new swimming block using the previous swimming plan's hours", () => {
    const input = { sport: "natacao", duration_weeks: 6, days_per_week: 3, block_number: 2, session_duration: 60 };
    const previous = buildCardioProgram({ ...input, current_volume: 6, current_volume_unit: "hours_week" });
    const hours = Math.max(...previous.weeks.filter(week => week.type !== "deload").slice(-2).map(week => week.volume_hours));
    const inherited = buildCardioProgram({ ...input, previous_plan_context: previous });
    const reported = buildCardioProgram({ ...input, current_volume: hours, current_volume_unit: "hours_week" });
    expect(inherited.weeks[0].volume_hours).toBe(reported.weeks[0].volume_hours);
    expect(inherited.weeks[0].volume_hours).not.toBe(buildCardioProgram(input).weeks[0].volume_hours);
  });

  it("keeps the last classified objective and flags free text for review without blocking strength", () => {
    const resolved = effective([
      row("a", "01", { goals_continue: false, new_goals: "Força" }),
      row("b", "02", { goals_continue: false, new_goals: "Voltar a brincar com meus filhos" }),
    ]);
    expect(resolved.anamnesis).toMatchObject({
      objective: "forca", intercycle_update: { new_goals: "Voltar a brincar com meus filhos" },
    });
    expect(resolved.intercycle?.goalNeedsReview).toBe(true);
    expect(applyEffectivePrescriptionInput(stale, resolved, "strength").objective).toBe("forca");
  });

  it("blocks accumulated severe pain until an explicit new answer resolves it", () => {
    const severe = row("a", "01", { pain_present: true, pain_location: "joelho", pain_eva: 8, pain_movement: "escada" });
    const omitted = row("b", "02", { availability_changed: false });
    const unresolved = effective([severe, omitted]);
    expect(() => applyEffectivePrescriptionInput(stale, unresolved, "strength")).toThrow(/EVA 5/);
    expect(applyEffectivePrescriptionInput(stale, unresolved, "strength", { validationOnly: true }).anamnese_context)
      .toMatchObject({ current_pain: "joelho EVA 8 escada" });
    expect(applyEffectivePrescriptionInput(stale, unresolved, "cardio").eva).toMatchObject({ joelho: 8 });
    expect(applyEffectivePrescriptionInput(stale, unresolved, "nutrition").has_microwave).toBe(false);
    const resolved = effective([severe, omitted, row("c", "03", { pain_present: false })]);
    expect(resolved.anamnesis).toMatchObject({ current_pain: false, injuries: "Cirurgia anterior" });
    expect(resolved.intercycle?.update).not.toHaveProperty("pain_location");
    expect(resolved.intercycle?.update).not.toHaveProperty("pain_eva");
  });

  it("discards a detached Studio snapshot while preserving valid request parameters", () => {
    const resolved = { anamnesis: null, intercycle: null, staffCorrections: {} };
    expect(applyEffectivePrescriptionInput({ ...stale, draft_only: true }, resolved, "strength"))
      .toMatchObject({ anamnese_context: null, anamnese_id: null, objective: "emagrecimento", equipment: "Esteira" });
  });

  it("preserves explicit legacy constraints, and keeps draft values where the persisted record has gaps", () => {
    const legacy = { objective: "hipertrofia", equipment: "Halteres", days_per_week: 2, goal: "10 km",
      current_volume: 0, current_volume_unit: "hours_week", has_microwave: false, stress_score: 0,
      restrictions: "Sem impacto", injuries: "Lesão de ombro", food_restrictions: "Sem lactose" };
    const canonical = { ...base, food_restrictions: "Sem amendoim", has_kitchen: true };
    const resolved = effective([], canonical);
    expect(applyEffectivePrescriptionInput(legacy, resolved, "strength")).toMatchObject({
      objective: "hipertrofia", equipment: "Halteres", days_per_week: 2,
      restrictions: expect.stringContaining("Sem impacto"), injuries: expect.stringContaining("Lesão de ombro"),
    });
    expect(applyEffectivePrescriptionInput(legacy, resolved, "strength").injuries).toContain("Cirurgia anterior");
    expect(applyEffectivePrescriptionInput(legacy, resolved, "nutrition")).toMatchObject({
      has_microwave: false, stress_score: 0, food_restrictions: expect.stringMatching(/(?=.*Sem lactose)(?=.*Sem amendoim)/),
    });
    const partial = { ...resolved, anamnesis: { id: "canonical", cardio_goal: null, days_per_week_cardio: null,
      equipment: null, current_volume_weekly: null, food_restrictions: null } };
    expect(applyEffectivePrescriptionInput({ ...legacy, draft_only: true }, partial, "cardio")).toMatchObject({
      goal: "10 km", days_per_week: 2, equipment: "Halteres", current_volume: 0, current_volume_unit: "hours_week",
    });
    expect(applyEffectivePrescriptionInput({ ...legacy, draft_only: true }, partial, "nutrition").food_restrictions)
      .toBe("Sem lactose");
  });

  it("keeps fresh structured EVA despite a staff note and accepts weekday aliases without duplication", () => {
    const canonical = { ...base, training_location: "Academia Central",
      custom_answers: { staff_pre_registration: { field_updated_at: { current_pain: "2026-10-03T10:00:00Z" } } } };
    const resolved = effective([
      row("a", "01", { availability_changed: true, training_location: " academia   central ",
        available_days: ["segunda-feira", "Seg", "Quarta", "SÁBADO"], pain_present: true, pain_eva: 8 }),
    ], canonical);
    expect(resolved.intercycle).toMatchObject({ equipmentNeedsReview: false, update: { pain_eva: 8 } });
    expect(resolved.anamnesis).toMatchObject({ available_days: ["Seg", "Qua", "Sáb"], days_per_week_strength: 3 });
    expect(() => applyEffectivePrescriptionInput(stale, resolved, "strength")).toThrow(/EVA 5/);
    expect(applyEffectivePrescriptionInput(stale, resolved, "cardio").eva).toMatchObject({ interciclo: 8 });
  });

  it("warns on a genuinely changed location and avoids assuming equipment from the prior location", () => {
    const resolved = effective([
      row("a", "01", { availability_changed: true, training_location: "Academia", available_equipment: "Máquinas" }),
      row("b", "02", { availability_changed: true, training_location: "Parque" }),
    ]);
    expect(resolved.intercycle?.equipmentNeedsReview).toBe(true);
    expect(applyEffectivePrescriptionInput(stale, resolved, "strength").equipment).toBe("peso_corporal");
    expect(applyEffectivePrescriptionInput({ equipment: "Halteres" }, resolved, "strength").equipment).toBe("Halteres");
  });

  it("carries canonical and manual current-pain text into safety without writing it as injury history", () => {
    const resolved = effective([], { ...base, current_pain: "Desconforto EVA 8" } as typeof base);
    const request = { restrictions: "Sem impacto", current_pain: "Joelho EVA 6", eva: { quadril: 3 } };
    const strength = applyEffectivePrescriptionInput(request, resolved, "strength");
    expect(strength.injuries).toBe("Cirurgia anterior");
    expect(strength.restrictions).toMatch(/(?=.*Sem impacto)(?=.*Cirurgia anterior)(?=.*EVA 8)(?=.*EVA 6)/);
    const cardio = applyEffectivePrescriptionInput(request, resolved, "cardio");
    expect(cardio.eva).toMatchObject({ interciclo: 8, joelho: 6, quadril: 3 });
    const withoutIntake = { anamnesis: null, intercycle: null, staffCorrections: {} };
    expect(applyEffectivePrescriptionInput(request, withoutIntake, "strength").restrictions).toContain("Joelho EVA 6");
    expect(applyEffectivePrescriptionInput(request, withoutIntake, "cardio").eva).toMatchObject({ joelho: 6 });
  });

  it("allows a classified staff correction to supersede an earlier free-text review", () => {
    const corrected = { ...base, objective: "performance",
      custom_answers: { staff_pre_registration: { field_updated_at: { objective: "2026-10-02T10:00:00Z" } } } };
    const resolved = effective([row("a", "01", { goals_continue: false, new_goals: "Passear de bicicleta" })], corrected);
    expect(applyEffectivePrescriptionInput(stale, resolved, "strength").objective).toBe("performance");
  });
});
