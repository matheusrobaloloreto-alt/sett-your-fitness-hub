import { describe, expect, it } from "vitest";
import { SET_TYPES, normalizeSetType, sanitizeSetTypes } from "./setTypes";
import { sanitizeTemplateExercise } from "./sendWorkoutTemplate";

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
});
