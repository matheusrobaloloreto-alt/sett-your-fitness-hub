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
  const severity = classifyPainSeverity(input);
  const text = clinicalRiskText(input);
  const conservativeReturn = /retorno|reabilit|pos[- ]?dor|p[oó]s[- ]?dor/.test(text);
  return severity !== "leve" || conservativeReturn || Boolean(input.techniqueBreakdown);
}

export function resolveDurationWeeks(input: PrescriptionInput) {
  const requested = Number(input.durationWeeks) || 6;
  return requested === 4 ? 4 : 6;
}

export function buildPeriodizationBlocks(input: PrescriptionInput): PeriodizationBlock[] {
  const duration = resolveDurationWeeks(input);
  const level = normalizeText(input.fitnessLevel);
  const objective = normalizeText(input.objective);
  const hold = shouldHoldProgression(input);
  const advancedAllowed = !input.deload && !hold && !level.includes("inic");
  const technicalPlyometricsAllowed = advancedAllowed && !input.deload && /(performance|potencia|velocidade|esporte)/.test(objective);

  if (input.deload) {
    const blocks = duration === 4 ? ["1-2", "3-4"] : ["1-2", "3-4", "5-6"];
    return blocks.map((weeks) => ({
      weeks,
      stimulus: "deload/regeneracao tecnica",
      methods: [...DELOAD_RULES.methods],
      progression_rule: `RIR ${DELOAD_RULES.rir}. Manter carga e padrões técnicos durante todo o deload.`,
    }));
  }

  if (duration === 4) {
    return [
      { weeks: "1-2", stimulus: "adaptacao/base tecnica", methods: ["tempo controlado", "progressao dupla leve"], progression_rule: "Aumentar reps mantendo RIR 3 e técnica limpa." },
      { weeks: "3-4", stimulus: "progressao conservadora", methods: advancedAllowed ? ["piramide leve em padrao estavel"] : ["sem metodos avancados"], progression_rule: "Subir carga 2-5% apenas se sem dor e sem compensação." },
    ];
  }

  return [
    { weeks: PROGRESSION_BLOCKS.base.weeks, stimulus: PROGRESSION_BLOCKS.base.stimulus, methods: [...PROGRESSION_BLOCKS.base.methods], progression_rule: technicalPlyometricsAllowed ? "RIR 3-4. Pliometria técnica de baixo volume, sempre antes da força e sem fadiga. Se a técnica cair, remover." : "RIR 3-4. Se RIR acima do alvo: subir reps; se bateu topo com RIR alvo: subir carga e voltar ao piso. Sem pliometria." },
    { weeks: PROGRESSION_BLOCKS.accumulation.weeks, stimulus: PROGRESSION_BLOCKS.accumulation.stimulus, methods: hold ? ["hold/regress por dor ou técnica"] : [...PROGRESSION_BLOCKS.accumulation.methods], progression_rule: hold ? "RIR 2-3. Dor > 3 ou técnica quebrou: manter/regredir." : "RIR 2-3. Adicionar reps antes de carga; +1 série apenas em exercício estável e sem dor." },
    { weeks: PROGRESSION_BLOCKS.intensification.weeks, stimulus: PROGRESSION_BLOCKS.intensification.stimulus, methods: advancedAllowed && !hold ? ["up-set ou piramide leve em exercicio estavel"] : ["sem metodos avancados"], progression_rule: hold ? "RIR 2. Manter ou regredir até dor <= 3 e técnica estável." : "RIR 2; método avançado só em exercício estável e sem dor." },
  ];
}

export function progressionProtocol(input: PrescriptionInput) {
  if (input.deload) return `Deload: reduzir volume 40-50%, RIR ${DELOAD_RULES.rir}, sem falha e sem método avançado.`;
  if (shouldHoldProgression(input)) return "Progressao por tolerancia: dor > 3 ou técnica quebrou: hold/regress. Sem método avançado, sem pliometria e sem falha.";
  return hasPainContext(input)
    ? "Progressao por tolerancia: progredir reps antes de carga; regredir amplitude/carga se dor > 3 ou perda técnica. Métodos avançados somente em acessórios estáveis e fora da região dolorosa."
    : "Progredir reps antes de carga; usar métodos avançados apenas no bloco final e em padrões estáveis.";
}

export interface DeloadSetAllocation {
  sets: number[];
  originalTotal: number;
  targetTotal: number;
  allocatedTotal: number;
  reductionRatio: number;
  constrainedByMinimum: boolean;
}

export function allocateDeloadSetCounts(values: number[]): DeloadSetAllocation {
  const original = values.map((value) => Math.max(1, Math.round(Number(value) || 1)));
  const originalTotal = original.reduce((sum, sets) => sum + sets, 0);
  if (originalTotal === 0) {
    return {
      sets: [],
      originalTotal: 0,
      targetTotal: 0,
      allocatedTotal: 0,
      reductionRatio: 0,
      constrainedByMinimum: false,
    };
  }

  // ceil mantém a redução real na faixa de 40-50% quando o total é ímpar.
  // Cada exercício preserva ao menos uma série; quando isso torna a faixa
  // matematicamente impossível, o resultado sinaliza a restrição explicitamente.
  const targetTotal = Math.ceil(originalTotal * DELOAD_RULES.volumeReduction);
  const minimumTotal = original.length;
  const allocatedTarget = Math.max(targetTotal, minimumTotal);
  const totalCapacity = originalTotal - minimumTotal;
  const remainingBudget = allocatedTarget - minimumTotal;
  const shares = original
    .map((count, index) => ({
      index,
      exactExtra: totalCapacity > 0 ? remainingBudget * (count - 1) / totalCapacity : 0,
    }));
  const sets = shares.map(({ exactExtra }) => 1 + Math.floor(exactExtra));
  let allocatedTotal = sets.reduce((sum, count) => sum + count, 0);
  const order = shares
    .filter(({ index }) => sets[index] < original[index])
    .sort((a, b) =>
      (b.exactExtra - Math.floor(b.exactExtra)) - (a.exactExtra - Math.floor(a.exactExtra)) ||
      a.index - b.index
    );

  for (const candidate of order) {
    if (allocatedTotal >= targetTotal) break;
    sets[candidate.index] += 1;
    allocatedTotal += 1;
  }

  const reductionRatio = (originalTotal - allocatedTotal) / originalTotal;
  return {
    sets,
    originalTotal,
    targetTotal,
    allocatedTotal,
    reductionRatio,
    constrainedByMinimum: minimumTotal > targetTotal,
  };
}
