import { describe, expect, it } from "vitest";
import {
  copyWeeklyPrescriptionMetrics,
  ensureWeeklyPrescription,
  individualWeeklyUiVersionForExercise,
  initializeNewWeeklyWorkoutDraft,
  INDIVIDUAL_WEEKLY_UI_VERSION as V2,
  LEGACY_INDIVIDUAL_WEEKLY_UI_VERSION as V1,
  serializeWeeklyExercise,
  type WeeklyAwareExercise,
} from "./weeklyStrengthPeriodization";
import { buildWorkoutTemplateDraft } from "./workoutTemplateDraft";
import { mapStrengthExercise } from "./publishStrengthPlan";

const base: WeeklyAwareExercise = {
  sets: "4", reps: "12", rest: "90s", notes: "Base",
  method: "cluster", group_id: "base-pair", method_seconds: 15,
  set_types: ["warmup", "normal", "normal", "failure"],
};
const week = {
  week: 1, block: "base", sets: 2, reps: "8", rir: "3",
  rest_seconds: 0, tempo: "2020", instruction: "Week",
  method: null, group_id: null, method_seconds: null,
  set_types: ["warmup", "failure"],
};

describe("workout draft weekly persistence", () => {
  it("initializes only new template imports, leaving loaded old siblings untouched", () => {
    const old = { title: "Old", description: "", exercises: [{ ...base, exercise_id: "synthetic" }] };
    const imported = buildWorkoutTemplateDraft({
      template: { id: "template", company_id: "company", name: "New", workouts: [{
        title: "New", exercises: [{ ...base, exercise_id: "synthetic" }],
      }] },
      existingWorkouts: [old], mode: "append", currentCompanyId: "company",
      visibleExerciseIds: new Set(["synthetic"]),
    });
    expect(imported.ok).toBe(true);
    const draft = initializeNewWeeklyWorkoutDraft(imported.workouts as typeof old[], 1);
    expect(draft[0]).toEqual(old);
    expect(draft[0].exercises[0]).not.toHaveProperty("weekly_ui_version");
    expect(draft[1].exercises[0]).toMatchObject({ weekly_ui_version: V2 });
    expect(draft[1].exercises[0].weekly_prescription).toHaveLength(6);
    expect(draft[1].exercises[0].weekly_prescription?.[0]).toMatchObject({ tempo: "2020", sets: 4 });
    const replaced = initializeNewWeeklyWorkoutDraft(imported.workouts as typeof old[], 0);
    expect(replaced[0].exercises[0].weekly_ui_version).toBe(V2);
    expect(imported.workouts[1].exercises?.[0]).not.toHaveProperty("weekly_ui_version");
  });

  it("keeps old-only loads legacy and preserves explicit v1 in new template copies", () => {
    expect(serializeWeeklyExercise(base, "legacy", V2)).toBe(base);
    const copy = initializeNewWeeklyWorkoutDraft([{ exercises: [{ ...base, weekly_ui_version: V1, weekly_prescription: [week] }] }]);
    expect(copy[0].exercises[0].weekly_ui_version).toBe(V1);
  });

  it("recognizes new AI weekly publications before editor serialization", () => {
    const generated = mapStrengthExercise({ exercise_id: "synthetic", sets: 2, reps: "8", weekly_prescription: [week] });
    expect(generated.weekly_ui_version).toBe(V2);
    expect(individualWeeklyUiVersionForExercise(generated, "weekly")).toBe(V2);
    expect(serializeWeeklyExercise(generated, "weekly", V2).weekly_prescription?.[0]).toMatchObject({
      rest_seconds: 0, method: null, group_id: null,
    });
  });
  it("selects the same per-exercise contract for UI and serialization in mixed drafts", () => {
    expect(individualWeeklyUiVersionForExercise(base, "weekly")).toBeNull();
    expect(individualWeeklyUiVersionForExercise({ ...base, weekly_prescription: [week] }, "weekly")).toBeNull();
    expect(individualWeeklyUiVersionForExercise({ ...base, weekly_ui_version: V1 }, "weekly")).toBe(V1);
    expect(individualWeeklyUiVersionForExercise({ ...base, weekly_ui_version: V2 }, "weekly")).toBe(V2);
    expect(individualWeeklyUiVersionForExercise({ ...base, weekly_ui_version: V2 }, "legacy")).toBeNull();
  });

  it.each([V1, V2])("preserves rest zero through editor and serializer (%s)", (version) => {
    const input = { ...base, weekly_ui_version: version, weekly_prescription: [week] };
    expect(ensureWeeklyPrescription(input, version)[0].rest_seconds).toBe(0);
    expect(serializeWeeklyExercise(input, "weekly", version).weekly_prescription?.[0].rest_seconds).toBe(0);
  });

  it.each([V1, V2])("preserves explicit straight sets and cleared group/timing (%s)", (version) => {
    const input = { ...base, weekly_ui_version: version, weekly_prescription: [week] };
    expect(ensureWeeklyPrescription(input, version)[0]).toMatchObject({
      method: null, group_id: null, method_seconds: null,
    });
    expect(serializeWeeklyExercise(input, "weekly", version).weekly_prescription?.[0]).toMatchObject({
      method: null, group_id: null, method_seconds: null,
    });
  });

  it("inherits base method/group only when the weekly property is absent", () => {
    const { method: _method, group_id: _group, method_seconds: _seconds, ...missing } = week;
    expect(ensureWeeklyPrescription({ ...base, weekly_prescription: [missing] }, V2)[0])
      .toMatchObject({ method: "cluster", group_id: "base-pair", method_seconds: 15 });
  });

  it("does not migrate unversioned siblings with or without existing weekly data", () => {
    const legacy = { ...base };
    const legacyWeekly = { ...base, weekly_prescription: [week] };
    const v2 = { ...base, weekly_ui_version: V2, weekly_prescription: [week] };
    const before = structuredClone([legacy, legacyWeekly, v2]);
    const result = [legacy, legacyWeekly, v2].map((item) => serializeWeeklyExercise(item, "weekly", V2));
    expect(result[0]).toEqual(legacy);
    expect(result[1]).toEqual(legacyWeekly);
    expect(result[0]).not.toHaveProperty("weekly_ui_version");
    expect(result[1]).not.toHaveProperty("weekly_ui_version");
    expect(result[2]).toMatchObject({ weekly_ui_version: V2, sets: "2", rest: "0s" });
    expect([legacy, legacyWeekly, v2]).toEqual(before);
  });

  it("preserves each explicit version even when the global layout uses v1", () => {
    const v2 = { ...base, weekly_ui_version: V2, weekly_prescription: [week] };
    const v1 = { ...base, weekly_ui_version: V1, weekly_prescription: [week] };
    expect(serializeWeeklyExercise(v2, "weekly", V1)).toMatchObject({
      weekly_ui_version: V2, sets: "2", set_types: ["warmup", "failure"], tempo: "2020",
    });
    expect(serializeWeeklyExercise(v1, "weekly", V2)).toMatchObject({
      weekly_ui_version: V1, sets: "4", rest: "90s",
    });
    expect(serializeWeeklyExercise(v1, "legacy", V2)).toBe(v1);
  });

  it("copies metrics to multiple weeks without changing source/order or set type arrays", () => {
    const input = { ...base, weekly_ui_version: V2, weekly_prescription: [week] };
    const ensured = ensureWeeklyPrescription(input, V2);
    const copied = copyWeeklyPrescriptionMetrics(ensured, 1, [3, 5]);
    const saved = serializeWeeklyExercise({ ...input, weekly_prescription: copied }, "weekly", V2);
    for (const index of [0, 2, 4]) {
      expect(saved.weekly_prescription?.[index]).toMatchObject({
        sets: 2, reps: "8", rest_seconds: 0, method: null, group_id: null,
        set_types: ["warmup", "failure"], tempo: "2020",
      });
    }
    expect(copied[2].set_types).not.toBe(copied[0].set_types);
    expect(copied.map((item) => item.week)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(week.rest_seconds).toBe(0);
  });
});
