import { describe, expect, it } from "vitest";
import {
  buildWorkoutTemplateDraft,
  hasEditableWorkoutContent,
  validateWorkoutTemplateForDraft,
} from "./workoutTemplateDraft";

const visible = new Set(["ex-1", "ex-2", "ex-3", "ex-4"]);

const template = {
  id: "tpl-1",
  name: "Full Body",
  company_id: "company-1",
  workouts: [
    {
      id: "template-workout-row",
      updated_at: "2026-09-08T00:00:00Z",
      title: "Treino A",
      description: "Força geral",
      day_of_week: 2,
      exercises: [
        {
          exercise_id: "ex-1",
          exercise_name: "Agachamento",
          muscle_group: "quadríceps",
          video_url: "https://video.example/agachamento",
          video_path: "biblioteca/ex-1.mp4",
          youtube_video_id: "yt-1",
          thumbnail_url: "thumb-1.jpg",
          group_id: "g1",
          method: "biset",
          method_seconds: null,
          sets: "4",
          reps: "8",
          rest: "90s",
          notes: "Controle o joelho",
          set_types: ["warmup", "normal", "failure"],
          weekly_prescription: [
            { week: 1, sets: 3, reps: "10", rest: "75s", set_types: ["normal"], method: "biset" },
          ],
          exercise_order: 7,
        },
        {
          exercise_id: "ex-2",
          exercise_name: "Remada",
          muscle_group: "costas",
          group_id: "g1",
          method: "biset",
          sets: "4",
          reps: "10",
          rest: "60s",
          notes: "",
        },
      ],
    },
  ],
};

describe("workout template draft import", () => {
  it("detects whether the current draft already has editable content", () => {
    expect(hasEditableWorkoutContent([{ title: "", description: "", exercises: [] }])).toBe(false);
    expect(hasEditableWorkoutContent([{ title: "Treino A", description: "", exercises: [] }])).toBe(true);
    expect(hasEditableWorkoutContent([{ title: "", description: "", exercises: [{ exercise_id: "ex-1" }] }])).toBe(true);
  });

  it("copies a tenant template into a replace draft without mutating the original or preserving row ids", () => {
    const original = JSON.parse(JSON.stringify(template));
    const result = buildWorkoutTemplateDraft({
      template,
      existingWorkouts: [{ id: "existing", title: "Antigo", exercises: [{ exercise_id: "ex-3" }] }],
      mode: "replace",
      currentCompanyId: "company-1",
      visibleExerciseIds: visible,
    });

    expect(result.ok).toBe(true);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0].id).toBeUndefined();
    expect(result.workouts[0].updated_at).toBeUndefined();
    expect(result.workouts[0].title).toBe("Treino A");
    expect(result.workouts[0].exercises?.map((exercise) => exercise.exercise_id)).toEqual(["ex-1", "ex-2"]);
    expect(result.workouts[0].exercises?.[0]).toMatchObject({
      group_id: "g1",
      method: "biset",
      weekly_prescription: template.workouts[0].exercises[0].weekly_prescription,
      video_url: "https://video.example/agachamento",
      video_path: "biblioteca/ex-1.mp4",
      youtube_video_id: "yt-1",
      thumbnail_url: "thumb-1.jpg",
      sets: "4",
      reps: "8",
      rest: "90s",
      notes: "Controle o joelho",
    });
    expect(template).toEqual(original);
  });

  it("appends a valid template as new editable workouts", () => {
    const result = buildWorkoutTemplateDraft({
      template,
      existingWorkouts: [{ id: "existing", title: "Treino existente", exercises: [{ exercise_id: "ex-3" }] }],
      mode: "append",
      currentCompanyId: "company-1",
      visibleExerciseIds: visible,
    });

    expect(result.ok).toBe(true);
    expect(result.workouts.map((workout) => workout.title)).toEqual(["Treino existente", "Treino A"]);
    expect(result.workouts[0].id).toBe("existing");
    expect(result.workouts[1].id).toBeUndefined();
  });

  it("accepts global templates and blocks cross-tenant templates", () => {
    expect(validateWorkoutTemplateForDraft({
      template: { ...template, company_id: null },
      currentCompanyId: "company-1",
      visibleExerciseIds: visible,
    })).toHaveLength(0);

    expect(validateWorkoutTemplateForDraft({
      template: { ...template, company_id: "other-company" },
      currentCompanyId: "company-1",
      visibleExerciseIds: visible,
    }).map((issue) => issue.code)).toContain("cross_tenant_template");
  });

  it("blocks malformed, empty and invisible-library exercises without changing the existing draft", () => {
    const existing = [{ id: "existing", title: "Treino existente", exercises: [{ exercise_id: "ex-3" }] }];
    const malformed = buildWorkoutTemplateDraft({
      template: { id: "bad", name: "Ruim", company_id: "company-1", workouts: [{ title: "Sem exercícios" }] },
      existingWorkouts: existing,
      mode: "replace",
      currentCompanyId: "company-1",
      visibleExerciseIds: visible,
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.workouts).toEqual(existing);
    expect(malformed.issues.map((issue) => issue.code)).toContain("malformed_workout");

    const invisible = buildWorkoutTemplateDraft({
      template: {
        id: "bad-2",
        name: "Fora",
        company_id: "company-1",
        workouts: [{ title: "Treino A", exercises: [{ exercise_id: "missing-exercise", exercise_name: "Fora" }] }],
      },
      existingWorkouts: existing,
      mode: "replace",
      currentCompanyId: "company-1",
      visibleExerciseIds: visible,
    });
    expect(invisible.ok).toBe(false);
    expect(invisible.workouts).toEqual(existing);
    expect(invisible.issues.map((issue) => issue.code)).toContain("exercise_not_visible");
  });
});
