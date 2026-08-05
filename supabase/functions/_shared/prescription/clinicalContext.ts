import type { PrescriptionInput } from "./types.ts";

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scalarValues(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(scalarValues);
  return [];
}

const CLINICAL_TERM = /\b(dor(?:es)?|lesao|lesoes|eva|joelho|lombar|ombro|tornozelo|quadril|cervical|ciatico|hernia|condromalacia|tendin|bursit|cirurgia|pos[- ]?operatorio|retorno|reabilit|restri|limitacao|formigamento)\b/;
const NEGATION_BEFORE = /\b(sem|nenhum|nenhuma|nao tenho|nao possui|nao possuo|nao apresenta|nao relata|nega|nunca tive)\b(?:\s+\w+){0,6}\s*\b(dor(?:es)?|lesao|lesoes|restricao|limitacao)\b/;
const NEGATION_AFTER = /\b(dor(?:es)?|lesao|lesoes|restricao|limitacao)\b\s*(?::|-|=)?\s*\b(nao|nenhum|nenhuma|sem|ausente|zero|0(?:\/10)?)\b/;

/**
 * Extrai somente valores respondidos. Nomes de campos como `current_pain` e
 * `injuries` nunca entram no texto clínico e, portanto, não viram falso positivo.
 */
export function positiveClinicalText(value: unknown) {
  const segments = scalarValues(value)
    .flatMap((item) => normalize(item).split(/[|;\n]+|(?<=[.!?])\s+/))
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (!CLINICAL_TERM.test(item)) return true;
      if (NEGATION_BEFORE.test(item) || NEGATION_AFTER.test(item)) return false;
      if (/\beva\s*(?:0|zero)(?:\/10)?\b/.test(item)) return false;
      return true;
    });
  return segments.join(" ");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function activePainReports(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => {
    const report = record(item);
    const eva = Number(report.eva ?? report.pain_eva);
    const severity = normalize(report.severity);
    const description = positiveClinicalText([
      report.description,
      report.text,
      report.note,
      report.notes,
    ]);
    return (Number.isFinite(eva) && eva > 0)
      || /leve|moder|sever|grave|forte/.test(severity)
      || Boolean(description);
  });
}

/** Contexto clínico real vindo de respostas, sem achados posturais/OHS. */
export function clinicalRiskText(input: Partial<PrescriptionInput>) {
  const anamnese = record(input.anamneseContext);
  const integration = record(input.prescriptionIntegration);
  const riskScreening = record(integration.risk_screening);

  return positiveClinicalText([
    input.restrictions,
    input.injuries,
    activePainReports(input.painReports),
    Number(input.painEva) > 0 ? `EVA ${input.painEva}` : null,
    input.notes,
    // A anamnese inteira pode evoluir sem exigir uma lista fixa de campos.
    // `positiveClinicalText` percorre somente os VALORES, nunca os nomes das colunas.
    anamnese,
    riskScreening.pain_or_injury_text,
    riskScreening.red_flags,
    riskScreening.yellow_flags,
    riskScreening.pain_regions,
  ]);
}

/** Achados de movimento são restrições locais, mas não equivalem a dor relatada. */
export function assessmentFindingText(input: Partial<PrescriptionInput>) {
  return positiveClinicalText(input.assessmentContext);
}

export function prescriptionRiskText(input: Partial<PrescriptionInput>) {
  return `${clinicalRiskText(input)} ${assessmentFindingText(input)}`.trim();
}

export function hasPositiveClinicalRisk(input: Partial<PrescriptionInput>) {
  return CLINICAL_TERM.test(clinicalRiskText(input));
}
