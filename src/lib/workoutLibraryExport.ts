import type { supabase } from "@/integrations/supabase/client";
import { sanitizeWorkoutSetTypes } from "@/lib/setTypes";
import { resolveWorkoutSaveDraft } from "@/lib/workoutSaveValidation";
import { visibleWorkoutLibraryExercises, type ScopedWorkoutLibraryExercise, type WorkoutTemplateDraftWorkout } from "@/lib/workoutTemplateDraft";

function validateTextFields(value: object, fields: readonly string[]) {
  const invalid = Object.entries(value).find(([key, text]) => fields.includes(key) && text != null && typeof text !== "string");
  if (invalid) throw new Error(`O plano contém texto inválido no campo ${invalid[0]}. Revise o treino selecionado.`);
}

export function prepareWorkoutLibraryExport<TWorkout extends WorkoutTemplateDraftWorkout>(args: {
  workouts: TWorkout[];
  workoutIndex?: number;
  libraryExercises: ScopedWorkoutLibraryExercise[];
  companyId: string;
}) {
  if (!args.companyId) throw new Error("Selecione uma empresa para salvar na biblioteca.");
  if (args.workoutIndex !== undefined && (!Number.isInteger(args.workoutIndex)
    || args.workoutIndex < 0 || args.workoutIndex >= args.workouts.length)) {
    throw new Error("Selecione um treino válido.");
  }
  const selection = args.workoutIndex === undefined ? args.workouts : [args.workouts[args.workoutIndex]];
  if (selection.some((workout) => !workout || typeof workout !== "object" || Array.isArray(workout))) {
    throw new Error("O plano contém um treino inválido.");
  }
  // Keep historical/unknown prescription fields; only detach runtime row identity.
  const cloned = sanitizeWorkoutSetTypes<TWorkout>(JSON.parse(JSON.stringify(selection)));
  for (const workout of cloned) {
    validateTextFields(workout, ["title", "name", "description", "notes"]);
    delete workout.id;
    delete workout.updated_at;
    if (workout.title == null && typeof workout.name === "string") workout.title = workout.name;
    if (workout.description == null && "notes" in workout && typeof workout.notes === "string") {
      workout.description = workout.notes;
    }
    for (const exercise of Array.isArray(workout.exercises) ? workout.exercises : []) {
      if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) continue;
      validateTextFields(exercise, ["exercise_name", "library_exercise_name", "notes", "cues", "biomechanical_note"]);
      if (typeof exercise.exercise_id === "string") exercise.exercise_id = exercise.exercise_id.trim();
      if (exercise.exercise_name == null && "library_exercise_name" in exercise && typeof exercise.library_exercise_name === "string") {
        exercise.exercise_name = exercise.library_exercise_name;
      }
      if (exercise.rest == null && exercise.rest_seconds != null && String(exercise.rest_seconds) !== "") {
        exercise.rest = `${exercise.rest_seconds}s`;
      }
      const cues = "cues" in exercise && typeof exercise.cues === "string" ? exercise.cues.trim() : "";
      const biomechanicalNote = "biomechanical_note" in exercise && typeof exercise.biomechanical_note === "string" ? exercise.biomechanical_note : "";
      const instruction = cues || biomechanicalNote;
      if (instruction && !exercise.notes?.includes(instruction)) {
        exercise.notes = [exercise.notes, instruction].filter(Boolean).join("\n");
      }
    }
  }
  return resolveWorkoutSaveDraft({
    workouts: cloned,
    libraryExercises: visibleWorkoutLibraryExercises(args.libraryExercises, args.companyId),
  });
}

export async function fetchLibraryExercises(client: Pick<typeof supabase, "from">, companyId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(companyId)) throw new Error("Selecione uma empresa válida.");
  const exercises: ScopedWorkoutLibraryExercise[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from("exercise_library")
      .select("id, name, company_id, is_global, muscle_group, video_url, video_path, thumbnail_url, youtube_video_id")
      .or(`company_id.eq.${companyId},is_global.eq.true`)
      .order("id").range(from, from + pageSize - 1);
    if (error) throw new Error("Não foi possível carregar os exercícios da biblioteca.");
    exercises.push(...(data || []));
    if (!data || data.length < pageSize) return visibleWorkoutLibraryExercises(exercises, companyId);
  }
}
