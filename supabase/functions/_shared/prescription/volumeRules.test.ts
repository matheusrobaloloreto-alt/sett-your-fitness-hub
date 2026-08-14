import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countWeeklySets, targetVolumeFactor } from "./volumeRules.ts";

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
