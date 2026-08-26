import type { PrescriptionExplanation, RestrictionRule, ValidationCorrection } from "./types.ts";

export function explanationsFromRestrictions(rules: RestrictionRule[]): PrescriptionExplanation[] {
  return rules.filter((rule) => rule.active).map((rule) => ({
    rule_id: rule.explanationCode,
    category: rule.severity === "severa" ? "seguranca" : rule.region === "joelho" || rule.key.includes("valg") ? "priorizacao" : "substituicao",
    source: rule.key.includes("dynamic") || rule.key.includes("butt") || rule.key.includes("trunk") || rule.key.includes("shoulder_protraction") ? "avaliacao_funcional" : "anamnese",
    target: rule.affectedRegions.join(", "),
    action: rule.recommendation,
    reason: `${rule.label} disparou a regra ${rule.key}.`,
    severity: rule.severity,
  }));
}

export function enduranceExplanation(enabled: boolean): PrescriptionExplanation[] {
  if (!enabled) return [];
  return [{
    rule_id: "reduzi_mmii_por_corrida",
    category: "volume",
    source: "objetivo",
    target: "quadriceps, posterior, gluteos",
    action: "Reduzi volume de MMII e evitei acúmulo de fadiga.",
    reason: "Aluno combina musculação com corrida/endurance.",
    severity: "moderada",
  }];
}

export function frequencyDowngradeExplanation(enabled: boolean, requested: number, structured: number): PrescriptionExplanation[] {
  if (!enabled) return [];
  return [{
    rule_id: "rebaixei_frequencia_iniciante_6_dias",
    category: "nivel",
    source: "nivel",
    target: "frequencia semanal",
    action: `Rebaixei de ${requested} dias disponíveis para ${structured} dias estruturados com extras leves.`,
    reason: "Iniciante com 6 dias disponíveis tem maior risco de excesso de volume e baixa recuperação.",
    severity: "leve",
  }];
}

export function progressionExplanation(advancedAllowed: boolean): PrescriptionExplanation {
  return advancedAllowed
    ? {
        rule_id: "metodo_avancado_controlado",
        category: "progressao",
        source: "nivel",
        target: "semanas 5-6",
        action: "Permitir método avançado apenas em exercício estável e sem dor.",
        reason: "Aluno não é iniciante e não há contexto ativo de dor.",
      }
    : {
        rule_id: "evitei_metodo_avancado_por_dor_ou_nivel",
        category: "nivel",
        source: "nivel",
        target: "progressão",
        action: "Bloqueei métodos avançados e mantive progressão dupla/técnica.",
        reason: "Iniciante ou contexto com dor/restrição.",
        severity: "moderada",
      };
}

export function deloadExplanation(enabled: boolean): PrescriptionExplanation[] {
  if (!enabled) return [];
  return [{
    rule_id: "deload_reduz_volume",
    category: "deload",
    source: "feedback_aluno",
    target: "semana de deload",
    action: "Reduzi volume em 40-50%, usei RIR 4 e removi falha/método avançado.",
    reason: "Deload solicitado ou gatilho de fadiga/dor antes de reavaliação.",
    severity: "leve",
  }];
}

export function correctionsToExplanations(corrections: ValidationCorrection[]): PrescriptionExplanation[] {
  return corrections.map((correction) => ({
    rule_id: correction.code,
    category: correction.source === "volume" ? "volume" : correction.source === "periodizacao" ? "progressao" : "seguranca",
    source: "validador",
    target: correction.source,
    action: correction.message,
    reason: `Correção ${correction.applied ? "aplicada" : "sugerida"} pelo validador.`,
  }));
}
