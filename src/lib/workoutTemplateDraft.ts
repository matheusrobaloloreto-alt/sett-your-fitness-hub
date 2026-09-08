import { sanitizeWorkoutSetTypes } from "@/lib/setTypes";

export interface WorkoutTemplateDraftExercise {
  exercise_id?: string | null;
  exercise_name?: string | null;
  muscle_group?: string | null;
  video_url?: string | null;
  video_path?: string | null;
  youtube_video_id?: string | null;
  thumbnail_url?: string | null;
  group_id?: string | null;
  method?: string | null;
  method_seconds?: number | null;
  set_types?: string[];
  weekly_prescription?: unknown;
  sets?: string | number | null;
  reps?: string | number | null;
  rest?: string | number | null;
  rest_seconds?: number | null;
  notes?: string | null;
  exercise_order?: number | null;
  [key: string]: unknown;
}

export interface WorkoutTemplateDraftWorkout {
  id?: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  day_of_week?: number | null;
  sort_order?: number | null;
  exercises?: WorkoutTemplateDraftExercise[];
  [key: string]: unknown;
}

export interface WorkoutTemplateForDraft {
  id: string;
  name: string;
  company_id?: string | null;
  workouts?: unknown;
}

export type WorkoutTemplateDraftMode = "replace" | "append";

export type WorkoutTemplateDraftValidationCode =
  | "cross_tenant_template"
  | "empty_template"
  | "malformed_workout"
  | "empty_workout"
  | "missing_exercise_id"
  | "exercise_not_visible";

export interface WorkoutTemplateDraftValidationIssue {
  code: WorkoutTemplateDraftValidationCode;
  message: string;
  workoutIndex?: number;
  exerciseIndex?: number;
  exerciseId?: string | null;
}

export interface WorkoutTemplateDraftResult {
  ok: boolean;
  workouts: WorkoutTemplateDraftWorkout[];
  issues: WorkoutTemplateDraftValidationIssue[];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function hasEditableWorkoutContent(workouts: WorkoutTemplateDraftWorkout[] = []): boolean {
  return workouts.some((workout) => (
    Boolean(String(workout.title || workout.name || "").trim())
    || Boolean(String(workout.description || "").trim())
    || (Array.isArray(workout.exercises) && workout.exercises.length > 0)
  ));
}

export function validateWorkoutTemplateForDraft(args: {
  template: WorkoutTemplateForDraft;
  currentCompanyId: string | null | undefined;
  visibleExerciseIds: ReadonlySet<string>;
}): WorkoutTemplateDraftValidationIssue[] {
  const { template, currentCompanyId, visibleExerciseIds } = args;
  const issues: WorkoutTemplateDraftValidationIssue[] = [];

  if (template.company_id && currentCompanyId && template.company_id !== currentCompanyId) {
    issues.push({
      code: "cross_tenant_template",
      message: "Este treino pertence a outra empresa.",
    });
  }

  const rawWorkouts = Array.isArray(template.workouts) ? template.workouts : [];
  if (rawWorkouts.length === 0) {
    issues.push({
      code: "empty_template",
      message: "Este treino da biblioteca não possui sessões.",
    });
    return issues;
  }

  rawWorkouts.forEach((rawWorkout, workoutIndex) => {
    if (!rawWorkout || typeof rawWorkout !== "object" || !Array.isArray((rawWorkout as WorkoutTemplateDraftWorkout).exercises)) {
      issues.push({
        code: "malformed_workout",
        message: "Uma sessão do template está malformada.",
        workoutIndex,
      });
      return;
    }

    const exercises = (rawWorkout as WorkoutTemplateDraftWorkout).exercises || [];
    if (exercises.length === 0) {
      issues.push({
        code: "empty_workout",
        message: "Uma sessão do template não possui exercícios.",
        workoutIndex,
      });
    }

    exercises.forEach((exercise, exerciseIndex) => {
      const exerciseId = typeof exercise.exercise_id === "string" ? exercise.exercise_id : null;
      if (!exerciseId) {
        issues.push({
          code: "missing_exercise_id",
          message: "Um exercício do template não possui exercise_id.",
          workoutIndex,
          exerciseIndex,
          exerciseId,
        });
        return;
      }
      if (!visibleExerciseIds.has(exerciseId)) {
        issues.push({
          code: "exercise_not_visible",
          message: "Um exercício do template não está visível na biblioteca desta empresa.",
          workoutIndex,
          exerciseIndex,
          exerciseId,
        });
      }
    });
  });

  return issues;
}

export function buildWorkoutTemplateDraft(args: {
  template: WorkoutTemplateForDraft;
  existingWorkouts: WorkoutTemplateDraftWorkout[];
  mode: WorkoutTemplateDraftMode;
  currentCompanyId: string | null | undefined;
  visibleExerciseIds: ReadonlySet<string>;
}): WorkoutTemplateDraftResult {
  const issues = validateWorkoutTemplateForDraft({
    template: args.template,
    currentCompanyId: args.currentCompanyId,
    visibleExerciseIds: args.visibleExerciseIds,
  });
  if (issues.length > 0) {
    return { ok: false, workouts: cloneJson(args.existingWorkouts), issues };
  }

  const templateWorkouts = sanitizeWorkoutSetTypes(
    cloneJson(args.template.workouts as WorkoutTemplateDraftWorkout[]),
  ).map((workout, index) => ({
    ...workout,
    id: undefined,
    updated_at: undefined,
    title: workout.title || workout.name || `Treino ${index + 1}`,
    description: workout.description || "",
    day_of_week: workout.day_of_week ?? index + 1,
    exercises: (workout.exercises || []).map((exercise, exerciseIndex) => ({
      ...exercise,
      exercise_order: exercise.exercise_order ?? exerciseIndex + 1,
      group_id: exercise.group_id ?? null,
      method: exercise.method ?? null,
      method_seconds: exercise.method_seconds ?? null,
      video_url: exercise.video_url ?? null,
      video_path: exercise.video_path ?? null,
      youtube_video_id: exercise.youtube_video_id ?? null,
      thumbnail_url: exercise.thumbnail_url ?? null,
      notes: exercise.notes ?? "",
    })),
  }));

  const currentWorkouts = cloneJson(args.existingWorkouts || []);
  return {
    ok: true,
    workouts: args.mode === "replace" ? templateWorkouts : [...currentWorkouts, ...templateWorkouts],
    issues: [],
  };
}
