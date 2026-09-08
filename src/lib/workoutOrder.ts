import { isGroupingMethod } from "@/lib/workoutMethods";

export interface WorkoutOrderExercise {
  group_id?: string | null;
  method?: string | null;
  exercise_order?: number | null;
}

export interface WorkoutOrderUnit<T extends WorkoutOrderExercise = WorkoutOrderExercise> {
  id: string;
  type: "exercise" | "group";
  method: string | null;
  groupId: string | null;
  startIndex: number;
  endIndex: number;
  items: T[];
}

export function buildWorkoutOrderUnits<T extends WorkoutOrderExercise>(exercises: T[] = []): WorkoutOrderUnit<T>[] {
  const units: WorkoutOrderUnit<T>[] = [];
  exercises.forEach((exercise, index) => {
    const groupId = exercise.group_id || null;
    const method = exercise.method || null;
    const isGroup = Boolean(groupId && isGroupingMethod(method));
    const previous = units[units.length - 1];
    if (
      isGroup &&
      previous?.type === "group" &&
      previous.groupId === groupId &&
      previous.method === method
    ) {
      previous.items.push(exercise);
      previous.endIndex = index;
      return;
    }

    units.push({
      id: isGroup ? `group:${method}:${groupId}:${index}` : `exercise:${index}`,
      type: isGroup ? "group" : "exercise",
      method: isGroup ? method : null,
      groupId: isGroup ? groupId : null,
      startIndex: index,
      endIndex: index,
      items: [exercise],
    });
  });
  return units;
}

export function renumberWorkoutExercises<T extends WorkoutOrderExercise>(exercises: T[] = []): T[] {
  return exercises.map((exercise, index) => ({ ...exercise, exercise_order: index + 1 }));
}

export function flattenWorkoutOrderUnits<T extends WorkoutOrderExercise>(units: WorkoutOrderUnit<T>[]): T[] {
  return renumberWorkoutExercises(units.flatMap((unit) => unit.items));
}

export function moveWorkoutOrderUnit<T extends WorkoutOrderExercise>(
  exercises: T[] = [],
  fromUnitIndex: number,
  toUnitIndex: number,
): T[] {
  const units = buildWorkoutOrderUnits(exercises);
  if (fromUnitIndex < 0 || fromUnitIndex >= units.length) return renumberWorkoutExercises(exercises);

  const target = Math.max(0, Math.min(toUnitIndex, units.length));
  if (target === fromUnitIndex || target === fromUnitIndex + 1) return renumberWorkoutExercises(exercises);

  const next = [...units];
  const [moved] = next.splice(fromUnitIndex, 1);
  const adjustedTarget = target > fromUnitIndex ? target - 1 : target;
  next.splice(adjustedTarget, 0, moved);
  return flattenWorkoutOrderUnits(next);
}

export function findWorkoutOrderUnitIndexByExerciseIndex<T extends WorkoutOrderExercise>(
  exercises: T[] = [],
  exerciseIndex: number,
): number {
  return buildWorkoutOrderUnits(exercises).findIndex((unit) => (
    exerciseIndex >= unit.startIndex && exerciseIndex <= unit.endIndex
  ));
}

export function moveWorkoutOrderUnitByExerciseIndex<T extends WorkoutOrderExercise>(
  exercises: T[] = [],
  exerciseIndex: number,
  direction: "up" | "down",
): T[] {
  const units = buildWorkoutOrderUnits(exercises);
  const fromUnitIndex = units.findIndex((unit) => exerciseIndex >= unit.startIndex && exerciseIndex <= unit.endIndex);
  if (fromUnitIndex < 0) return renumberWorkoutExercises(exercises);
  const toUnitIndex = direction === "up" ? fromUnitIndex - 1 : fromUnitIndex + 2;
  return moveWorkoutOrderUnit(exercises, fromUnitIndex, toUnitIndex);
}
