// Periodização da metodologia SETT / BN.
// Eixos:
//  - MICROCICLO (caráter da semana): ordinário (carga normal/progressiva),
//    choque (pico de intensidade) e regenerativo (deload/recuperação).
//  - MESOCICLO (ênfase do bloco): base, acumulação, intensificação e polimento (taper).
// O plano é DERIVADO do objetivo + datas/duração do ciclo do aluno e está alinhado a
// PROGRESSION_BLOCKS (base RIR 3-4 / acumulação 2-3 / intensificação 2) e DELOAD_RULES
// (volume 50%, RIR 4-5) do motor de prescrição (supabase/functions/_shared/prescription).

export type MicrocycleType = "ordinario" | "regenerativo" | "choque";
export type MesocyclePhase = "base" | "acumulacao" | "intensificacao" | "polimento";

export const MICROCYCLES: Record<MicrocycleType, {
  label: string; short: string; description: string; tone: "primary" | "amber" | "green";
}> = {
  ordinario: {
    label: "Microciclo ordinário", short: "Ordinário", tone: "primary",
    description: "Semana de carga normal e progressiva. Treine com técnica e adicione um pouco de carga ou repetição em relação à semana anterior.",
  },
  choque: {
    label: "Microciclo de choque", short: "Choque", tone: "amber",
    description: "Semana de pico: intensidade alta e perto da falha. É o estímulo mais forte do bloco — capriche na execução e na recuperação fora do treino.",
  },
  regenerativo: {
    label: "Microciclo regenerativo", short: "Regenerativo", tone: "green",
    description: "Semana mais leve (deload): volume e intensidade reduzidos para recuperar e supercompensar. Mantenha a técnica, sem ir à falha.",
  },
};

export const MESOCYCLES: Record<MesocyclePhase, { label: string; description: string }> = {
  base: { label: "Base", description: "Adaptação e técnica. Construir base de volume com folga de esforço (RIR 3-4)." },
  acumulacao: { label: "Acumulação", description: "Acúmulo de volume rumo ao máximo tolerável (RIR 2-3). É onde a maior parte do ganho acontece." },
  intensificacao: { label: "Intensificação", description: "Mais intensidade e proximidade da falha (RIR ~2); métodos avançados conforme o nível." },
  polimento: { label: "Polimento", description: "Reduz o volume e mantém a intensidade para 'afiar' o desempenho perto do objetivo/prova." },
};

export interface WeekPhase {
  week: number;          // 1-based
  mesocycle: MesocyclePhase;
  microcycle: MicrocycleType;
  rir: string;
  volumePct: number;     // % do volume de referência
  focus: string;
}

export interface PeriodizationPlan {
  durationWeeks: number;
  objective: string | null;
  weeks: WeekPhase[];
}

const PERFORMANCE_OBJECTIVES = ["forca", "força", "performance", "desempenho", "prova", "competi", "maraton", "triat", "potenc", "atleta"];

export function isPerformanceObjective(obj?: string | null): boolean {
  const o = (obj || "").toLowerCase();
  return PERFORMANCE_OBJECTIVES.some((k) => o.includes(k));
}

/** Semanas (1-based) a partir de duas datas ISO (yyyy-mm-dd). */
export function weeksBetweenDates(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null;
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * Monta o plano de periodização (semana a semana) a partir do objetivo e da duração.
 * Determinístico: mesmo objetivo + duração ⇒ mesmo plano.
 */
export function buildPeriodizationPlan(objective?: string | null, durationWeeks?: number | null): PeriodizationPlan {
  const N = Math.max(1, Math.min(24, Math.round(Number(durationWeeks) || 6)));
  const perf = isPerformanceObjective(objective);

  // O ciclo BN curto usa três blocos executáveis de duas semanas. Deload não é
  // presumido: ele só deve entrar quando o motor identificar necessidade real.
  if (N <= 6) {
    const weeks: WeekPhase[] = Array.from({ length: N }, (_, index) => {
      const week = index + 1;
      const mesocycle: MesocyclePhase = week <= 2 ? "base" : week <= 4 ? "acumulacao" : "intensificacao";
      const microcycle: MicrocycleType = week === 5 ? "choque" : "ordinario";
      const rir = mesocycle === "base" ? "3-4" : mesocycle === "acumulacao" ? "2-3" : "2";
      const volumePct = week === 1 ? 80 : week === 2 ? 90 : week === 3 ? 100 : week === 4 ? 105 : week === 5 ? 105 : 100;
      return {
        week,
        mesocycle,
        microcycle,
        rir,
        volumePct,
        focus: MESOCYCLES[mesocycle].description,
      };
    });
    return { durationWeeks: N, objective: objective ?? null, weeks };
  }

  // Em macrociclos longos, mantém semanas regenerativas a cada quatro semanas.
  const blockLen = 4;
  const deload = new Set<number>();
  if (N >= 4) {
    for (let w = blockLen; w <= N; w += blockLen) deload.add(w);
    deload.add(N); // garante a última como regenerativa
  }
  // Choque: semana imediatamente antes de cada deload (quando há espaço).
  const shock = new Set<number>();
  deload.forEach((d) => { if (d - 1 >= 2 && !deload.has(d - 1)) shock.add(d - 1); });

  const weeks: WeekPhase[] = [];
  for (let i = 0; i < N; i++) {
    const week = i + 1;
    const frac = N === 1 ? 1 : week / N;
    let meso: MesocyclePhase = frac <= 1 / 3 ? "base" : frac <= 2 / 3 ? "acumulacao" : "intensificacao";
    let micro: MicrocycleType = "ordinario";
    let rir = meso === "base" ? "3-4" : meso === "acumulacao" ? "2-3" : "2";
    let vol = meso === "acumulacao" ? 110 : 100;
    let focus = MESOCYCLES[meso].description;

    if (shock.has(week)) {
      micro = "choque"; rir = "1-2"; vol = 115;
      focus = "Pico do bloco: intensidade máxima controlada, perto da falha.";
    }
    if (deload.has(week)) {
      micro = "regenerativo"; rir = "4-5"; vol = 50;
      if (perf && week === N) {
        meso = "polimento"; vol = 65; rir = "2-3"; focus = MESOCYCLES.polimento.description;
      } else {
        focus = "Deload: recupere e supercompense. Volume e intensidade reduzidos.";
      }
    }
    weeks.push({ week, mesocycle: meso, microcycle: micro, rir, volumePct: vol, focus });
  }
  return { durationWeeks: N, objective: objective ?? null, weeks };
}

/** Índice 0-based da semana atual a partir da data de início; clamp em [0, N-1]. */
export function currentWeekIndex(startDate?: string | null, durationWeeks?: number, today: Date = new Date()): number {
  const N = Math.max(1, durationWeeks || 6);
  if (!startDate) return 0;
  const start = new Date(startDate + "T00:00:00");
  if (isNaN(start.getTime())) return 0;
  const wk = Math.floor((today.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, Math.min(N - 1, wk));
}
