export function resolveWorkoutTarget(workouts: ReadonlyArray<{ clientKey?: string }>, activeKey: string) {
  const index = workouts.findIndex(w => w.clientKey === activeKey);
  return index < 0 ? null : { key: activeKey, index };
}
export function withWorkoutKeys<T extends { id?: string; clientKey?: string }>(workouts: T[]): Array<T & { clientKey: string }> {
  return workouts.map(w => ({ ...w, clientKey: w.clientKey || w.id || crypto.randomUUID() }));
}
export function withoutWorkoutKeys<T extends { clientKey?: string }>(workouts: T[]) {
  return workouts.map(({ clientKey: _key, ...workout }) => workout);
}
