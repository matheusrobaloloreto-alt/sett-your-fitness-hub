import { describe, expect, it } from "vitest";
import { strengthExerciseMethodSummary } from "./generatePDFs";

describe("strength PDF method serialization", () => {
  it("renders method, week and hold time from weekly prescription", () => {
    expect(strengthExerciseMethodSummary({
      weekly_prescription: [
        { week: 3, method: "pico_contracao", method_seconds: 2 },
        { week: 4, method: "dropset", method_seconds: null },
      ],
    })).toBe("S3 Pico de contração 2s · S4 Drop-set");
  });

  it("does not invent a method when the exercise has straight sets", () => {
    expect(strengthExerciseMethodSummary({ weekly_prescription: [{ week: 1, method: null }] })).toBe("");
  });
});
