import { describe, expect, it } from "vitest";
import { mealScheduleEntries, mealSchedulePayload, normalizeMealsPerDay } from "./mealSchedule";

describe("mealSchedule", () => {
  it("renders exactly the selected number of meals", () => {
    expect(mealScheduleEntries("2", []).map((meal) => meal.label)).toEqual([
      "1ª refeição",
      "2ª refeição",
    ]);
    expect(mealScheduleEntries("5", []).map((meal) => meal.label)).toHaveLength(5);
    expect(mealScheduleEntries("7", []).map((meal) => meal.label)).toHaveLength(7);
  });

  it("keeps the meal schedule inside the supported range", () => {
    expect(normalizeMealsPerDay(1)).toBe(2);
    expect(normalizeMealsPerDay(9)).toBe(7);
    expect(normalizeMealsPerDay(null)).toBe(3);
  });

  it("serializes every visible meal for the prescription context", () => {
    expect(mealSchedulePayload(5, ["07:00", "10:00", "13:00", "16:00", "20:00"])).toEqual({
      meal_t1: "07:00",
      meal_t2: "10:00",
      meal_t3: "13:00",
      meal_t4: "16:00",
      meal_t5: "20:00",
    });
  });
});
