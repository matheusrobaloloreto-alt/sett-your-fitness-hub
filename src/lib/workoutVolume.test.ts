import { describe, expect, it } from "vitest";
import { calculateWeeklyMuscleVolume } from "@/lib/workoutVolume";

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

    expect(result.volume).toEqual({ Glúteo: 4, Quadríceps: 2, Dorsal: 3 });
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
});
