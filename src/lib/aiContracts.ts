export const OHS_COMPENSATION_KEYS = [
  "dorsiflexion_limitation",
  "dynamic_valgus",
  "trunk_forward_lean",
  "butt_wink",
  "pelvic_drop_trendelenburg",
  "shoulder_protraction_kyphosis",
  "overhead_arm_asymmetry",
] as const;

export type OhsCompensationKey = (typeof OHS_COMPENSATION_KEYS)[number];

export const OHS_COMPENSATION_LABELS: Record<OhsCompensationKey, string> = {
  dorsiflexion_limitation: "Limitação de dorsiflexão de tornozelo",
  dynamic_valgus: "Valgo dinâmico de joelho",
  trunk_forward_lean: "Inclinação excessiva de tronco",
  butt_wink: "Retroversão pélvica / butt wink",
  pelvic_drop_trendelenburg: "Drop de pelve / Trendelenburg funcional",
  shoulder_protraction_kyphosis: "Protrusão de ombro / cifose torácica",
  overhead_arm_asymmetry: "Assimetria de braços no overhead",
};

export type WarningSeverity = "info" | "warning" | "blocker";

export type ValidationSource =
  | "biblioteca"
  | "volume"
  | "anamnese"
  | "avaliacao_funcional"
  | "objetivo"
  | "nivel"
  | "periodizacao"
  | "metodologia_bn";

export interface ValidationWarning {
  severity: WarningSeverity;
  code: string;
  message: string;
  recommendation: string;
  source: ValidationSource;
}

export interface ExerciseContractEntry {
  id: string;
  name: string;
  muscle_group?: string | null;
  contraindications?: string[];
  regressions?: string[];
  progressions?: string[];
  equivalent_substitutes?: string[];
  pain_limitation_tags?: string[];
}

export interface CompanyAiContractConfig {
  assistant_name: string;
  consultancy_name: string | null;
  methodology: string | null;
  plans_payment: string | null;
  tone: string | null;
  onboarding_completed: boolean;
}

// Padrão do app (SettApp) = assistente "Setty". Cada empresa troca na Central de IA.
// (Mantém o nome do símbolo por compatibilidade de import/teste; valores agora são o default Setty.)
export const BN_AI_CONFIG_FALLBACK: CompanyAiContractConfig = {
  assistant_name: "Setty",
  consultancy_name: null,
  methodology: null,
  plans_payment: null,
  tone: null,
  onboarding_completed: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeAssessmentContract(input: unknown) {
  const assessment = isRecord(input) ? input : {};
  const incoming = Array.isArray(assessment.ohs_compensations) ? assessment.ohs_compensations : [];
  const byKey = new Map<string, Record<string, unknown>>();

  for (const item of incoming) {
    if (!isRecord(item) || typeof item.key !== "string") continue;
    byKey.set(item.key, item);
  }

  const ohs_compensations = OHS_COMPENSATION_KEYS.map((key) => {
    const existing = byKey.get(key);
    return {
      key,
      compensacao: typeof existing?.compensacao === "string" ? existing.compensacao : OHS_COMPENSATION_LABELS[key],
      presente: Boolean(existing?.presente),
      severidade: typeof existing?.severidade === "string" ? existing.severidade : "ausente",
      frame_referencia: typeof existing?.frame_referencia === "string" ? existing.frame_referencia : null,
      vista_referencia: typeof existing?.vista_referencia === "string" ? existing.vista_referencia : null,
      evidencia: typeof existing?.evidencia === "string" ? existing.evidencia : "Não observado",
      implicacao_treino: typeof existing?.implicacao_treino === "string" ? existing.implicacao_treino : "",
    };
  });

  return {
    ...assessment,
    schema: "bn_functional_assessment_v1",
    ohs_compensations,
    prescription_context: {
      ...(isRecord(assessment.prescription_context) ? assessment.prescription_context : {}),
      contract: "bn_functional_assessment_v1",
      ohs_compensations,
    },
  };
}

export function resolveCompanyAiContractConfig(config?: Partial<CompanyAiContractConfig> | null): CompanyAiContractConfig {
  return {
    ...BN_AI_CONFIG_FALLBACK,
    ...(config ?? {}),
  };
}

export function validateLibraryUsage(
  plan: unknown,
  validExerciseIds: Set<string>,
  trustedLegacyExerciseIds: ReadonlySet<string> = new Set(),
) {
  const missing: string[] = [];
  const invalid: string[] = [];
  const legacy: string[] = [];
  if (!isRecord(plan) || !Array.isArray(plan.workouts)) return { valid: true, missing, invalid, legacy };

  plan.workouts.forEach((workout, workoutIndex) => {
    if (!isRecord(workout) || !Array.isArray(workout.exercises)) return;
    workout.exercises.forEach((exercise, exerciseIndex) => {
      if (!isRecord(exercise)) return;
      const label = `workouts[${workoutIndex}].exercises[${exerciseIndex}]`;
      const exerciseId = exercise.exercise_id;
      if (typeof exerciseId !== "string" || !exerciseId.trim()) {
        missing.push(label);
        return;
      }
      if (validExerciseIds.has(exerciseId)) return;
      if (trustedLegacyExerciseIds.has(exerciseId)) {
        legacy.push(`${label}:${exerciseId}`);
        return;
      }
      invalid.push(`${label}:${exerciseId}`);
    });
  });

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    legacy,
  };
}

function collectPlanExercises(plan: unknown) {
  if (!isRecord(plan) || !Array.isArray(plan.workouts)) return [];
  return plan.workouts.flatMap((workout) => {
    if (!isRecord(workout) || !Array.isArray(workout.exercises)) return [];
    return workout.exercises.filter(isRecord);
  });
}

function hasPainMetadataRisk(exercise: ExerciseContractEntry | undefined, contextText: string) {
  if (!exercise) return false;
  const metadataText = normalizeText([
    exercise.contraindications,
    exercise.pain_limitation_tags,
  ]);
  if (!metadataText) return false;
  return ["joelho", "lombar", "ombro", "tornozelo", "quadril"].some(
    (term) => contextText.includes(term) && metadataText.includes(term),
  );
}

export function validatePrescriptionContract(args: {
  plan: unknown;
  catalog: ExerciseContractEntry[];
  trustedLegacyExerciseIds?: ReadonlySet<string>;
  objective?: unknown;
  fitnessLevel?: unknown;
  anamneseContext?: unknown;
  assessmentContext?: unknown;
}) {
  const warnings: ValidationWarning[] = [];
  const blockers: ValidationWarning[] = [];
  const add = (warning: ValidationWarning) => {
    if (warning.severity === "blocker") blockers.push(warning);
    else warnings.push(warning);
  };

  const library = validateLibraryUsage(
    args.plan,
    new Set(args.catalog.map((exercise) => exercise.id)),
    args.trustedLegacyExerciseIds,
  );
  if (!library.valid) {
    add({
      severity: "blocker",
      code: "library_contract_failed",
      message: "Ha exercicios sem exercise_id ou fora da biblioteca do app.",
      recommendation: "Salvar somente depois de trocar por exercicios cadastrados ou registrar lacuna para cadastro.",
      source: "biblioteca",
    });
  }
  if (library.legacy.length > 0) {
    add({
      severity: "warning",
      code: "legacy_library_reference_preserved",
      message: "O plano mantém exercícios legados que já estavam salvos no ciclo.",
      recommendation: "Substitua-os pela biblioteca atual quando houver uma equivalência confirmada.",
      source: "biblioteca",
    });
  }

  const contextText = normalizeText({
    objective: args.objective,
    fitnessLevel: args.fitnessLevel,
    anamnese: args.anamneseContext,
    assessment: args.assessmentContext,
  });
  const catalogById = new Map(args.catalog.map((exercise) => [exercise.id, exercise]));

  for (const exercise of collectPlanExercises(args.plan)) {
    const exerciseId = typeof exercise.exercise_id === "string" ? exercise.exercise_id : "";
    const catalogExercise = catalogById.get(exerciseId);
    if (!hasPainMetadataRisk(catalogExercise, contextText)) continue;

    add({
      severity: "warning",
      code: "exercise_metadata_pain_match",
      message: `${catalogExercise?.name ?? "Exercicio"} tem metadado sensivel para a dor/limitacao informada.`,
      recommendation: [
        catalogExercise?.regressions?.[0] ? `Regressao sugerida: ${catalogExercise.regressions[0]}.` : null,
        catalogExercise?.equivalent_substitutes?.[0] ? `Substituto equivalente: ${catalogExercise.equivalent_substitutes[0]}.` : null,
        "Revisar amplitude, carga e tolerancia antes de salvar.",
      ].filter(Boolean).join(" "),
      source: "biblioteca",
    });
  }

  return {
    status: blockers.length ? "blocked" : warnings.some((warning) => warning.severity === "warning") ? "warnings" : "ok",
    blockers,
    warnings,
    library,
  };
}
