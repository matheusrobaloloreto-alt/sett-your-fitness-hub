import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countWeeklySets, enforceVolumeCaps, targetVolumeFactor } from "./volumeRules.ts";

Deno.test("targetVolumeFactor normalizes historical fraction and percentage scales", () => {
  assertEquals(targetVolumeFactor({ role: "primary", volume_percentage: 1 }), 1);
  assertEquals(targetVolumeFactor({ role: "primary", volume_percentage: 100 }), 1);
  assertEquals(targetVolumeFactor({ role: "secondary", volume_percentage: 0.5 }), 0.5);
  assertEquals(targetVolumeFactor({ role: "secondary", volume_percentage: 50 }), 0.5);
  assertEquals(targetVolumeFactor({ role: "secondary", volume_percentage: 20 }), 0.2);
  assertEquals(targetVolumeFactor({ role: "primary", volume_percentage: null }), 1);
  assertEquals(targetVolumeFactor({ role: "secondary", volume_percentage: null }), 0.5);
  assertThrows(() => targetVolumeFactor({ volume_percentage: null }), TypeError);
});

Deno.test("targetVolumeFactor rejects values outside the documented domain", () => {
  assertThrows(() => targetVolumeFactor({ volume_percentage: -1 }), RangeError);
  assertThrows(() => targetVolumeFactor({ volume_percentage: 101 }), RangeError);
  assertThrows(() => targetVolumeFactor({ volume_percentage: Number.NaN }), RangeError);
});

Deno.test("countWeeklySets attributes one exercise to multiple muscle groups", () => {
  const counts = countWeeklySets({
    workouts: [{
      name: "A",
      day_of_week: 1,
      duration_min: 60,
      split_focus: "upper",
      volume_load_estimate: "n/a",
      notes: "",
      exercises: [{
        phase: "forca_global",
        exercise_id: "supino",
        exercise_name: "Supino",
        library_exercise_name: "Supino",
        muscle_group: "Peitoral",
        sets: 3,
        reps: "8",
        load_percent_1rm: null,
        rir: "2",
        rest_seconds: 90,
        tempo: "3010",
        exercise_order: 1,
        cues: "",
        biomechanical_note: "",
        targets: [
          { muscle_group: "Peitoral", role: "primary", volume_percentage: 1 },
          { muscle_group: "Tríceps", role: "secondary", volume_percentage: 50 },
          { muscle_group: "Deltoide anterior", role: "secondary", volume_percentage: 0.5 },
        ],
      }],
    }],
  });

  assertEquals(counts.get("peitoral"), 3);
  assertEquals(counts.get("triceps"), 1.5);
  assertEquals(counts.get("ombros"), 1.5);
});

Deno.test("enforceVolumeCaps reduces weighted secondary exposure above the cap", () => {
  const exercises = Array.from({ length: 7 }, (_, index) => ({
    phase: "forca_especifica",
    exercise_id: `exercise-${index}`,
    exercise_name: `Exercise ${index}`,
    library_exercise_name: `Exercise ${index}`,
    muscle_group: `group-${index}`,
    sets: 4,
    reps: "8",
    load_percent_1rm: null,
    rir: "2",
    rest_seconds: 90,
    tempo: "3010",
    exercise_order: index + 1,
    cues: "",
    biomechanical_note: "",
    targets: [
      { muscle_group: `group-${index}`, role: "primary", volume_percentage: 100 },
      { muscle_group: "Costas", role: "secondary", volume_percentage: 50 },
    ],
  }));
  const workouts = [{
    name: "A",
    day_of_week: 1,
    duration_min: 60,
    split_focus: "full",
    volume_load_estimate: "n/a",
    notes: "",
    exercises,
  }];
  const capped = enforceVolumeCaps(workouts, {
    catalog: [],
    fitnessLevel: "iniciante",
    objective: "hipertrofia",
    daysPerWeek: 3,
  });
  const counts = countWeeklySets({ workouts: capped.workouts });

  assertEquals((counts.get("costas") || 0) <= 12, true);
  assertEquals(capped.workouts[0].exercises.reduce((sum, exercise) => sum + exercise.sets, 0) < 28, true);
  assertEquals(capped.adjustments.some((item) => item.muscle_group === "costas"), true);
});

Deno.test("enforceVolumeCaps removes one-set contributors when needed to honor the cap", () => {
  const exercises = Array.from({ length: 13 }, (_, index) => ({
    phase: "forca_global",
    exercise_id: `single-${index}`,
    exercise_name: `Single ${index}`,
    library_exercise_name: `Single ${index}`,
    muscle_group: "Costas",
    sets: 1,
    reps: "8",
    load_percent_1rm: null,
    rir: "2",
    rest_seconds: 90,
    tempo: "3010",
    exercise_order: index + 1,
    cues: "",
    biomechanical_note: "",
    targets: [{ muscle_group: "Costas", role: "primary", volume_percentage: 100 }],
  }));
  const capped = enforceVolumeCaps([{
    name: "A",
    day_of_week: 1,
    duration_min: 60,
    split_focus: "upper",
    volume_load_estimate: "n/a",
    notes: "",
    exercises,
  }], {
    catalog: [],
    fitnessLevel: "iniciante",
    objective: "hipertrofia",
    daysPerWeek: 3,
  });
  const after = countWeeklySets({ workouts: capped.workouts }).get("costas") || 0;

  assertEquals(after <= 12, true);
  assertEquals(capped.workouts[0].exercises.length, 12);
  assertEquals(capped.adjustments[0], { muscle_group: "costas", before: 13, after: 12, cap: 12 });
});
