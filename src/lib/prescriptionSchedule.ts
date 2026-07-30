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
