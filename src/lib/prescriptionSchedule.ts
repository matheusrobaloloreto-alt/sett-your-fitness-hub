export type PrescriptionScheduleMode = "single" | "remaining";

export interface PrescriptionScheduleCycle {
  id: string;
  enrollment_id: string | null;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  has_workouts?: boolean;
  has_bundle?: boolean;
}

export interface PrescriptionEnrollment {
  id: string;
  status: string;
  created_at?: string | null;
}

export type LongitudinalPhase = "base" | "acumulacao" | "intensificacao" | "consolidacao";

const DAY_MS = 86_400_000;

function utcDay(value: string | Date): number {
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, Math.max(0, month - 1), day);
}

export function isCycleCurrent(cycle: PrescriptionScheduleCycle, today = new Date()): boolean {
  const now = utcDay(today);
  return now >= utcDay(cycle.start_date) && now <= utcDay(cycle.end_date);
}

export function isCycleFuture(cycle: PrescriptionScheduleCycle, today = new Date()): boolean {
  return utcDay(cycle.start_date) > utcDay(today);
}

export function daysUntilCycleEnd(cycle: PrescriptionScheduleCycle, today = new Date()): number {
  return Math.ceil((utcDay(cycle.end_date) - utcDay(today)) / DAY_MS);
}

/**
 * Re-publicações antigas podem deixar períodos sobrepostos. Para cada matrícula,
 * prioriza o ciclo marcado como ativo, depois o vigente materializado e, em
 * empate, o ciclo de maior número.
 */
export function selectCurrentCyclePerEnrollment(
  cycles: PrescriptionScheduleCycle[],
  today = new Date(),
): PrescriptionScheduleCycle[] {
  const grouped = new Map<string, PrescriptionScheduleCycle[]>();

  cycles.filter((cycle) => isCycleCurrent(cycle, today)).forEach((cycle) => {
    const key = cycle.enrollment_id || cycle.id;
    const group = grouped.get(key) || [];
    group.push(cycle);
    grouped.set(key, group);
  });

  return Array.from(grouped.values()).map((group) => [...group].sort((a, b) => {
    const aActive = a.status === "active";
    const bActive = b.status === "active";
    if (aActive !== bActive) return Number(bActive) - Number(aActive);
    const aPrepared = Boolean(a.has_workouts || a.has_bundle);
    const bPrepared = Boolean(b.has_workouts || b.has_bundle);
    if (aPrepared !== bPrepared) return Number(bPrepared) - Number(aPrepared);
    if (a.cycle_number !== b.cycle_number) return b.cycle_number - a.cycle_number;
    return utcDay(b.start_date) - utcDay(a.start_date);
  })[0]);
}

/**
 * Um aluno pode manter matrículas antigas para histórico. O Studio sempre deve
 * prescrever sobre uma única matrícula vigente, sem misturar ciclos legados.
 */
export function selectPrescriptionEnrollment<T extends PrescriptionEnrollment>(
  enrollments: T[],
): T | null {
  const statusPriority: Record<string, number> = {
    active: 0,
    awaiting_training: 1,
    awaiting_renewal: 2,
  };

  return [...enrollments]
    .filter((enrollment) => enrollment.status in statusPriority)
    .sort((a, b) => {
      const statusDifference = statusPriority[a.status] - statusPriority[b.status];
      if (statusDifference !== 0) return statusDifference;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    })[0] ?? null;
}

/**
 * Ciclos legados podem ter sido recriados com números maiores e datas
 * sobrepostas. Mantém a sequência numerada mais antiga e ignora qualquer bloco
 * que recomece antes do término do bloco anterior.
 */
export function selectSequentialScheduleCycles(
  cycles: PrescriptionScheduleCycle[],
): PrescriptionScheduleCycle[] {
  const ordered = [...cycles].sort((a, b) => {
    if (a.cycle_number !== b.cycle_number) return a.cycle_number - b.cycle_number;
    return utcDay(a.start_date) - utcDay(b.start_date);
  });
  const selected: PrescriptionScheduleCycle[] = [];

  for (const cycle of ordered) {
    const previous = selected[selected.length - 1];
    if (!previous || utcDay(cycle.start_date) > utcDay(previous.end_date)) {
      selected.push(cycle);
    }
  }

  return selected;
}

export function scheduleSpanWeeks(cycles: PrescriptionScheduleCycle[]): number {
  if (!cycles.length) return 0;
  const start = Math.min(...cycles.map((cycle) => utcDay(cycle.start_date)));
  const end = Math.max(...cycles.map((cycle) => utcDay(cycle.end_date)));
  return Math.max(1, Math.ceil((end - start + DAY_MS) / (7 * DAY_MS)));
}

export function longitudinalPhase(cycleNumber: number): LongitudinalPhase {
  const index = ((Math.max(1, cycleNumber) - 1) % 4) + 1;
  if (index === 1) return "base";
  if (index === 2) return "acumulacao";
  if (index === 3) return "intensificacao";
  return "consolidacao";
}

export function selectPrescriptionTargets(args: {
  cycles: PrescriptionScheduleCycle[];
  mode: PrescriptionScheduleMode;
  selectedCycleId?: string | null;
  today?: Date;
  includeAlreadyPrepared?: boolean;
}): PrescriptionScheduleCycle[] {
  const today = args.today ?? new Date();
  const ordered = [...args.cycles].sort((a, b) => a.cycle_number - b.cycle_number);

  if (args.mode === "single") {
    const selected = ordered.find((cycle) => cycle.id === args.selectedCycleId);
    return selected ? [selected] : [];
  }

  return ordered.filter((cycle) => {
    if (!isCycleCurrent(cycle, today) && !isCycleFuture(cycle, today)) return false;
    if (args.includeAlreadyPrepared) return true;
    return !cycle.has_workouts && !cycle.has_bundle;
  });
}

export function describeLongitudinalPhase(phase: LongitudinalPhase): string {
  if (phase === "base") return "Base técnica e calibração do novo mesociclo";
  if (phase === "acumulacao") return "Acúmulo progressivo de volume com exercícios estáveis";
  if (phase === "intensificacao") return "Intensificação controlada sem perder a técnica";
  return "Consolidação, redução de fadiga e preparação da próxima evolução";
}
