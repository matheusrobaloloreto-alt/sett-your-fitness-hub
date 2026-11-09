import { describe, expect, it, vi } from "vitest";
import {
  resolveStudioAnamnesis,
  studioAnamnesisGenerationBlockReason,
  type LoadStudentPreRegistrationInput,
} from "@/lib/preRegistrationData";
import type { PreRegistrationData } from "@/lib/preRegistration";

function createDb(canonical: Record<string, unknown> | null, history: unknown[] = [], historyError: Error | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: canonical, error: null });
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle,
  };
  const intercycles = {
    select: vi.fn(() => intercycles),
    eq: vi.fn(() => intercycles),
    order: vi.fn(() => intercycles),
    range: vi.fn(async () => ({ data: history, error: historyError })),
  };
  const from = vi.fn((table: string) => {
    if (table === "intercycle_anamneses") return intercycles;
    if (table !== "student_anamneses") throw new Error(`unexpected table ${table}`);
    return query;
  });
  return { db: { from }, query, intercycles, maybeSingle };
}

const leadPreRegistration: PreRegistrationData = {
  source: "lead",
  submittedAt: "2026-08-25T12:00:00.000Z",
  budgetRange: "300_400",
  preferredContactPeriod: "afternoon",
  answers: {
    objective: "performance",
    activity_level: "moderado",
    requested_services: ["strength", "running", "nutrition"],
    training_days: "segunda musculação; terça corrida",
    days_strength: 3,
    days_cardio: 2,
    session_duration: "de 45 a 60 minutos",
    endurance_session_duration: "de 30 a 45 minutos",
    current_pain: "joelho esquerdo EVA 3",
    current_volume_weekly: 28,
    current_volume_unit: "km_week",
    sport_goal: "10 km sub 50",
    stress_score: 8,
    sleep_quality: 4,
    food_restrictions: "sem lactose",
    nutrition_context: "treina cedo e sente fome à noite",
    budget_food: "alto",
  },
};

describe("resolveStudioAnamnesis", () => {
  it("fails closed without a company tenant before reading canonical anamnesis", async () => {
    const db = { from: vi.fn() };

    await expect(resolveStudioAnamnesis({
      db,
      studentId: "student-1",
      companyId: null,
      phone: "+5548999999999",
    })).rejects.toThrow("Empresa não definida");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("keeps canonical student_anamneses precedence and does not call fallback", async () => {
    const canonical = {
      id: "anamnesis-1",
      student_id: "student-1",
      company_id: "company-1",
      objective: "hipertrofia",
      stress_score: 3,
      sleep_quality: 8,
    };
    const { db, query } = createDb(canonical);
    const loadPreRegistration = vi.fn();

    await expect(resolveStudioAnamnesis({
      db,
      studentId: "student-1",
      companyId: "company-1",
      phone: "+5548999999999",
      loadPreRegistration,
    })).resolves.toBe(canonical);

    expect(query.eq).toHaveBeenCalledWith("student_id", "student-1");
    expect(query.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(loadPreRegistration).not.toHaveBeenCalled();
  });

  it("accumulates scoped partial responses without changing canonical data or losing false and zero", async () => {
    const scope = { studentId: "student-1", companyId: "company-1" };
    const row = { student_id: scope.studentId, company_id: scope.companyId, sensitive_consent: true };
    const canonical = { ...row, id: "base", objective: "saude", equipment: "Academia", sleep_quality: 0, has_kitchen: false };
    const history = [
      { ...row, id: "a", submitted_at: "2026-09-01T12:00:00Z", goals_continue: false, new_goals: "Força", availability_changed: true, session_duration_minutes: 35, pain_present: true, pain_location: "joelho", pain_eva: 0 },
      { ...row, id: "b", submitted_at: "2026-10-01T12:00:00Z", goals_continue: true, availability_changed: true, available_equipment: "Halteres", pain_present: null },
      { ...row, id: "c", submitted_at: "2026-11-01T12:00:00Z", company_id: "other", goals_continue: false, new_goals: "performance" },
      { ...row, id: "d", submitted_at: "2026-11-01T12:00:00Z", student_id: "other", goals_continue: false, new_goals: "performance" },
    ];
    const { db, intercycles } = createDb(canonical, history);
    await expect(resolveStudioAnamnesis({ db, ...scope })).resolves.toMatchObject({
      id: "base", objective: "forca", equipment: "Halteres", sleep_quality: 0, has_kitchen: false,
      session_duration_min: 35, intercycle_update: { goals_continue: true, pain_eva: 0 },
    });
    expect(intercycles.eq).toHaveBeenCalledWith("company_id", scope.companyId);
    expect(intercycles.eq).toHaveBeenCalledWith("student_id", scope.studentId);
    expect(canonical).toMatchObject({ objective: "saude", equipment: "Academia" });
  });

  it("uses a newer staff correction per field while retaining newer partial pain details and unmapped goals", async () => {
    const scope = { studentId: "student-1", companyId: "company-1" };
    const row = { student_id: scope.studentId, company_id: scope.companyId, sensitive_consent: true };
    const canonical = {
      id: "base", objective: "saude", equipment: "Academia", injuries: "Cirurgia anterior",
      custom_answers: { staff_pre_registration: { field_updated_at: { objective: "2026-09-15T12:00:00Z" } } },
    };
    const { db } = createDb(canonical, [
      { ...row, id: "a", submitted_at: "2026-09-01T12:00:00Z", goals_continue: false, new_goals: "Força", availability_changed: true, available_equipment: "Halteres", pain_present: true, pain_location: "joelho", pain_eva: 2, pain_movement: "agachamento" },
      { ...row, id: "b", submitted_at: "2026-10-01T12:00:00Z", goals_continue: false, new_goals: "Brincar com meus filhos", pain_present: true, pain_eva: 0 },
    ]);
    await expect(resolveStudioAnamnesis({ db, ...scope })).resolves.toMatchObject({
      objective: "saude", equipment: "Halteres", injuries: "Cirurgia anterior",
      current_pain: "joelho EVA 0 agachamento",
      intercycle_update: { new_goals: "Brincar com meus filhos", pain_eva: 0 },
    });
  });

  it("fails closed if history fails even with a readable canonical base", async () => {
    const { db } = createDb({ id: "base" }, [], new Error("history unavailable"));
    await expect(resolveStudioAnamnesis({ db, studentId: "student-1", companyId: "company-1" }))
      .rejects.toThrow("history unavailable");
  });

  it("normalizes lead pre-registration into the Studio contract when canonical is null", async () => {
    const { db } = createDb(null);
    const loadPreRegistration = vi.fn(async (_input: LoadStudentPreRegistrationInput) => leadPreRegistration);

    const anamnese = await resolveStudioAnamnesis({
      db,
      studentId: "student-1",
      companyId: "company-1",
      phone: "+5548999999999",
      loadPreRegistration,
    });

    expect(loadPreRegistration).toHaveBeenCalledWith({
      studentId: "student-1",
      companyId: "company-1",
      phone: "+5548999999999",
    });
    expect(anamnese).toMatchObject({
      source: "pre_registration_lead",
      student_id: "student-1",
      company_id: "company-1",
      objective: "performance",
      activity_level: "moderado",
      days_per_week_strength: 3,
      days_per_week_cardio: 2,
      session_duration_min: 60,
      endurance_session_duration_min: 45,
      current_volume_weekly: 28,
      current_volume_unit: "km_week",
      cardio_goal: "10 km sub 50",
      stress_score: 8,
      sleep_quality: 4,
      food_restrictions: "sem lactose",
      nutrition_context: "treina cedo e sente fome à noite",
      budget_food: "alto",
      wants_strength: true,
      wants_running: true,
      wants_nutrition: true,
    });
    expect(anamnese).toMatchObject({ injuries: null, current_pain: "joelho esquerdo EVA 3" });
    expect(anamnese?.raw_answers).toBe(leadPreRegistration.answers);
  });

  it("layers an interciclo onto the converted lead without modifying the lead", async () => {
    const scope = { studentId: "student-1", companyId: "company-1" };
    const { db } = createDb(null, [{
      id: "a", submitted_at: "2026-10-01T12:00:00Z", sensitive_consent: true,
      student_id: scope.studentId, company_id: scope.companyId,
      availability_changed: true, session_duration_minutes: 30,
    }]);
    await expect(resolveStudioAnamnesis({ db, ...scope, loadPreRegistration: async () => leadPreRegistration }))
      .resolves.toMatchObject({ id: null, source: "pre_registration_lead", session_duration_min: 30, stress_score: 8 });
    expect(leadPreRegistration.answers.session_duration).toBe("de 45 a 60 minutos");
  });

  it("returns null when canonical and fallback have no anamnesis data", async () => {
    const { db } = createDb(null);
    const loadPreRegistration = vi.fn(async () => null);

    await expect(resolveStudioAnamnesis({
      db,
      studentId: "student-1",
      companyId: "company-1",
      phone: null,
      loadPreRegistration,
    })).resolves.toBeNull();
  });

  it("propagates fallback failures instead of silently rendering no anamnesis", async () => {
    const { db } = createDb(null);
    const loadPreRegistration = vi.fn(async () => {
      throw new Error("lead fallback unavailable");
    });

    await expect(resolveStudioAnamnesis({
      db,
      studentId: "student-1",
      companyId: "company-1",
      phone: "+5548999999999",
      loadPreRegistration,
    })).rejects.toThrow("lead fallback unavailable");
  });

  it("uses a strict live fallback that propagates Supabase errors and skips a duplicate canonical read", async () => {
    vi.resetModules();
    const tables: string[] = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: { message: "lead query failed" },
      })),
    };
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        from: vi.fn((table: string) => {
          tables.push(table);
          return query;
        }),
      },
    }));
    const { loadStudioPreRegistrationFallback } = await import("@/lib/preRegistrationData");

    await expect(loadStudioPreRegistrationFallback({
      studentId: "student-1",
      companyId: "company-1",
      phone: null,
    })).rejects.toThrow("lead query failed");
    expect(tables).toEqual(["leads"]);
    vi.doUnmock("@/integrations/supabase/client");
  });
});

describe("studioAnamnesisGenerationBlockReason", () => {
  it("blocks generation while anamnesis is still loading", () => {
    expect(studioAnamnesisGenerationBlockReason({ loading: true, loadError: "" }))
      .toContain("carregamento");
  });

  it("blocks generation after an anamnesis load failure", () => {
    expect(studioAnamnesisGenerationBlockReason({ loading: false, loadError: "falhou" }))
      .toContain("carregar");
  });

  it("does not block a genuinely unanswered anamnesis", () => {
    expect(studioAnamnesisGenerationBlockReason({ loading: false, loadError: "" }))
      .toBeNull();
  });
});
