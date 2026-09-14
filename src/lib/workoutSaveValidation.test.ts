import { describe, expect, it } from "vitest";
import {
  hasBlockingSaveIssue,
  issueFromPrescriptionValidationFailure,
  issuesFromPrescriptionValidation,
  mergeSavedWorkoutIdsAfterSave,
  resolveWorkoutSaveDraft,
} from "./workoutSaveValidation";

const library = [
  {
    id: "supino-atual",
    name: "Supino Inclinado com Halteres",
    muscle_group: "Peitoral",
    video_url: "https://video.example/supino",
    video_path: null,
  },
  {
    id: "remada-atual",
    name: "Remada Curvada",
    muscle_group: "Dorsal",
  },
];

type TestWorkout = {
  id?: string;
  title: string;
  exercises: Array<{ exercise_id?: string; exercise_name?: string }>;
};

describe("workout save validation", () => {
  it("repairs legacy exercises by exact library name before the remote validator runs", () => {
    const result = resolveWorkoutSaveDraft({
      libraryExercises: library,
      workouts: [
        {
          id: "workout-a",
          updated_at: "2026-09-14T03:00:00Z",
          title: "Treino A",
          exercises: [
            {
              exercise_id: "legacy-supino",
              exercise_name: "Supino Inclinado com Halteres",
              muscle_group: "Peitoral",
              sets: "4",
            },
          ],
        },
      ],
    });

    expect(result.issues).toEqual([]);
    expect(result.repairs).toContainEqual(expect.objectContaining({
      code: "legacy_exercise_relinked",
      fromExerciseId: "legacy-supino",
      toExerciseId: "supino-atual",
    }));
    expect(result.workouts[0].exercises?.[0]).toMatchObject({
      exercise_id: "supino-atual",
      exercise_name: "Supino Inclinado com Halteres",
      muscle_group: "Peitoral",
    });
  });

  it("allows a valid workout draft without creating blockers", () => {
    const result = resolveWorkoutSaveDraft({
      libraryExercises: library,
      workouts: [
        {
          title: "Treino B",
          exercises: [
            { exercise_id: "remada-atual", exercise_name: "Remada Curvada", muscle_group: "Dorsal", sets: "3" },
          ],
        },
      ],
    });

    expect(result.repairs).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(hasBlockingSaveIssue(result.issues)).toBe(false);
  });

  it("keeps non-critical validator warnings out of the save blockers", () => {
    const issues = issuesFromPrescriptionValidation({
      status: "warnings",
      blockers: [],
      warnings: [
        {
          severity: "warning",
          code: "high_volume_quadriceps",
          source: "volume",
          message: "Quadríceps: 25 séries/semana estimadas.",
        },
      ],
    });

    expect(issues).toEqual([]);
    expect(hasBlockingSaveIssue(issues)).toBe(false);
  });

  it("turns a remote validation failure into a persistent safe save blocker", () => {
    const rawProviderMessage = "postgres password=secret table=training_cycles payload={student_id:123}";
    const issue = issueFromPrescriptionValidationFailure(rawProviderMessage);

    expect(issue).toMatchObject({
      severity: "blocker",
      code: "remote_validation_unavailable",
      source: "validador",
      message: "Não foi possível validar o treino agora.",
      recommendation: "Tente salvar novamente. Se continuar, confira a conexão e acione o suporte.",
    });
    expect(JSON.stringify(issue)).not.toContain("password=secret");
    expect(JSON.stringify(issue)).not.toContain("training_cycles");
    expect(JSON.stringify(issue)).not.toContain("student_id");
    expect(hasBlockingSaveIssue([issue])).toBe(true);
  });

  it("maps remote library blockers back to the affected workout exercise", () => {
    const issues = issuesFromPrescriptionValidation({
      status: "blocked",
      blockers: [{
        severity: "blocker",
        code: "library_contract_failed",
        source: "biblioteca",
        message: "Ha exercicios sem exercise_id ou fora da biblioteca do app.",
      }],
      library: {
        missing: ["workouts[0].exercises[1]"],
        invalid: ["workouts[2].exercises[0]:legacy-id"],
      },
    });

    expect(issues).toEqual([
      expect.objectContaining({ code: "missing_exercise_id", workoutIndex: 0, exerciseIndex: 1 }),
      expect.objectContaining({ code: "exercise_not_visible", workoutIndex: 2, exerciseIndex: 0 }),
    ]);
  });

  it("blocks a true structural error and points to the affected exercise", () => {
    const result = resolveWorkoutSaveDraft({
      libraryExercises: library,
      workouts: [
        {
          title: "Treino A",
          exercises: [
            { exercise_name: "Exercício importado sem vínculo", muscle_group: "Peitoral", sets: "3" },
          ],
        },
      ],
    });

    expect(result.repairs).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: "blocker",
      code: "missing_exercise_id",
      source: "biblioteca",
      workoutIndex: 0,
      exerciseIndex: 0,
      exerciseName: "Exercício importado sem vínculo",
    }));
  });

  it("preserves the revision conflict blocker from the CAS save path", async () => {
    const { saveCycleWorkoutRevision } = await import("./workoutRevision");
    const db = {
      rpc: async () => ({
        data: null,
        error: { message: "workout_revision_changed" },
      }),
    };

    await expect(saveCycleWorkoutRevision(db, {
      cycleId: "cycle-1",
      expectedRows: [{ id: "workout-a", updated_at: "2026-09-14T03:00:00Z" }],
      workouts: [{ title: "Treino A", exercises: [{ exercise_id: "supino-atual" }] }],
    })).rejects.toThrow("alterado em outra tela");
  });

  it("applies saved ids without replacing edits made while the save request was pending", () => {
    const result = mergeSavedWorkoutIdsAfterSave<TestWorkout>({
      savedDraftWorkouts: [{
        id: "workout-a",
        title: "Treino A",
        exercises: [{ exercise_id: "supino-atual", exercise_name: "Supino Inclinado com Halteres" }],
      }],
      currentWorkouts: [{
        id: "workout-a",
        title: "Treino A editado durante o salvamento",
        exercises: [{ exercise_id: "supino-atual", exercise_name: "Supino Inclinado com Halteres" }],
      }],
      savedWorkoutIds: ["workout-a-saved"],
    });

    expect(result).toEqual([expect.objectContaining({
      id: "workout-a-saved",
      title: "Treino A editado durante o salvamento",
    })]);
  });

  it("does not assign returned ids by stale index after the workout list shape changed", () => {
    const result = mergeSavedWorkoutIdsAfterSave<TestWorkout>({
      savedDraftWorkouts: [
        { title: "Treino A", exercises: [{ exercise_id: "supino-atual" }] },
        { title: "Treino B", exercises: [{ exercise_id: "remada-atual" }] },
      ],
      currentWorkouts: [
        { title: "Treino inserido durante o salvamento", exercises: [{ exercise_id: "supino-atual" }] },
        { title: "Treino A", exercises: [{ exercise_id: "supino-atual" }] },
        { title: "Treino B", exercises: [{ exercise_id: "remada-atual" }] },
      ],
      savedWorkoutIds: ["saved-a", "saved-b"],
    });

    expect(result.map((workout) => workout.id)).toEqual([undefined, undefined, undefined]);
  });
});
