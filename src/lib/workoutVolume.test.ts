import { describe, expect, it } from "vitest";
import {
  calculateWeeklyMuscleVolume,
  hasPlannedVolumeWeeks,
  plannedVolumeCycleWeek,
  workoutVolumeExerciseIds,
  workoutVolumeTargetConfig,
} from "@/lib/workoutVolume";

describe("calculateWeeklyMuscleVolume", () => {
  it("normalizes fractional and percentage target scales", () => {
    const result = calculateWeeklyMuscleVolume({
      workouts: [{ exercises: [
        { exercise_id: "squat", muscle_group: "Inferiores", sets: "4" },
        { exercise_id: "row", muscle_group: "Costas", sets: "3" },
      ] }],
      muscleGroups: [
        { id: "glutes", name: "Glúteos" },
        { id: "quads", name: "Quadríceps" },
        { id: "back", name: "Dorsal" },
      ],
      targets: [
        { exercise_id: "squat", muscle_group_id: "glutes", role: "primary", volume_percentage: 1 },
        { exercise_id: "squat", muscle_group_id: "quads", role: "secondary", volume_percentage: 50 },
        { exercise_id: "row", muscle_group_id: "back", role: "primary", volume_percentage: 100 },
      ],
    });

    expect(result.volume).toEqual({ Glúteos: 4, Quadríceps: 2, Dorsal: 3 });
    expect(result.uncoveredExerciseIds).toEqual([]);
  });

  it("does not double count aliases that collapse to the same anatomical group", () => {
    const result = calculateWeeklyMuscleVolume({
      workouts: [{ exercises: [{ exercise_id: "row", muscle_group: "Costas", sets: 4 }] }],
      muscleGroups: [
        { id: "back", name: "Costas" },
        { id: "dorsal", name: "Dorsal" },
      ],
      targets: [
        { exercise_id: "row", muscle_group_id: "back", role: "primary", volume_percentage: 1 },
        { exercise_id: "row", muscle_group_id: "dorsal", role: "secondary", volume_percentage: 50 },
      ],
    });

    expect(result.volume).toEqual({ Dorsal: 4 });
  });

  it("uses an anatomical exercise fallback and reports genuinely unmapped exercises", () => {
    const result = calculateWeeklyMuscleVolume({
      workouts: [{ exercises: [
        { exercise_id: "row", muscle_group: "Costas", sets: 3 },
        { exercise_id: "mobility", muscle_group: "Mobilidade", sets: 2 },
      ] }],
      muscleGroups: [],
      targets: [],
    });

    expect(result.volume).toEqual({ Dorsal: 3 });
    expect(result.uncoveredExerciseIds).toEqual(["mobility"]);
  });

  it.each(["individual-weeks-v1", "individual-weeks-v2"])(
    "uses the chosen week for %s in both drafts and saved cycle rows",
    (weekly_ui_version) => {
      const exercises = [
        {
          exercise_id: "squat", muscle_group: "Glúteos", sets: "9", weekly_ui_version,
          weekly_prescription: [{ week: 1, sets: 2 }, { week: "4", sets: 5 }],
        },
        { exerciseId: "row", muscle_group: "Costas", sets: "3–5" },
      ];
      const targetConfig = workoutVolumeTargetConfig([
        { exerciseId: "squat", muscleGroup: "Glúteos", role: "primary", isPrimary: true, volumePercentage: 10 },
        { exerciseId: "squat", muscleGroup: "Quadríceps", role: "secondary", isPrimary: false, volumePercentage: 90 },
      ]);
      const expected = { Glúteos: 5, Quadríceps: 2.5, Dorsal: 3 };
      expect(calculateWeeklyMuscleVolume({ ...targetConfig, workouts: [{ exercises }], week: 4 }).volume).toEqual(expected);
      const savedWorkouts = [{ id: "old-workout", cycle_id: "old-cycle", exercises: JSON.parse(JSON.stringify(exercises)) }];
      expect(calculateWeeklyMuscleVolume({ ...targetConfig, workouts: savedWorkouts, week: 4 }).volume).toEqual(expected);
      expect(calculateWeeklyMuscleVolume({ ...targetConfig, workouts: savedWorkouts, week: 2 }).volume)
        .toEqual({ Glúteos: 9, Quadríceps: 4.5, Dorsal: 3 });
      expect(exercises[0].sets).toBe("9");
    },
  );

  it("resolves saved legacy pairs without replacing an explicit even week or extrapolating a missing block", () => {
    const workouts = [{ exercises: [
      { exercise_id: "row", muscle_group: "Dorsal", sets: 2, weekly_prescription: [{ week: 1, sets: 3 }, { week: 3, sets: 5 }] },
      { exercise_id: "curl", muscle_group: "Bíceps", sets: 2, weekly_prescription: [{ week: 3, sets: 4 }, { week: 4, sets: 6 }] },
    ] }];
    const args = { workouts, targets: [], muscleGroups: [] };
    expect(hasPlannedVolumeWeeks(workouts)).toBe(true);
    expect(calculateWeeklyMuscleVolume({ ...args, week: 4 }).volume).toEqual({ Dorsal: 5, Biceps: 6 });
    expect(calculateWeeklyMuscleVolume({ ...args, week: 6 }).volume).toEqual({ Dorsal: 2, Biceps: 2 });
  });

  it("keeps non-UUID legacy IDs out of the lookup while retaining base volume", () => {
    const id = "f347c70a-3f54-42c5-b170-1c4aee06baf5";
    const workouts = [
      { exercises: [{ exerciseId: id, muscle_group: "Costas", sets: 3 }, null] },
      { exercises: [{ exercise_id: "legacy-1", muscle_group: "Bíceps", sets: "2-4" }] },
      { exercises: null },
    ];
    expect(workoutVolumeExerciseIds(workouts)).toEqual([id]);
    expect(hasPlannedVolumeWeeks(workouts)).toBe(false);
    expect(calculateWeeklyMuscleVolume({ workouts, targets: [], muscleGroups: [], week: 5 }).volume)
      .toEqual({ Dorsal: 3, Biceps: 2 });
  });

  it("chooses the week inside the inclusive cycle interval and clamps past or future cycles", () => {
    expect(plannedVolumeCycleWeek("2026-10-01", "2026-10-08", "2026-10-07")).toEqual({ weekCount: 2, week: 1 });
    expect(plannedVolumeCycleWeek("2026-10-01", "2026-10-08", "2026-10-08")).toEqual({ weekCount: 2, week: 2 });
    expect(plannedVolumeCycleWeek("2026-10-01", "2026-10-08", "2026-11-09")).toEqual({ weekCount: 2, week: 2 });
    expect(plannedVolumeCycleWeek("2026-11-16", "2026-11-22", "2026-11-09")).toEqual({ weekCount: 1, week: 1 });
    expect(plannedVolumeCycleWeek(null, null, "2026-11-09")).toEqual({ weekCount: 6, week: 1 });
  });
});
