export type SetType = 'warmup' | 'normal' | 'failure';

export const SET_TYPE_CONFIG: Record<SetType, { label: string; color: string; bgColor: string; name: string }> = {
  warmup:  { label: 'W', color: 'text-yellow-400', bgColor: 'bg-yellow-400/20', name: 'Série de Aquecimento' },
  normal:  { label: 'N', color: 'text-foreground', bgColor: 'bg-muted', name: 'Série Normal' },
  failure: { label: 'F', color: 'text-red-400', bgColor: 'bg-red-400/20', name: 'Série até a Falha' },
};

export const SET_TYPES: SetType[] = ['warmup', 'normal', 'failure'];

export function normalizeSetType(value: unknown): SetType {
  const normalized = String(value || '').toLowerCase();
  return SET_TYPES.includes(normalized as SetType) ? normalized as SetType : 'normal';
}

export function sanitizeSetTypes(value: unknown): SetType[] | undefined {
  return Array.isArray(value) ? value.map(normalizeSetType) : undefined;
}

export function sanitizeExerciseSetTypes<T>(exercise: T): T {
  if (!exercise || typeof exercise !== 'object' || Array.isArray(exercise)) return exercise;
  const normalized: Record<string, unknown> = { ...(exercise as Record<string, unknown>) };
  const setTypes = sanitizeSetTypes(normalized.set_types);
  if (setTypes) normalized.set_types = setTypes;
  else delete normalized.set_types;
  if (Array.isArray(normalized.weekly_prescription)) {
    normalized.weekly_prescription = normalized.weekly_prescription.map((week) => {
      if (!week || typeof week !== 'object' || Array.isArray(week)) return week;
      const next = { ...(week as Record<string, unknown>) };
      const weeklyTypes = sanitizeSetTypes(next.set_types);
      if (weeklyTypes) next.set_types = weeklyTypes;
      else delete next.set_types;
      return next;
    });
  }
  return normalized as T;
}

export function sanitizeWorkoutSetTypes<T>(workouts: T[]): T[] {
  return workouts.map((workout) => {
    if (!workout || typeof workout !== 'object' || Array.isArray(workout)) return workout;
    const normalized: Record<string, unknown> = { ...(workout as Record<string, unknown>) };
    if (Array.isArray(normalized.exercises)) {
      normalized.exercises = normalized.exercises.map(sanitizeExerciseSetTypes);
    }
    return normalized as T;
  });
}

export function getSetLabel(type: SetType, normalIndex: number): string {
  if (type === 'normal') return String(normalIndex);
  return SET_TYPE_CONFIG[type].label;
}
