import { describe, expect, it } from "vitest";
import { buildPeriodizationPlan } from "./periodization";

describe("periodização visual BN", () => {
  it("espelha os blocos executáveis do ciclo de seis semanas sem inventar deload", () => {
    const plan = buildPeriodizationPlan("hipertrofia", 6);

    expect(plan.weeks.map((week) => week.mesocycle)).toEqual([
      "base",
      "base",
      "acumulacao",
      "acumulacao",
      "intensificacao",
      "intensificacao",
    ]);
    expect(plan.weeks.map((week) => week.microcycle)).toEqual([
      "ordinario",
      "ordinario",
      "ordinario",
      "ordinario",
      "choque",
      "ordinario",
    ]);
    expect(plan.weeks.some((week) => week.microcycle === "regenerativo")).toBe(false);
  });

  it("mantém um plano de quatro semanas em base e acumulação", () => {
    const plan = buildPeriodizationPlan("hipertrofia", 4);

    expect(plan.weeks.map((week) => week.mesocycle)).toEqual([
      "base",
      "base",
      "acumulacao",
      "acumulacao",
    ]);
  });
});
