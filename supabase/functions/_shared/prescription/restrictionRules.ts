import { PAIN_AND_SAFETY_RULES } from "./methodology.ts";
import { normalizeText } from "./presets.ts";
import type { PrescriptionInput, RestrictionRule, TrainingExercise, TrainingProgram, ValidationCorrection } from "./types.ts";
import { clinicalRiskText, prescriptionRiskText } from "./clinicalContext.ts";

export type Severity = "leve" | "moderada" | "severa";

const severityRank: Record<Severity, number> = { leve: 1, moderada: 2, severa: 3 };

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function asSeverity(value: unknown): Severity {
  const text = normalizeText(value);
  if (/sever|grave|alta/.test(text)) return "severa";
  if (/moder/.test(text)) return "moderada";
  return "leve";
}

export function classifyPainSeverity(input: PrescriptionInput, region?: string): Severity {
  const text = clinicalRiskText(input);
  const scoped = region ? `${region} ${text}` : text;
  const reportEva = Math.max(0, ...(input.painReports || [])
    .filter((report) => !region || normalizeText(report.region).includes(normalizeText(region)) || text.includes(normalizeText(region)))
    .map((report) => Number(report.eva) || 0));
  const eva = Math.max(
    Number(input.painEva) || 0,
    Number((input.anamneseContext as any)?.eva) || 0,
    Number((input.anamneseContext as any)?.pain_eva) || 0,
    reportEva,
  );
  if (eva > 5 || /eva\s*(6|7|8|9|10)|dor\s*(severa|grave|forte)/.test(scoped)) return "severa";
  if (eva >= 4 || /eva\s*(4|5)|dor\s*moder/.test(scoped)) return "moderada";
  return "leve";
}

export function classifyAssessmentSeverity(input: PrescriptionInput, key?: string): Severity {
  const raw = input.assessmentContext as any;
  const candidates = [
    raw?.ohs_compensations,
    raw?.prescription_context?.ohs_compensations,
    raw?.assessment_json?.ohs_compensations,
  ].find(Array.isArray) || [];
  const matching = key ? candidates.find((item: any) => item?.key === key) : candidates.find((item: any) => item?.presente === true || item?.present === true);
  return asSeverity(matching?.severidade || matching?.severity);
}

export function combineSeverity(...items: Array<Severity | undefined>): Severity {
  return items.filter(Boolean).sort((a, b) => severityRank[b!] - severityRank[a!])[0] || "leve";
}

function makeRule(rule: Omit<RestrictionRule, "active" | "volumeMultiplier" | "removePattern" | "alertTeacher"> & { severity: Severity }): RestrictionRule {
  const safety = PAIN_AND_SAFETY_RULES[rule.severity];
  return {
    ...rule,
    active: true,
    volumeMultiplier: safety.volumeMultiplier,
    removePattern: rule.severity === "severa",
    alertTeacher: safety.alertTeacher,
  };
}

const OHS_RULE_FACTORIES: Record<string, (severity: Severity) => RestrictionRule> = {
  dynamic_valgus: (severity) => makeRule({
    key: "dynamic_valgus",
    label: "Valgo dinâmico",
    region: "joelho",
    severity,
    affectedRegions: ["joelho", "quadril", "gluteos"],
    avoidKeywords: ["salto", "pliometr", "agachamento profundo", "atg", "carga axial alta", "afundo alto"],
    preferKeywords: ["gluteo medio", "gluteo", "abducao", "mini band", "step", "leg press", "caixa", "isometria"],
    recommendation: "Priorizar glúteo médio antes do agachamento, controlar valgo e usar ROM sem dor.",
    explanationCode: "priorizei_gluteo_medio_por_valgo",
  }),
  butt_wink: (severity) => makeRule({
    key: "butt_wink",
    label: "Retroversão pélvica / butt wink",
    region: "lombar",
    severity,
    affectedRegions: ["lombar", "posterior", "quadril"],
    avoidKeywords: ["agachamento profundo", "terra convencional pesado", "good morning", "flexao espinhal carregada", "carga axial alta"],
    preferKeywords: ["caixa", "hip thrust", "ponte", "core", "pallof", "bird dog", "leg press"],
    recommendation: "Limitar amplitude ao ponto de pelve neutra e reforçar core anti-extensão/anti-rotação.",
    explanationCode: "limitei_amplitude_por_butt_wink",
  }),
  trunk_forward_lean: (severity) => makeRule({
    key: "trunk_forward_lean",
    label: "Inclinação excessiva de tronco",
    region: "lombar",
    severity,
    affectedRegions: ["lombar", "tornozelo", "posterior"],
    avoidKeywords: ["terra pesado", "good morning", "carga axial alta", "flexao espinhal carregada"],
    preferKeywords: ["mobilidade tornozelo", "panturrilha", "core", "leg press", "goblet", "remada apoiada"],
    recommendation: "Reduzir demanda lombar, melhorar tornozelo/posterior e limitar carga axial.",
    explanationCode: "reduzi_carga_axial_por_trunk_lean",
  }),
  shoulder_protraction_kyphosis: (severity) => makeRule({
    key: "shoulder_protraction_kyphosis",
    label: "Protração de ombro / cifose",
    region: "ombro",
    severity,
    affectedRegions: ["ombro", "toracica", "costas"],
    avoidKeywords: ["desenvolvimento atras da nuca", "remada alta", "dips", "overhead pesado", "barra nuca"],
    preferKeywords: ["face pull", "rotador", "rotacao externa", "remada", "pegada neutra", "landmine", "retracao escapular"],
    recommendation: "Priorizar controle escapular antes de empurrar pesado e evitar ROM dolorido.",
    explanationCode: "priorizei_controle_escapular_por_ombro",
  }),
  overhead_arm_asymmetry: (severity) => makeRule({
    key: "overhead_arm_asymmetry",
    label: "Assimetria no overhead",
    region: "ombro",
    severity,
    affectedRegions: ["ombro", "costas"],
    avoidKeywords: ["overhead pesado", "snatch", "jerk", "barra nuca"],
    preferKeywords: ["unilateral", "rotador", "remada", "mobilidade ombro", "landmine"],
    recommendation: "Evitar overhead pesado até estabilizar simetria, mobilidade e controle escapular.",
    explanationCode: "evitei_overhead_por_assimetria",
  }),
};

function activeOhsItems(input: PrescriptionInput) {
  const raw = input.assessmentContext as any;
  const candidates = [
    raw?.ohs_compensations,
    raw?.prescription_context?.ohs_compensations,
    raw?.assessment_json?.ohs_compensations,
  ].find(Array.isArray) || [];
  return candidates.filter((item: any) => item?.presente === true || item?.present === true);
}

export function getRestrictionRulesForRegion(input: PrescriptionInput, region: "joelho" | "lombar" | "ombro" | "global" = "global") {
  return deriveRestrictionRules(input).filter((rule) => region === "global" || rule.region === region || rule.affectedRegions.includes(region));
}

export function deriveRestrictionRules(input: PrescriptionInput): RestrictionRule[] {
  const text = prescriptionRiskText(input);
  const rules: RestrictionRule[] = [];

  if (has(text, /joelho|valgo|patelar|condromalacia/)) {
    const severity = combineSeverity(classifyPainSeverity(input, "joelho"), classifyAssessmentSeverity(input, "dynamic_valgus"));
    rules.push(makeRule({
      key: "knee_pain",
      label: "Dor/restrição de joelho",
      region: "joelho",
      severity,
      affectedRegions: ["joelho", "quadriceps", "gluteos"],
      avoidKeywords: ["salto", "pliometr", "agachamento livre profundo", "agachamento profundo", "atg", "afundo alto", "extensora pesada"],
      preferKeywords: ["leg press", "agachamento caixa", "caixa", "rom parcial", "gluteo medio", "abducao", "posterior", "isometria", "extensao terminal"],
      recommendation: "Reduzir joelho-dominante, evitar ATG/carga profunda e priorizar glúteo médio, posterior e ROM sem dor.",
      explanationCode: "reduzi_quadriceps_por_dor_joelho",
    }));
  }

  if (has(text, /lombar|ciatico|hernia|butt wink|retrovers|trunk lean|inclinacao/)) {
    const severity = combineSeverity(classifyPainSeverity(input, "lombar"), classifyAssessmentSeverity(input, "butt_wink"), classifyAssessmentSeverity(input, "trunk_forward_lean"));
    rules.push(makeRule({
      key: "low_back_pain",
      label: "Dor/restrição lombar",
      region: "lombar",
      severity,
      affectedRegions: ["lombar", "posterior", "core"],
      avoidKeywords: ["flexao espinhal carregada", "terra convencional pesado", "good morning", "abdominal com carga", "agachamento livre pesado", "carga axial alta"],
      preferKeywords: ["rdl leve", "hip thrust", "remada apoiada", "leg press", "pelve controlada", "prancha", "bird dog", "pallof"],
      recommendation: "Remover flexão espinhal carregada, limitar carga axial e adicionar core anti-extensão/anti-rotação.",
      explanationCode: "reduzi_carga_axial_por_queixa_lombar",
    }));
  }

  if (has(text, /ombro|manguito|cervical|overhead|cifose|protrus/)) {
    const severity = combineSeverity(classifyPainSeverity(input, "ombro"), classifyAssessmentSeverity(input, "shoulder_protraction_kyphosis"), classifyAssessmentSeverity(input, "overhead_arm_asymmetry"));
    rules.push(makeRule({
      key: "shoulder_pain",
      label: "Dor/restrição de ombro",
      region: "ombro",
      severity,
      affectedRegions: ["ombro", "costas", "peitoral"],
      avoidKeywords: ["desenvolvimento atras da nuca", "remada alta", "dips", "supino rom dolorido", "barra nuca", "overhead pesado"],
      preferKeywords: ["landmine", "pegada neutra", "retracao escapular", "deltoide posterior", "rotacao externa", "supino inclinado rom indolor", "face pull"],
      recommendation: "Remover variações agressivas e priorizar controle escapular, pegada neutra e ROM indolor.",
      explanationCode: "troquei_supino_por_rom_indolor",
    }));
  }

  for (const item of activeOhsItems(input)) {
    const key = String(item.key || "");
    const factory = OHS_RULE_FACTORIES[key];
    if (!factory || rules.some((rule) => rule.key === key)) continue;
    rules.push(factory(combineSeverity(asSeverity(item.severidade || item.severity), classifyPainSeverity(input))));
  }

  return rules;
}

export function exerciseConflictsWithRestrictions(
  exercise: Pick<TrainingExercise, "exercise_name" | "biomechanical_note" | "cues" | "phase" | "muscle_group">,
  rules: RestrictionRule[],
) {
  const text = normalizeText([
    exercise.exercise_name,
    exercise.biomechanical_note,
    exercise.cues,
    exercise.phase,
  ]);
  const group = normalizeText(exercise.muscle_group);

  return rules.some((rule) => {
    const explicitlyAvoided = rule.avoidKeywords.some((keyword) => text.includes(normalizeText(keyword)));
    if (explicitlyAvoided) return true;

    if (rule.region === "joelho") {
      return /quadr/.test(group) && /agach|afundo|avanco|lunge|leg press|extensor|salto|step|joelho/.test(text);
    }
    if (rule.region === "lombar") {
      return /posterior|lombar/.test(group) && /terra|stiff|rdl|good morning|agach|hiperextens|flexao|hinge/.test(text);
    }
    if (rule.region === "ombro") {
      return /peit|ombro/.test(group) && /supino|press|desenvolvimento|overhead|dips|remada alta|elevacao/.test(text);
    }
    return false;
  });
}

export function applyRestrictionRules(program: TrainingProgram, rules: RestrictionRule[]) {
  const corrections: ValidationCorrection[] = [];
  if (!rules.length) return corrections;

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.alertTeacher) {
      corrections.push({
        code: `${rule.key}_teacher_alert`,
        message: `${rule.label}: severidade ${rule.severity}; sinalizar professor e não tomar decisão clínica automática.`,
        applied: false,
        source: "anamnese",
      });
    }

    if (rule.removePattern) {
      for (const workout of program.workouts) {
        const before = workout.exercises.length;
        workout.exercises = workout.exercises.filter((exercise) => {
          const text = normalizeText([exercise.exercise_name, exercise.biomechanical_note, exercise.cues, exercise.phase]);
          const group = normalizeText(exercise.muscle_group);
          const explicitlyAvoided = rule.avoidKeywords.some((keyword) => text.includes(normalizeText(keyword)));
          const severeAffectedPattern =
            rule.region === "joelho" && /quadr/.test(group)
            || rule.region === "lombar" && /posterior/.test(group) && /terra|rdl|levantamento|good morning|hinge/.test(text)
            || rule.region === "ombro" && /peit|ombro/.test(group) && /supino|press|desenvolvimento|overhead|dips/.test(text);
          return !explicitlyAvoided && !severeAffectedPattern;
        });
        if (workout.exercises.length !== before) {
          corrections.push({
            code: `${rule.key}_removed_problem_pattern`,
            message: `${rule.label}: removi padrão problemático por severidade alta.`,
            applied: true,
            source: "metodologia_bn",
          });
        }
      }
    }
  }

  return corrections;
}
