export const MIN_MEALS_PER_DAY = 2;
export const MAX_MEALS_PER_DAY = 7;

export function normalizeMealsPerDay(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 3;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(MAX_MEALS_PER_DAY, Math.max(MIN_MEALS_PER_DAY, Math.trunc(parsed)));
}

export function mealScheduleEntries(
  mealsPerDay: string | number | null | undefined,
  mealTimes: readonly string[],
) {
  return Array.from({ length: normalizeMealsPerDay(mealsPerDay) }, (_, index) => ({
    key: `meal_t${index + 1}`,
    label: `${index + 1}ª refeição`,
    value: mealTimes[index] || "",
    index,
  }));
}

export function mealSchedulePayload(
  mealsPerDay: string | number | null | undefined,
  mealTimes: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    mealScheduleEntries(mealsPerDay, mealTimes).map(({ key, value }) => [key, value]),
  );
}
