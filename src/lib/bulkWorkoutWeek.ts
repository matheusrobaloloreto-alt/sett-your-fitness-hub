import { ensureWeeklyPrescription, individualWeeklyUiVersionForExercise, weeklySetTypesForSets, type WeeklyAwareExercise } from '@/lib/weeklyStrengthPeriodization';

export type BulkWeekPatch = { sets?: number; reps?: string; rest_seconds?: number };

export function editWorkoutWeek<T extends WeeklyAwareExercise>(exercises: T[], week: number, patch: BulkWeekPatch): T[] {
  if (!Number.isInteger(week) || week < 1 || week > 6
    || (patch.sets !== undefined && (!Number.isInteger(patch.sets) || patch.sets < 1))
    || (patch.rest_seconds !== undefined && (!Number.isInteger(patch.rest_seconds) || patch.rest_seconds < 0))
    || (patch.reps !== undefined && !patch.reps.trim())) throw new Error('Valores inválidos para edição em massa.');
  if (!Object.keys(patch).length) return exercises;
  return exercises.map(exercise => {
    const version = individualWeeklyUiVersionForExercise(exercise, 'weekly');
    if (!version) throw new Error('Este treino precisa de edição individual: não possui semanas independentes.');
    const stored = exercise.weekly_prescription || [];
    const weekly = ensureWeeklyPrescription(exercise, version).map(block => {
      const original = stored.find(item => Number(item.week) === block.week);
      if (block.week !== week) return original || block;
      return { ...(original || block), ...patch,
        ...(patch.sets !== undefined ? { set_types: weeklySetTypesForSets((original || block).set_types, patch.sets) } : {}) };
    });
    return { ...exercise, weekly_prescription: weekly };
  });
}
