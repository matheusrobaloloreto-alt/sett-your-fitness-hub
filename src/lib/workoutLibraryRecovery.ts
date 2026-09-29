import type { supabase } from "@/integrations/supabase/client";
import { fetchLibraryExercises } from "@/lib/workoutLibraryExport";
import { normalizeWorkoutSaveText, resolveWorkoutSaveDraft } from "@/lib/workoutSaveValidation";
import type { WorkoutTemplateDraftWorkout } from "@/lib/workoutTemplateDraft";

type RecoveryClient = Pick<typeof supabase, "from"> & {
  auth: { getSession(): PromiseLike<{ data: { session: { user: { id: string } } | null }; error: unknown }> };
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};
const categories = new Set(["core", "mobilidades", "funcionais", "base", "pesos_livre", "peso_corporal", "maquinas", "pliometria"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export class WorkoutLibraryRecoveryError extends Error {
  constructor(readonly code: "stale" | "invalid" | "ambiguous" | "forbidden" | "unconfirmed" | "transport", message: string) {
    super(message);
    this.name = "WorkoutLibraryRecoveryError";
  }
}

function registrationMetadata(exercise: Record<string, unknown>) {
  const name = exercise.exercise_name ?? exercise.library_exercise_name;
  if (typeof name !== "string" || !normalizeWorkoutSaveText(name) || name.length > 240) {
    throw new WorkoutLibraryRecoveryError("invalid", "Um exercício sem cadastro precisa de um nome válido para ser salvo.");
  }
  const metadata: { name: string; muscle_group?: string | null; equipment?: string | null; category?: string | null; categories?: string[] | null } = { name: name.trim() };
  for (const field of ["muscle_group", "equipment", "category"] as const) {
    const value = exercise[field];
    if (value === undefined) continue;
    if (typeof value === "string") {
      if (value.length > 240) throw new WorkoutLibraryRecoveryError("invalid", "O exercício contém metadados inválidos.");
      if (field === "category" && value && !categories.has(value)) throw new WorkoutLibraryRecoveryError("invalid", "O exercício contém uma categoria inválida.");
      metadata[field] = value;
    } else if (value === null) metadata[field] = null;
    else throw new WorkoutLibraryRecoveryError("invalid", "O exercício contém metadados inválidos. Revise o rascunho antes de salvar.");
  }
  if (exercise.categories !== undefined) {
    const value = exercise.categories;
    if (value === null) metadata.categories = null;
    else if (Array.isArray(value) && value.length <= 8 && value.every((item): item is string => typeof item === "string" && categories.has(item))) metadata.categories = [...value];
    else throw new WorkoutLibraryRecoveryError("invalid", "O exercício contém categorias inválidas.");
  }
  return metadata;
}

/** Catalog registration only. Callers still validate and positively acknowledge the actual plan save. */
export async function ensureWorkoutLibraryReferences<TWorkout extends WorkoutTemplateDraftWorkout>(
  client: RecoveryClient,
  args: { workouts: TWorkout[]; companyId: string; expectedUserId?: string; isCurrent?: () => boolean },
) {
  const assertCurrent = () => {
    if (args.isCurrent && !args.isCurrent()) throw new WorkoutLibraryRecoveryError("stale", "O rascunho ou a empresa mudou. Abra o treino atual para salvar.");
  };
  assertCurrent();
  const companyId = args.companyId;
  if (!uuid.test(companyId) || !Array.isArray(args.workouts) || !args.workouts.length) {
    throw new WorkoutLibraryRecoveryError("invalid", "Selecione uma empresa e um plano válido para salvar.");
  }
  const snapshot: TWorkout[] = JSON.parse(JSON.stringify(args.workouts));
  for (const workout of snapshot) {
    if (!record(workout) || !Array.isArray(workout.exercises) || !workout.exercises.length) {
      throw new WorkoutLibraryRecoveryError("invalid", "O plano contém um treino inválido ou sem exercícios.");
    }
    for (const exercise of workout.exercises) {
      if (!record(exercise) || (exercise.exercise_id != null && typeof exercise.exercise_id !== "string")
        || (exercise.exercise_name != null && typeof exercise.exercise_name !== "string")
        || (exercise.library_exercise_name != null && typeof exercise.library_exercise_name !== "string")) {
        throw new WorkoutLibraryRecoveryError("invalid", "O plano contém um exercício inválido.");
      }
      if (typeof exercise.exercise_id === "string") exercise.exercise_id = exercise.exercise_id.trim();
      if (exercise.exercise_name == null && typeof exercise.library_exercise_name === "string") exercise.exercise_name = exercise.library_exercise_name;
    }
  }
  const session = await client.auth.getSession();
  assertCurrent();
  const actorId = session.data.session?.user.id;
  if (session.error || !actorId || (args.expectedUserId && args.expectedUserId !== actorId)) throw new WorkoutLibraryRecoveryError("forbidden", "Sua sessão mudou ou expirou. Entre novamente antes de salvar.");
  let libraryExercises = await fetchLibraryExercises(client, companyId);
  assertCurrent();
  let resolvedDraft = resolveWorkoutSaveDraft({ workouts: snapshot, libraryExercises });
  const originalRepairs = [...resolvedDraft.repairs];
  const missing = resolvedDraft.issues;
  if (missing.some((issue) => !["missing_exercise_id", "exercise_not_visible"].includes(issue.code))) {
    throw new WorkoutLibraryRecoveryError("ambiguous", "Há referências ambíguas no treino. Escolha o exercício correto na biblioteca.");
  }
  if (!missing.length) {
    const finalSession = await client.auth.getSession();
    assertCurrent();
    if (finalSession.error || finalSession.data.session?.user.id !== actorId) throw new WorkoutLibraryRecoveryError("forbidden", "A sessão mudou. Abra o treino atual antes de salvar.");
    return { ...resolvedDraft, resolvedDraft, libraryExercises, createdCount: 0 };
  }
  if (missing.length > 500) throw new WorkoutLibraryRecoveryError("invalid", "Há exercícios demais para cadastrar em um único salvamento.");
  const pending = missing.map((issue) => {
    const exercise = resolvedDraft.workouts[issue.workoutIndex!].exercises![issue.exerciseIndex!];
    if (!record(exercise)) throw new WorkoutLibraryRecoveryError("invalid", "O plano contém um exercício inválido.");
    return { exercise, issue, previousId: exercise.exercise_id, metadata: registrationMetadata(exercise) };
  });
  const currentSession = await client.auth.getSession();
  assertCurrent();
  if (currentSession.error || currentSession.data.session?.user.id !== actorId) {
    throw new WorkoutLibraryRecoveryError("forbidden", "A sessão mudou. Abra o treino atual antes de salvar.");
  }
  const { data, error } = await client.rpc("ensure_workout_library_references", {
    p_company_id: companyId, p_exercises: pending.map((item) => item.metadata),
  }).then((result) => result, () => {
    throw new WorkoutLibraryRecoveryError("transport", "Não foi possível confirmar o cadastro dos exercícios. O plano ainda não foi salvo.");
  });
  assertCurrent();
  if (error) {
    if (error.message?.includes("workout_library_recovery_ambiguous")) throw new WorkoutLibraryRecoveryError("ambiguous", "Há referências ambíguas no treino. Escolha o exercício correto na biblioteca.");
    if (error.code === "42501") throw new WorkoutLibraryRecoveryError("forbidden", "Seu acesso não permite cadastrar exercícios nesta empresa.");
    throw new WorkoutLibraryRecoveryError("transport", "Não foi possível confirmar o cadastro dos exercícios. O plano ainda não foi salvo.");
  }
  if (!record(data) || data.ok !== true || data.company_id !== companyId || data.actor_id !== actorId
    || typeof data.created_count !== "number" || !Number.isInteger(data.created_count) || data.created_count < 0 || data.created_count > pending.length
    || !Array.isArray(data.mappings) || data.mappings.length !== pending.length) {
    throw new WorkoutLibraryRecoveryError("unconfirmed", "O banco não confirmou todos os exercícios. O plano ainda não foi salvo.");
  }
  const mappings = new Map<number, string>();
  for (const mapping of data.mappings) {
    if (!record(mapping) || !Number.isInteger(mapping.input_index) || typeof mapping.input_index !== "number"
      || mapping.input_index < 0 || mapping.input_index >= pending.length || mappings.has(mapping.input_index)
      || typeof mapping.exercise_id !== "string" || !uuid.test(mapping.exercise_id)) {
      throw new WorkoutLibraryRecoveryError("unconfirmed", "O banco devolveu referências inválidas. O plano ainda não foi salvo.");
    }
    mappings.set(mapping.input_index, mapping.exercise_id);
  }
  libraryExercises = await fetchLibraryExercises(client, companyId);
  assertCurrent();
  for (const [index, exerciseId] of mappings) {
    const visible = libraryExercises.find((row) => row.id === exerciseId);
    if (!visible || normalizeWorkoutSaveText(visible.name) !== normalizeWorkoutSaveText(pending[index].metadata.name)) {
      throw new WorkoutLibraryRecoveryError("unconfirmed", "O cadastro não apareceu na biblioteca desta empresa. O plano ainda não foi salvo.");
    }
    pending[index].exercise.exercise_id = exerciseId;
  }
  const finalSession = await client.auth.getSession();
  assertCurrent();
  if (finalSession.error || finalSession.data.session?.user.id !== actorId) throw new WorkoutLibraryRecoveryError("forbidden", "A sessão mudou. Abra o treino atual antes de salvar.");
  resolvedDraft = resolveWorkoutSaveDraft({ workouts: resolvedDraft.workouts, libraryExercises });
  if (resolvedDraft.issues.length) throw new WorkoutLibraryRecoveryError("unconfirmed", "Ainda há referências sem confirmação. O plano não foi salvo.");
  resolvedDraft.repairs = [...originalRepairs, ...pending.map((item, index) => ({
    code: "legacy_exercise_relinked" as const,
    workoutIndex: item.issue.workoutIndex!, exerciseIndex: item.issue.exerciseIndex!,
    exerciseName: item.metadata.name,
    fromExerciseId: typeof item.previousId === "string" ? item.previousId || null : null,
    toExerciseId: mappings.get(index)!,
    message: `${item.metadata.name} foi vinculado ao cadastro da biblioteca desta empresa.`,
  })), ...resolvedDraft.repairs];
  return { ...resolvedDraft, resolvedDraft, libraryExercises, createdCount: data.created_count };
}
