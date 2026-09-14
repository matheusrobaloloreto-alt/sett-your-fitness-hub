export type WorkoutSaveIssueSeverity = "info" | "warning" | "blocker";

export interface WorkoutSaveDraftExercise {
  exercise_id?: string | null;
  exercise_name?: string | null;
  muscle_group?: string | null;
  video_url?: string | null;
  video_path?: string | null;
  thumbnail_url?: string | null;
  youtube_video_id?: string | null;
}

export interface WorkoutSaveDraftWorkout {
  id?: string;
  updated_at?: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  day_of_week?: number | null;
  exercises?: WorkoutSaveDraftExercise[];
}

export interface WorkoutSaveLibraryExercise {
  id: string;
  name: string;
  muscle_group?: string | null;
  video_url?: string | null;
  video_path?: string | null;
  thumbnail_url?: string | null;
  youtube_video_id?: string | null;
}

export interface WorkoutSaveIssue {
  severity: WorkoutSaveIssueSeverity;
  code: string;
  source: string;
  message: string;
  recommendation?: string;
  workoutIndex?: number;
  exerciseIndex?: number;
  workoutTitle?: string;
  exerciseName?: string;
}

export interface WorkoutSaveRepair {
  code: "legacy_exercise_relinked";
  workoutIndex: number;
  exerciseIndex: number;
  exerciseName: string;
  fromExerciseId: string | null;
  toExerciseId: string;
  message: string;
}

export interface ValidationWarningLike {
  severity?: WorkoutSaveIssueSeverity;
  code?: string;
  message?: string;
  recommendation?: string;
  source?: string;
}

export interface PrescriptionValidationLike {
  status?: string;
  blockers?: ValidationWarningLike[];
  warnings?: ValidationWarningLike[];
  library?: {
    missing?: string[];
    invalid?: string[];
  };
}

export function normalizeWorkoutSaveText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function displayWorkoutTitle(workout: WorkoutSaveDraftWorkout, index: number) {
  return String(workout.title || workout.name || `Treino ${index + 1}`).trim();
}

function exerciseDisplayName(exercise: WorkoutSaveDraftExercise, index: number) {
  return String(exercise.exercise_name || `Exercício ${index + 1}`).trim();
}

function selectExactLibraryMatch(
  exercise: WorkoutSaveDraftExercise,
  candidatesByName: Map<string, WorkoutSaveLibraryExercise[]>,
) {
  const nameKey = normalizeWorkoutSaveText(exercise.exercise_name);
  if (!nameKey) return { match: null, ambiguous: false };

  const candidates = candidatesByName.get(nameKey) || [];
  if (candidates.length === 0) return { match: null, ambiguous: false };
  if (candidates.length === 1) return { match: candidates[0], ambiguous: false };

  const groupKey = normalizeWorkoutSaveText(exercise.muscle_group);
  const sameGroup = groupKey
    ? candidates.filter((candidate) => normalizeWorkoutSaveText(candidate.muscle_group) === groupKey)
    : [];
  if (sameGroup.length === 1) return { match: sameGroup[0], ambiguous: false };
  return { match: null, ambiguous: true };
}

export function resolveWorkoutSaveDraft<TWorkout extends WorkoutSaveDraftWorkout>(args: {
  workouts: TWorkout[];
  libraryExercises: WorkoutSaveLibraryExercise[];
}) {
  const issues: WorkoutSaveIssue[] = [];
  const repairs: WorkoutSaveRepair[] = [];
  const libraryById = new Map(args.libraryExercises.map((exercise) => [exercise.id, exercise]));
  const candidatesByName = args.libraryExercises.reduce<Map<string, WorkoutSaveLibraryExercise[]>>((acc, exercise) => {
    const key = normalizeWorkoutSaveText(exercise.name);
    if (!key) return acc;
    acc.set(key, [...(acc.get(key) || []), exercise]);
    return acc;
  }, new Map());

  const workouts = args.workouts.map((workout, workoutIndex): TWorkout => {
    const clonedWorkout: WorkoutSaveDraftWorkout = {
      ...workout,
      exercises: Array.isArray(workout.exercises)
        ? workout.exercises.map((exercise) => ({ ...exercise }))
        : [],
    };
    const workoutTitle = displayWorkoutTitle(clonedWorkout, workoutIndex);
    const exercises = clonedWorkout.exercises || [];

    if (exercises.length === 0) {
      issues.push({
        severity: "blocker",
        code: "empty_workout",
        source: "metodologia_bn",
        message: `${workoutTitle} não possui exercícios.`,
        recommendation: "Inclua exercícios da biblioteca ou remova este treino antes de salvar.",
        workoutIndex,
        workoutTitle,
      });
      return clonedWorkout as TWorkout;
    }

    clonedWorkout.exercises = exercises.map((exercise, exerciseIndex) => {
      const exerciseId = typeof exercise.exercise_id === "string" ? exercise.exercise_id.trim() : "";
      if (exerciseId && (args.libraryExercises.length === 0 || libraryById.has(exerciseId))) return exercise;

      const { match, ambiguous } = selectExactLibraryMatch(exercise, candidatesByName);
      if (match) {
        repairs.push({
          code: "legacy_exercise_relinked",
          workoutIndex,
          exerciseIndex,
          exerciseName: exerciseDisplayName(exercise, exerciseIndex),
          fromExerciseId: exerciseId || null,
          toExerciseId: match.id,
          message: `${exerciseDisplayName(exercise, exerciseIndex)} foi religado ao exercício atual da biblioteca.`,
        });
        return {
          ...exercise,
          exercise_id: match.id,
          exercise_name: exercise.exercise_name || match.name,
          muscle_group: match.muscle_group ?? exercise.muscle_group ?? null,
          video_url: exercise.video_url ?? match.video_url ?? null,
          video_path: exercise.video_path ?? match.video_path ?? null,
          thumbnail_url: exercise.thumbnail_url ?? match.thumbnail_url ?? null,
          youtube_video_id: exercise.youtube_video_id ?? match.youtube_video_id ?? null,
        };
      }

      const exerciseName = exerciseDisplayName(exercise, exerciseIndex);
      issues.push({
        severity: "blocker",
        code: exerciseId ? (ambiguous ? "ambiguous_exercise_match" : "exercise_not_visible") : "missing_exercise_id",
        source: "biblioteca",
        message: exerciseId
          ? `${workoutTitle}: ${exerciseName} não está vinculado a um exercício válido da biblioteca.`
          : `${workoutTitle}: ${exerciseName} não está vinculado a um exercício da biblioteca.`,
        recommendation: ambiguous
          ? "Há mais de um exercício com esse nome. Use a biblioteca para trocar pelo item correto."
          : "Substitua pelo exercício correspondente da biblioteca antes de salvar.",
        workoutIndex,
        exerciseIndex,
        workoutTitle,
        exerciseName,
      });
      return exercise;
    });

    return clonedWorkout as TWorkout;
  });

  if (workouts.length === 0) {
    issues.push({
      severity: "blocker",
      code: "empty_training_plan",
      source: "metodologia_bn",
      message: "O plano não contém nenhum treino.",
      recommendation: "Crie ao menos um treino com exercícios válidos da biblioteca.",
    });
  }

  return { workouts, issues, repairs };
}

export function issuesFromPrescriptionValidation(result: PrescriptionValidationLike | null | undefined): WorkoutSaveIssue[] {
  if (!result) return [];
  const blockers = Array.isArray(result.blockers) ? result.blockers : [];
  const issues = blockers.flatMap((warning) => {
    if (warning.code === "library_contract_failed" && result.library) {
      const missing = (result.library.missing || []).map((path) => {
        const match = path.match(/workouts\[(\d+)\]\.exercises\[(\d+)\]/);
        return {
          severity: "blocker" as const,
          code: "missing_exercise_id",
          source: warning.source || "biblioteca",
          message: "Um exercício não está vinculado a um exercício da biblioteca.",
          recommendation: warning.recommendation || "Troque pelo item correspondente da biblioteca antes de salvar.",
          workoutIndex: match ? Number(match[1]) : undefined,
          exerciseIndex: match ? Number(match[2]) : undefined,
        };
      });
      const invalid = (result.library.invalid || []).map((path) => {
        const match = path.match(/workouts\[(\d+)\]\.exercises\[(\d+)\]/);
        return {
          severity: "blocker" as const,
          code: "exercise_not_visible",
          source: warning.source || "biblioteca",
          message: "Um exercício não está visível na biblioteca desta empresa.",
          recommendation: warning.recommendation || "Substitua por um exercício permitido da biblioteca antes de salvar.",
          workoutIndex: match ? Number(match[1]) : undefined,
          exerciseIndex: match ? Number(match[2]) : undefined,
        };
      });
      if (missing.length || invalid.length) return [...missing, ...invalid];
    }
    return [{
      severity: "blocker" as const,
      code: warning.code || "remote_validation_blocker",
      source: warning.source || "validador",
      message: warning.message || "O validador marcou este treino como crítico.",
      recommendation: warning.recommendation || "Revise o ponto crítico antes de salvar.",
    }];
  });

  if (result.status === "blocked" && issues.length === 0) {
    issues.push({
      severity: "blocker",
      code: "remote_validation_blocked_without_details",
      source: "validador",
      message: "O validador bloqueou o treino sem devolver a lista de itens críticos.",
      recommendation: "Reexecute a auditoria; se repetir, acione o suporte técnico antes de publicar.",
    });
  }

  return issues;
}

export function hasBlockingSaveIssue(issues: WorkoutSaveIssue[]) {
  return issues.some((issue) => issue.severity === "blocker");
}

export function issueFromPrescriptionValidationFailure(_message?: string): WorkoutSaveIssue {
  return {
    severity: "blocker",
    code: "remote_validation_unavailable",
    source: "validador",
    message: "Não foi possível validar o treino agora.",
    recommendation: "Tente salvar novamente. Se continuar, confira a conexão e acione o suporte.",
  };
}

export function mergeSavedWorkoutIdsAfterSave<TWorkout extends { id?: string | null }>(args: {
  currentWorkouts: TWorkout[];
  savedDraftWorkouts: TWorkout[];
  savedWorkoutIds: Array<string | null | undefined>;
}) {
  const savedIdByPreviousId = new Map<string, string>();
  args.savedDraftWorkouts.forEach((workout, index) => {
    const previousId = typeof workout.id === "string" ? workout.id : "";
    const savedId = args.savedWorkoutIds[index];
    if (previousId && savedId) savedIdByPreviousId.set(previousId, savedId);
  });

  const canUseIndexFallback = args.currentWorkouts.length === args.savedDraftWorkouts.length;
  return args.currentWorkouts.map((workout, index) => {
    const previousId = typeof workout.id === "string" ? workout.id : "";
    const savedId = (previousId ? savedIdByPreviousId.get(previousId) : undefined)
      || (canUseIndexFallback ? args.savedWorkoutIds[index] : undefined);
    return savedId ? { ...workout, id: savedId } : workout;
  });
}
