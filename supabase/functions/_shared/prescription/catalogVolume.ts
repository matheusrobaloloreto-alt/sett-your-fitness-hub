import { muscleLabel } from "../exerciseTaxonomy.ts";
import { exerciseGroupFactors, targetVolumeFactor } from "./volumeRules.ts";

type Target = {
  muscle_group: string;
  role?: string | null;
  is_primary?: boolean | null;
  volume_percentage?: number | null;
};

/** Canonical targets for loaders and Bnito context; category rows are discarded. */
export function canonicalCatalogTargets(targets: Target[]) {
  const byGroup = new Map<string, { muscle_group: string; role: "primary" | "secondary"; volume_percentage: number }>();
  for (const target of targets) {
    const label = muscleLabel(target.muscle_group);
    if (!label) continue;
    if (!target.role && typeof target.is_primary !== "boolean") continue;
    const factor = targetVolumeFactor(target);
    const previous = byGroup.get(label);
    if (!previous || factor * 100 > previous.volume_percentage) {
      byGroup.set(label, { muscle_group: label, role: factor === 1 ? "primary" : "secondary", volume_percentage: factor * 100 });
    }
  }
  return [...byGroup.values()];
}

/** A submitted plan cannot override anatomy or target roles from the library. */
export function buildCatalogVolumeSummary(plan: unknown, catalog: Array<{
  id: string;
  muscle_group?: string | null;
  targets?: Target[];
}>) {
  const result = new Map<string, number>();
  if (!plan || typeof plan !== "object" || !Array.isArray((plan as { workouts?: unknown }).workouts)) return result;
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  for (const workout of (plan as { workouts: Array<{ exercises?: unknown }> }).workouts) {
    if (!workout || !Array.isArray(workout.exercises)) continue;
    for (const exercise of workout.exercises) {
      if (!exercise || typeof exercise !== "object") continue;
      const sets = Number(exercise.sets);
      const entry = byId.get(String(exercise.exercise_id || ""));
      if (!entry || !Number.isFinite(sets) || sets <= 0) continue;
      for (const [slug, factor] of exerciseGroupFactors(entry)) {
        const label = muscleLabel(slug);
        if (label) result.set(label, (result.get(label) || 0) + sets * factor);
      }
    }
  }
  return result;
}
