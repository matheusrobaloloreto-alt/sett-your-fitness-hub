import type { PeriodizationBlock, PrescriptionInput } from "./types.ts";
import { DELOAD_RULES } from "./methodology.ts";
import { classifyPainSeverity } from "./restrictionRules.ts";
import { clinicalRiskText } from "./clinicalContext.ts";

export function hasPainContext(input: PrescriptionInput) {
  const textual = /(dor|lesao|joelho|lombar|ombro|tornozelo|quadril|eva|retorno|reabilit)/.test(clinicalRiskText(input));
  // Dor estruturada (painReports[].eva / painEva) também conta como contexto de dor,
  // mesmo sem texto em restrictions/assessment/anamnese. Ela segura a progressão do
  // padrão afetado; métodos continuam disponíveis nos exercícios seguros da sessão.
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
  const hold = shouldHoldProgression(input);

  if (input.deload) {
    return Array.from({ length: duration }, (_, index) => ({
      weeks: String(index + 1),
      stimulus: "deload/regeneracao tecnica",
      methods: [index % 2 === 0 ? "isometria técnica" : "pico de contração controlado"],
      progression_rule: `Semana ${index + 1}: RIR ${DELOAD_RULES.rir}, 50% do volume seguro e método técnico de baixa fadiga.`,
    }));
  }

  const weeks: PeriodizationBlock[] = [
    { weeks: "1", stimulus: "base tecnica com 80% do volume", methods: ["isometria técnica"], progression_rule: "RIR 3-4; reduzir volume sem deixar todos os exercícios com uma série." },
    { weeks: "2", stimulus: "base tecnica com 90% do volume", methods: ["pico de contração"], progression_rule: "RIR 3-4; aumentar repetições mantendo técnica." },
    { weeks: "3", stimulus: "acumulação com 100% do volume", methods: ["tensão controlada e agrupamento"], progression_rule: hold ? "RIR 2-3; manter/regredir o padrão afetado." : "RIR 2-3; progredir repetições antes de carga." },
    { weeks: "4", stimulus: "acumulação com 105% do volume", methods: ["agrupamento e intensidade seletiva"], progression_rule: hold ? "Manter 50% do volume no padrão severamente afetado." : "Distribuir o acréscimo entre exercícios estáveis." },
    { weeks: "5", stimulus: "intensificação com 105% do volume", methods: ["agrupamento e intensidade controlada"], progression_rule: "Sinalizar aquecimento, séries normais e as duas séries finais até a falha em um exercício elegível." },
    { weeks: "6", stimulus: "consolidação com 100% do volume", methods: ["variação final de método"], progression_rule: "Registrar resultado para orientar a progressão da renovação seguinte." },
  ];
  return weeks.slice(0, duration);
}

export function progressionProtocol(input: PrescriptionInput) {
  if (input.deload) return `Deload: reduzir volume 50%, RIR ${DELOAD_RULES.rir}, mantendo métodos técnicos de baixa fadiga e a sinalização W/Normal/F.`;
  if (shouldHoldProgression(input)) return "Progressao por tolerancia: dor > 3 ou técnica quebrou: hold/regress no padrão afetado; métodos permanecem apenas em exercícios seguros.";
  return hasPainContext(input)
    ? "Progressao por tolerancia: progredir reps antes de carga; regredir amplitude/carga se dor > 3 ou perda técnica. Métodos somente fora da região dolorosa."
    : "Progredir reps, volume e técnica semanalmente; usar métodos variados sem ultrapassar o teto de volume.";
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
