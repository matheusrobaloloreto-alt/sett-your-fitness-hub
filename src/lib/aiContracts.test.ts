import { describe, expect, it } from "vitest";
import {
  BN_AI_CONFIG_FALLBACK,
  OHS_COMPENSATION_KEYS,
  normalizeAssessmentContract,
  resolveCompanyAiContractConfig,
  validateLibraryUsage,
  validatePrescriptionContract,
} from "./aiContracts";

describe("AI contracts", () => {
  it("normalizes the functional assessment to the 7 required OHS compensations", () => {
    const normalized = normalizeAssessmentContract({
      ohs_compensations: [
        {
          key: "dynamic_valgus",
          compensacao: "Valgo dinâmico de joelho",
          presente: true,
          severidade: "moderada",
          frame_referencia: "frame_2",
          vista_referencia: "OVERHEAD SQUAT — VISTA FRONTAL",
          evidencia: "joelho direito colapsa medialmente",
          implicacao_treino: "reduzir carga axial e incluir ativação de glúteo médio",
        },
      ],
    });

    expect(normalized.ohs_compensations).toHaveLength(7);
    expect(normalized.ohs_compensations.map((item) => item.key)).toEqual(OHS_COMPENSATION_KEYS);
    expect(normalized.prescription_context.ohs_compensations).toHaveLength(7);
    expect(normalized.ohs_compensations.find((item) => item.key === "dynamic_valgus")).toMatchObject({
      presente: true,
      severidade: "moderada",
      frame_referencia: "frame_2",
    });
    expect(normalized.ohs_compensations.find((item) => item.key === "butt_wink")).toMatchObject({
      presente: false,
      severidade: "ausente",
    });
  });

  it("rejects prescription exercises without an exercise_id before saving", () => {
    const result = validatePrescriptionContract({
      plan: {
        duration_weeks: 6,
        workouts: [
          {
            exercises: [
              { exercise_name: "Agachamento livre", sets: 4 },
            ],
          },
        ],
      },
      catalog: [{ id: "exercise-1", name: "Agachamento livre" }],
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(expect.objectContaining({
      severity: "blocker",
      code: "library_contract_failed",
      source: "biblioteca",
    }));
    expect(result.library.missing).toEqual(["workouts[0].exercises[0]"]);
  });

  it("rejects exercise ids that are not present in the app library", () => {
    const library = validateLibraryUsage({
      workouts: [
        { exercises: [{ exercise_id: "unknown-exercise", exercise_name: "Inventado" }] },
      ],
    }, new Set(["exercise-1"]));

    expect(library.valid).toBe(false);
    expect(library.invalid).toEqual(["workouts[0].exercises[0]:unknown-exercise"]);
  });

  it("accepts only explicitly trusted legacy ids and reports them separately", () => {
    const library = validateLibraryUsage({
      workouts: [
        { exercises: [{ exercise_id: "legacy-exercise", exercise_name: "Exercício legado" }] },
      ],
    }, new Set(["exercise-1"]), new Set(["legacy-exercise"]));

    expect(library.valid).toBe(true);
    expect(library.invalid).toEqual([]);
    expect(library.legacy).toEqual(["workouts[0].exercises[0]:legacy-exercise"]);
  });

  it("keeps trusted legacy references as warnings in the full contract", () => {
    const result = validatePrescriptionContract({
      plan: {
        duration_weeks: 6,
        workouts: [{ exercises: [{ exercise_id: "legacy-exercise", exercise_name: "Exercício legado" }] }],
      },
      catalog: [{ id: "exercise-1", name: "Exercício atual" }],
      trustedLegacyExerciseIds: new Set(["legacy-exercise"]),
    });

    expect(result.status).toBe("warnings");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "legacy_library_reference_preserved",
      source: "biblioteca",
    }));
  });

  it("does not trust legacy ids declared inside the client plan", () => {
    const result = validatePrescriptionContract({
      plan: {
        duration_weeks: 6,
        legacy_exercise_ids: ["spoofed-id"],
        workouts: [{ exercises: [{ exercise_id: "spoofed-id", exercise_name: "Exercício não cadastrado" }] }],
      },
      catalog: [],
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "library_contract_failed" }));
  });

  it("uses exercise metadata to warn about pain-sensitive selections", () => {
    const result = validatePrescriptionContract({
      plan: {
        duration_weeks: 6,
        workouts: [
          {
            exercises: [
              { exercise_id: "leg-ext", exercise_name: "Cadeira extensora", sets: 5 },
            ],
          },
        ],
      },
      catalog: [
        {
          id: "leg-ext",
          name: "Cadeira extensora",
          contraindications: ["dor anterior no joelho sem controle de carga"],
          regressions: ["isometria de quadríceps em amplitude livre de dor"],
          equivalent_substitutes: ["leg-press-curto"],
          pain_limitation_tags: ["joelho"],
        },
      ],
      anamneseContext: { dor: "dor no joelho direito EVA 5" },
    });

    expect(result.status).toBe("warnings");
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "exercise_metadata_pain_match",
      source: "biblioteca",
    }));
    expect(result.warnings[0].recommendation).toContain("Regressao sugerida");
  });

  it("usa o padrão do app (Setty) quando company_ai_config está ausente", () => {
    expect(resolveCompanyAiContractConfig(null)).toEqual(BN_AI_CONFIG_FALLBACK);
    expect(resolveCompanyAiContractConfig(null).assistant_name).toBe("Setty");
    // Config parcial sobrepõe só o que foi informado; o resto vem do padrão.
    expect(resolveCompanyAiContractConfig({ assistant_name: "Coach X" })).toMatchObject({
      assistant_name: "Coach X",
      consultancy_name: null,
      onboarding_completed: false,
    });
  });
});
