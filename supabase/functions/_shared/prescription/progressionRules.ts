import { normalizeText } from "./presets.ts";
import type { PeriodizationBlock, PrescriptionInput } from "./types.ts";
import { DELOAD_RULES, PROGRESSION_BLOCKS } from "./methodology.ts";
import { classifyPainSeverity } from "./restrictionRules.ts";
import { clinicalRiskText } from "./clinicalContext.ts";

export function hasPainContext(input: PrescriptionInput) {
  const textual = /(dor|lesao|joelho|lombar|ombro|tornozelo|quadril|eva|retorno|reabilit)/.test(clinicalRiskText(input));
  // F1: dor estruturada (painReports[].eva / painEva) também conta como contexto de dor,
  // mesmo sem texto em restrictions/assessment/anamnese. classifyPainSeverity lê esses campos
  // e retorna >= "moderada" quando EVA > 3 → trava progressão e bloqueia método avançado.
  return textual || classifyPainSeverity(input) !== "leve";
}

export function shouldHoldProgression(input: PrescriptionInput) {
  return hasPainContext(input) || Boolean(input.techniqueBreakdown);
}

export function resolveDurationWeeks(input: PrescriptionInput) {
  const requested = Number(input.durationWeeks) || 6;
  return requested === 4 ? 4 : 6;
}

export function buildPeriodizationBlocks(input: PrescriptionInput): PeriodizationBlock[] {
  const duration = resolveDurationWeeks(input);
  const level = normalizeText(input.fitnessLevel);
  const pain = hasPainContext(input);
  const advancedAllowed = !pain && !level.includes("inic");
  const hold = shouldHoldProgression(input);

  if (duration === 4) {
    return [
      { weeks: "1-2", stimulus: "adaptacao/base tecnica", methods: ["tempo controlado", "progressao dupla leve"], progression_rule: "Aumentar reps mantendo RIR 3 e técnica limpa." },
      { weeks: "3-4", stimulus: "progressao conservadora", methods: advancedAllowed ? ["piramide leve em padrao estavel"] : ["sem metodos avancados"], progression_rule: "Subir carga 2-5% apenas se sem dor e sem compensação." },
    ];
  }

  return [
    { weeks: PROGRESSION_BLOCKS.base.weeks, stimulus: PROGRESSION_BLOCKS.base.stimulus, methods: [...PROGRESSION_BLOCKS.base.methods], progression_rule: "RIR 3-4. Se RIR acima do alvo: subir reps; se bateu topo com RIR alvo: subir carga e voltar ao piso. Sem pliometria." },
    { weeks: PROGRESSION_BLOCKS.accumulation.weeks, stimulus: PROGRESSION_BLOCKS.accumulation.stimulus, methods: hold ? ["hold/regress por dor ou técnica"] : [...PROGRESSION_BLOCKS.accumulation.methods], progression_rule: hold ? "RIR 2-3. Dor > 3 ou técnica quebrou: manter/regredir." : "RIR 2-3. Adicionar reps antes de carga; +1 série apenas em exercício estável e sem dor." },
    { weeks: PROGRESSION_BLOCKS.intensification.weeks, stimulus: PROGRESSION_BLOCKS.intensification.stimulus, methods: advancedAllowed && !hold ? ["up-set ou piramide leve em exercicio estavel"] : ["sem metodos avancados"], progression_rule: hold ? "RIR 2. Manter ou regredir até dor <= 3 e técnica estável." : "RIR 2; método avançado só em exercício estável e sem dor." },
  ];
}

export function progressionProtocol(input: PrescriptionInput) {
  if (input.deload) return `Deload: reduzir volume 40-50%, RIR ${DELOAD_RULES.rir}, sem falha e sem método avançado.`;
  if (shouldHoldProgression(input)) return "Progressao por tolerancia: dor > 3 ou técnica quebrou: hold/regress. Sem método avançado, sem pliometria e sem falha.";
  return hasPainContext(input)
    ? "Progredir reps antes de carga; regredir amplitude/carga se dor > 3 ou perda técnica. Métodos avançados bloqueados."
    : "Progredir reps antes de carga; usar métodos avançados apenas no bloco final e em padrões estáveis.";
}

export function deloadAdjustSets(sets: number, input: PrescriptionInput) {
  if (!input.deload) return sets;
  return Math.max(1, Math.round(sets * DELOAD_RULES.volumeReduction));
}
