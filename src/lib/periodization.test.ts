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

  it("mantém macrociclo longo dentro do contrato RIR 2-4, com regenerativos em RIR 4", () => {
    const plan = buildPeriodizationPlan("hipertrofia", 8);
    const regenerativeWeeks = plan.weeks.filter((week) => week.microcycle === "regenerativo");
    const shockWeeks = plan.weeks.filter((week) => week.microcycle === "choque");
    const rirBounds = plan.weeks.flatMap((week) => week.rir.match(/\d+/g)?.map(Number) || []);

    expect(regenerativeWeeks.map((week) => ({ week: week.week, rir: week.rir }))).toEqual([
      { week: 4, rir: "4" },
      { week: 8, rir: "4" },
    ]);
    expect(shockWeeks.map((week) => ({ week: week.week, rir: week.rir }))).toEqual([
      { week: 3, rir: "2" },
      { week: 7, rir: "2" },
    ]);
    expect(Math.min(...rirBounds)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...rirBounds)).toBeLessThanOrEqual(4);
  });
});
