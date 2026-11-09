import { describe, expect, it, vi } from "vitest";
import { readStudentCardioSports, readStudentNutritionPlan } from "./studentPlanReads";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

const today = "2026-11-09";
function pagedQuery(pages: unknown[][]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn((start: number) => Promise.resolve({ data: pages[start / 500] ?? [], error: null })),
  };
  from.mockReturnValue(query);
  return query;
}

describe("student plan reads", () => {
  it("finds an older current Nutri plan beyond recent records and the first page", async () => {
    const draft = { status: "draft", start_date: null, end_date: null, created_at: "2026-11-09" };
    const olderPlan = { id: "current-plan", status: "Ativo", start_date: "2026-10-01", end_date: "2026-11-09", created_at: "2026-10-01" };
    const query = pagedQuery([Array.from({ length: 500 }, () => draft), [olderPlan]]);
    expect(await readStudentNutritionPlan("student-a", today, true)).toEqual(olderPlan);
    expect(query.eq).toHaveBeenCalledWith("student_id", "student-a");
    expect(query.or).toHaveBeenCalledWith(`start_date.is.null,start_date.lte.${today}`);
    expect(query.or).toHaveBeenCalledWith(`end_date.is.null,end_date.gte.${today}`);
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });

  it("uses the canonical tabs for triathlon, accented swimming and bike", async () => {
    const query = pagedQuery([[{ sport: "TRIATHLON" }, { sport: "natação" }, { sport: "bike" }, { sport: "unsupported" }]]);
    expect(await readStudentCardioSports("student-a", today)).toEqual(new Set(["corrida", "natacao", "ciclismo"]));
    expect(query.or).toHaveBeenCalledWith("status.is.null,status.in.(active,scheduled)");
    expect(query.or).toHaveBeenCalledWith(`start_date.is.null,start_date.lte.${today}`);
    expect(query.or).toHaveBeenCalledWith(`end_date.is.null,end_date.gte.${today}`);
  });
});
