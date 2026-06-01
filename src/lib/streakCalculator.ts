/**
 * Calcula o streak de semanas consecutivas em que o aluno bateu a meta semanal.
 * Considera semana ISO (segunda a domingo). Semana corrente conta se já bateu a meta.
 */
export interface SessionDate {
  session_date: string; // YYYY-MM-DD
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function weekKey(d: Date): string {
  const m = getMonday(d);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

export function calculateStreak(sessionDates: string[], weeklyGoal: number): number {
  if (!sessionDates.length || weeklyGoal <= 0) return 0;

  // Conta dias únicos treinados por semana
  const weekDays = new Map<string, Set<string>>();
  sessionDates.forEach((dateStr) => {
    const d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return;
    const wk = weekKey(d);
    if (!weekDays.has(wk)) weekDays.set(wk, new Set());
    weekDays.get(wk)!.add(dateStr);
  });

  // Itera semanas a partir da atual para trás
  let streak = 0;
  const cursor = getMonday(new Date());

  while (true) {
    const wk = weekKey(cursor);
    const count = weekDays.get(wk)?.size || 0;

    if (count >= weeklyGoal) {
      streak += 1;
    } else {
      // Semana atual ainda em curso e sem meta batida não quebra o streak:
      // só não conta. Quebra a partir de qualquer semana passada incompleta.
      const isCurrent = wk === weekKey(new Date());
      if (!isCurrent) break;
    }
    cursor.setDate(cursor.getDate() - 7);
    if (streak > 520) break; // safety: ~10 anos
  }

  return streak;
}
