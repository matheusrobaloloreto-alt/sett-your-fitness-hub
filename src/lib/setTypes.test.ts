import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SET_TYPES, normalizeSetType, sanitizeSetTypes, sanitizeWorkoutSetTypes } from "./setTypes";
import { sanitizeTemplateExercise } from "./sendWorkoutTemplate";
import { prepareWorkoutLibraryExport } from "./workoutLibraryExport";

describe("set type W/N/F contract", () => {
  it("exposes only warm-up, normal and failure", () => {
    expect(SET_TYPES).toEqual(["warmup", "normal", "failure"]);
  });

  it("fails legacy D/drop closed to normal while preserving length", () => {
    expect(normalizeSetType("drop")).toBe("normal");
    expect(sanitizeSetTypes(["warmup", "DROP", "failure", "unexpected"]))
      .toEqual(["warmup", "normal", "failure", "normal"]);
  });

  it("sanitizes template and weekly serialization without removing Drop-set method", () => {
    expect(sanitizeTemplateExercise({
      method: "dropset",
      set_types: ["normal", "drop"],
      weekly_prescription: [{ method: "dropset", set_types: ["drop", "failure"] }],
    })).toMatchObject({
      method: "dropset",
      set_types: ["normal", "normal"],
      weekly_prescription: [{ method: "dropset", set_types: ["normal", "failure"] }],
    });
  });

  it("drops malformed non-array set type payloads instead of forwarding them", () => {
    const sanitized = sanitizeTemplateExercise({ method: "dropset", set_types: "drop" });
    expect(sanitized.method).toBe("dropset");
    expect(sanitized.set_types).toBeUndefined();
  });

  it("sanitizes the exact workout structure loaded and saved by WorkoutBuilder", () => {
    const workouts = sanitizeWorkoutSetTypes([{
      title: "Treino legado",
      exercises: [{
        set_types: ["drop", "failure"],
        weekly_prescription: [{ set_types: ["warmup", "drop"] }],
      }],
    }]);
    expect(workouts[0].exercises[0]).toMatchObject({
      set_types: ["normal", "failure"],
      weekly_prescription: [{ set_types: ["warmup", "normal"] }],
    });
  });

  it("wires the sanitizer into every WorkoutBuilder persistence boundary", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/admin/WorkoutBuilder.tsx`, "utf8");
    const dialog = readFileSync(`${process.cwd()}/src/components/admin/SaveWorkoutToLibraryDialog.tsx`, "utf8");
    const exporter = readFileSync(`${process.cwd()}/src/lib/workoutLibraryExport.ts`, "utf8");
    expect(source).toContain("const normalized = ws.length ? sanitizeWorkoutSetTypes(ws)");
    expect(source.match(/const templateWorkouts = workoutRevisionPayload\(resolvedDraft\.workouts as Workout\[\], weeklyPrescriptionMode, weeklyUiVersion\)/g))
      .toHaveLength(1);
    expect(source).toContain("<SaveWorkoutToLibraryDialog");
    expect(source).toContain("workouts={libraryExportWorkouts}");
    expect(dialog).toContain("const prepared = prepareWorkoutLibraryExport({ workouts: snapshot, workoutIndex: selectedIndex, libraryExercises: exercises, companyId });");
    expect(dialog).toContain("JSON.parse(JSON.stringify(prepared.workouts))");
    expect(dialog).toContain("name: savedName, workouts: templateWorkouts, is_public: false, is_official: false");
    expect(exporter).toContain("sanitizeWorkoutSetTypes<TWorkout>(JSON.parse(JSON.stringify(selection)))");
    expect(source).toContain("const mapWorkoutRows = (rows: any[]): Workout[] => sanitizeWorkoutSetTypes(rows.map");
    expect(source).toContain("data?.length ? mapWorkoutRows(data)");
    expect(source).toMatch(/const workoutRevisionPayload = \([\s\S]*?\) => sanitizeWorkoutSetTypes\(draft\)\.map/);
    expect(source).toContain("workouts: workoutRevisionPayload(draftWorkouts, weeklyPrescriptionMode, weeklyUiVersion)");
    expect(source).not.toContain("exercises: workout.exercises as any");
  });

  it("sanitizes the new library export boundary without mutating the historical plan", () => {
    const source = [{ title: "Legado", exercises: [{ exercise_id: "canonical", method: "dropset",
      set_types: ["warmup", "drop", "failure"], weekly_ui_version: "individual-weeks-v1",
      weekly_prescription: [{ week: 2, set_types: ["normal", "drop", "failure"] }] }] }];
    const result = prepareWorkoutLibraryExport({ workouts: source, companyId: "company-a",
      libraryExercises: [{ id: "canonical", name: "Agachamento", company_id: "company-a" }] });
    expect(result.issues).toEqual([]);
    expect(result.workouts[0].exercises[0]).toMatchObject({ method: "dropset", set_types: ["warmup", "normal", "failure"],
      weekly_ui_version: "individual-weeks-v1", weekly_prescription: [{ week: 2, set_types: ["normal", "normal", "failure"] }] });
    expect(source[0].exercises[0].set_types).toEqual(["warmup", "drop", "failure"]);
    expect(source[0].exercises[0].weekly_prescription[0].set_types).toEqual(["normal", "drop", "failure"]);
  });
});
