import { normalizeText } from "./presets.ts";
import { shouldHoldProgression } from "./progressionRules.ts";
import { classifyPainSeverity, deriveRestrictionRules } from "./restrictionRules.ts";
import { IMPORTANT_GROUPS, reviewVolume } from "./volumeRules.ts";
import type {
  ExerciseCatalogEntry,
  MethodologyPreset,
  PrescriptionInput,
  PrescriptionValidationResult,
  TrainingProgram,
  ValidationCorrection,
  ValidationWarning,
} from "./types.ts";
import { clinicalRiskText, prescriptionRiskText } from "./clinicalContext.ts";

function collectExerciseIds(program: TrainingProgram) {
  return program.workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.exercise_id));
}

function hasAdvancedMethod(program: TrainingProgram) {
  return /(drop[- ]?set|cluster[- ]?set|piramide|up[- ]?set|rest[- ]?pause)/.test(normalizeText(program));
}

function hasStructuredDeloadMethod(program: TrainingProgram) {
  if (program.weekly_periodization.some((week) => week.methods.length > 0)) return true;
  return program.workouts.some((workout) => workout.exercises.some((exercise) => {
    if (exercise.method) return true;
    if (exercise.set_types?.some((setType) => setType === "failure" || setType === "drop")) return true;
    return exercise.weekly_prescription?.some((week) =>
      Boolean(week.method) || week.set_types?.some((setType) => setType === "failure" || setType === "drop")
    );
  }));
}

function exerciseOnlyText(program: TrainingProgram) {
  return normalizeText(program.workouts.flatMap((workout) =>
    workout.exercises.map((exercise) => [
      exercise.exercise_name,
      exercise.library_exercise_name,
      exercise.muscle_group,
      exercise.phase,
      exercise.cues,
      exercise.biomechanical_note,
    ].join(" ")),
  ));
}

function hasHeavyLowerNearEndurance(program: TrainingProgram) {
  const lowerDays = new Set(
    program.workouts
      .filter((workout) => /quadr|posterior|glut|membros inferiores|mmii/.test(normalizeText([workout.split_focus, workout.exercises])))
      .map((workout) => workout.day_of_week),
  );
  if (lowerDays.size === 0) return false;
  return [...lowerDays].some((day) => day === 6 || day === 7);
}

export function validateTrainingProgram(args: {
  program: TrainingProgram;
  input: PrescriptionInput;
  preset: MethodologyPreset;
  catalog: ExerciseCatalogEntry[];
  corrections?: ValidationCorrection[];
}): PrescriptionValidationResult {
  const warnings: ValidationWarning[] = [];
  const blockers: ValidationWarning[] = [];
  const corrections = [...(args.corrections || [])];
  const add = (warning: ValidationWarning) => {
    if (warning.severity === "blocker") blockers.push(warning);
    else warnings.push(warning);
  };

  const validIds = new Set(args.catalog.map((exercise) => exercise.id));
  const ids = collectExerciseIds(args.program);
  const invalid = ids.filter((id) => !validIds.has(id));
  if (args.catalog.length === 0) {
    add({
      severity: "blocker",
      code: "empty_exercise_library",
      message: "A biblioteca de exercícios está vazia; o motor não pode inventar exercícios.",
      recommendation: "Cadastre exercícios na biblioteca antes de gerar a prescrição.",
      source: "biblioteca",
    });
  } else if (invalid.length > 0) {
    add({
      severity: "blocker",
      code: "exercise_outside_library",
      message: "O treino contém exercício fora da biblioteca.",
      recommendation: "Substituir por exercise_id real da biblioteca.",
      source: "biblioteca",
    });
  }

  const blockerGaps = args.program.library_policy.gaps.filter((gap) => gap.startsWith("BLOCKER:safe_alternative_unavailable"));
  for (const gap of blockerGaps) {
    add({
      severity: "blocker",
      code: "safe_alternative_unavailable",
      message: `Sem substituto seguro na biblioteca para padrão necessário (${gap.split(":").slice(2).join(" / ")}).`,
      recommendation: "Cadastrar exercício seguro equivalente ou ajustar o plano manualmente antes de publicar.",
      source: "biblioteca",
    });
  }

  const optionalGaps = args.program.library_policy.gaps.filter((gap) => gap.startsWith("WARNING:"));
  for (const gap of optionalGaps) {
    add({
      severity: "warning",
      code: "no_optional_accessory_available",
      message: `Acessório opcional não encontrado na biblioteca (${gap.split(":").slice(2).join(" / ")}).`,
      recommendation: "Publicar só se o professor aceitar a ausência do acessório, ou cadastrar equivalente.",
      source: "biblioteca",
    });
  }

  const restrictionRules = deriveRestrictionRules(args.input);
  const hasExplicitSeverePain = classifyPainSeverity(args.input) === "severa";

  if (hasExplicitSeverePain) {
    add({
      severity: "blocker",
      code: "high_pain_requires_professional_review",
      message: "Dor relatada com EVA acima de 5 ou descrita como forte/severa; a prescrição automática precisa de revisão do professor.",
      recommendation: "Remover padrão doloroso, manter apenas estímulos seguros e revisar com profissional antes de liberar ao aluno.",
      source: "anamnese",
    });
  }

  const severeAssessmentRules = restrictionRules.filter((rule) =>
    rule.severity === "severa"
    && !["knee_pain", "low_back_pain", "shoulder_pain"].includes(rule.key)
  );
  for (const rule of severeAssessmentRules) {
    add({
      severity: "warning",
      code: `${rule.key}_severe_assessment_requires_teacher_review`,
      message: `${rule.label}: achado severo da avaliação funcional; o motor adaptou os padrões afetados.`,
      recommendation: `${rule.recommendation} Revisar tecnicamente antes de liberar ao aluno.`,
      source: "avaliacao_funcional",
    });
  }

  const volume_review = reviewVolume(args.program, args.input, args.preset);
  for (const review of volume_review) {
    if (review.status === "alto") {
      add({
        severity: "warning",
        code: `high_volume_${review.muscle_group}`,
        message: `${review.muscle_group}: ${review.weekly_sets} séries/semana.`,
        recommendation: "Reduzir séries ou distribuir melhor se houver dor, fadiga ou iniciante.",
        source: "volume",
      });
    }
  }

  const presentGroups = new Set(volume_review.filter((item) => item.weekly_sets > 0).map((item) => item.muscle_group));
  const missingImportant = IMPORTANT_GROUPS.filter((group) => !presentGroups.has(group));
  if (args.catalog.length > 0 && missingImportant.includes("core")) {
    add({
      severity: "warning",
      code: "missing_core",
      message: "Core não apareceu claramente no plano.",
      recommendation: "Adicionar ativação/estabilidade de core em pelo menos 1-2 sessões.",
      source: "metodologia_bn",
    });
  }

  const clinicalContext = clinicalRiskText(args.input);
  const context = `${normalizeText(args.input.objective)} ${prescriptionRiskText(args.input)}`;
  const exerciseText = exerciseOnlyText(args.program);
  if (/(dor|lesao|lesões|joelho|lombar|ombro|retorno|reabilit)/.test(clinicalContext)) {
    add({
      severity: "warning",
      code: "pain_or_injury_requires_conservative_progression",
      message: "Há dor, lesão, retorno ou compensação relevante no contexto do aluno.",
      recommendation: "Manter progressão por tolerância, dor <= 3, sem falha e sem método avançado no padrão afetado.",
      source: "anamnese",
    });
  }
  if (/joelho|valgo/.test(context) && /salto|pliometr|agachamento profundo|atg/.test(exerciseText)) {
    add({
      severity: "warning",
      code: "knee_conflict",
      message: "Há possível conflito entre dor/valgo de joelho e exercício ou método agressivo.",
      recommendation: "Usar amplitude sem dor, priorizar glúteo e remover impacto/pliometria.",
      source: "anamnese",
    });
  }
  if (/lombar|butt|retrovers/.test(context) && /terra convencional pesado|terra pesado|good morning|carga axial alta|flexao espinhal carregada/.test(exerciseText)) {
    add({
      severity: "warning",
      code: "low_back_conflict",
      message: "Há possível conflito entre lombar/butt wink e carga axial/hinge agressivo.",
      recommendation: "Reduzir carga axial, usar máquinas/hip thrust/core e limitar amplitude.",
      source: "avaliacao_funcional",
    });
  }
  if (/ombro|overhead|cifose|protrus/.test(context) && /overhead pesado|desenvolvimento pesado|barra nuca|remada alta|dips/.test(exerciseText)) {
    add({
      severity: "warning",
      code: "shoulder_conflict",
      message: "Há possível conflito entre restrição de ombro e overhead agressivo.",
      recommendation: "Priorizar remada, face pull, rotadores e pegada neutra.",
      source: "anamnese",
    });
  }

  if ((args.input.isEnduranceAthlete || args.input.runningDaysContext) && hasHeavyLowerNearEndurance(args.program)) {
    add({
      severity: "warning",
      code: "endurance_lower_body_conflict",
      message: "Treino pesado de MMII pode conflitar com corrida/endurance no fim da semana.",
      recommendation: "Separar MMII pesado de longos/tiros e reduzir volume de pernas em cerca de 20%.",
      source: "periodizacao",
    });
  }

  const enduranceDays = Number(args.input.runningDaysContext?.days_per_week) || (args.input.isEnduranceAthlete ? 3 : 0);
  const hasEnduranceAgenda = Boolean(args.input.enduranceAgenda || args.input.runningDaysContext?.schedule || args.input.runningDaysContext?.sessions?.length);
  if (enduranceDays >= 3 && !hasEnduranceAgenda) {
    add({
      severity: "warning",
      code: "endurance_agenda_missing",
      message: "Aluno faz endurance >= 3x/semana, mas a agenda das sessões não foi informada.",
      recommendation: "Confirmar dias de treino longo/tiro antes de posicionar MMII pesado.",
      source: "periodizacao",
    });
  }

  if (shouldHoldProgression(args.input) && hasAdvancedMethod(args.program)) {
    add({
      severity: "warning",
      code: "advanced_method_with_pain",
      message: "Método avançado apareceu em contexto com dor/restrição.",
      recommendation: "Remover método avançado até estabilizar dor e técnica.",
      source: "nivel",
    });
  }

  const level = normalizeText(args.input.fitnessLevel);
  if (level.includes("inic") && hasAdvancedMethod(args.program)) {
    add({
      severity: "warning",
      code: "advanced_method_for_beginner",
      message: "Método avançado apareceu para aluno iniciante.",
      recommendation: "Usar progressão dupla, técnica e RIR 3-4 antes de métodos avançados.",
      source: "nivel",
    });
  }

  const performanceObjective = /(performance|potencia|velocidade|esporte)/.test(normalizeText(args.input.objective));
  const technicalPlyometricsAllowed = !level.includes("inic") && !shouldHoldProgression(args.input) && !args.input.deload && performanceObjective;
  if (/pliometr|salto|jump|hop/.test(exerciseText) && Number(args.input.blockNumber || 1) <= 1 && !technicalPlyometricsAllowed) {
    add({
      severity: "warning",
      code: "plyometrics_in_block_1",
      message: "Pliometria apareceu no primeiro bloco.",
      recommendation: "Remover pliometria nas semanas 1-2 e priorizar base técnica.",
      source: "periodizacao",
    });
  }

  if (args.input.deload && hasStructuredDeloadMethod(args.program)) {
    add({
      severity: "warning",
      code: "deload_with_advanced_method",
      message: "Deload não deve conter falha ou método avançado.",
      recommendation: "Reduzir volume 40-50%, usar RIR 4-5 e manter técnica.",
      source: "periodizacao",
    });
  }

  return {
    status: blockers.length ? "blocked" : warnings.some((warning) => warning.severity === "warning") ? "warnings" : "ok",
    warnings,
    corrections,
    blockers,
    volume_review,
  };
}
