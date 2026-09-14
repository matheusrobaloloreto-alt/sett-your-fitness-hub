import { describe, expect, it } from "vitest";
import { athleticClubStudentIds, isAthleticClubPlan, type ClubEnrollment, type ClubPlan } from "./athleticClub";

const companyA = "company-a";
const companyB = "company-b";

function plan(id: string, name: string, company_id = companyA): ClubPlan {
  return { id, name, company_id };
}

function enrollment(
  id: string,
  student_id: string,
  plan_id: string,
  status: string,
  created_at: string,
  company_id = companyA,
): ClubEnrollment {
  return { id, student_id, plan_id, status, created_at, company_id };
}

describe("athleticClub membership derivation", () => {
  it("recognizes Athletic Club variants without matching BN PRO", () => {
    expect(isAthleticClubPlan("Athletic Club Iniciante")).toBe(true);
    expect(isAthleticClubPlan(" Athletic   Club Semestral ")).toBe(true);
    expect(isAthleticClubPlan("Athletic Club-Anual")).toBe(true);
    expect(isAthleticClubPlan("Athletic Club: Black")).toBe(true);

    expect(isAthleticClubPlan("BN PRO")).toBe(false);
    expect(isAthleticClubPlan("Plano Athletic")).toBe(false);
    expect(isAthleticClubPlan("AthleticClub Semestral")).toBe(false);
  });

  it("uses the latest canonical enrollment for the current prescription status", () => {
    const plans = [
      plan("club", "Athletic Club Semestral"),
      plan("bn-pro", "BN PRO"),
    ];

    const ids = athleticClubStudentIds(companyA, plans, [
      enrollment("old-active", "student-1", "bn-pro", "active", "2026-08-01T00:00:00Z"),
      enrollment("new-active", "student-1", "club", "active", "2026-09-01T00:00:00Z"),
      enrollment("history", "student-2", "club", "canceled", "2026-09-02T00:00:00Z"),
    ]);

    expect(ids).toEqual(new Set(["student-1"]));
  });

  it("keeps canceled and historical Athletic Club enrollments from leaking a badge", () => {
    const ids = athleticClubStudentIds(companyA, [plan("club", "Athletic Club Anual")], [
      enrollment("cancelled", "student-1", "club", "canceled", "2026-09-01T00:00:00Z"),
      enrollment("expired", "student-2", "club", "expired", "2026-09-01T00:00:00Z"),
      enrollment("archived", "student-3", "club", "history", "2026-09-01T00:00:00Z"),
    ]);

    expect(ids.size).toBe(0);
  });

  it("supports awaiting training and renewal as operational memberships", () => {
    const ids = athleticClubStudentIds(companyA, [plan("club", "Athletic Club Iniciante")], [
      enrollment("awaiting-training", "student-1", "club", "awaiting_training", "2026-09-01T00:00:00Z"),
      enrollment("awaiting-renewal", "student-2", "club", "awaiting_renewal", "2026-09-01T00:00:00Z"),
    ]);

    expect(ids).toEqual(new Set(["student-1", "student-2"]));
  });

  it("lets active BN PRO beat a newer renewal Athletic Club row through the canonical selector", () => {
    const plans = [
      plan("club", "Athletic Club Semestral"),
      plan("bn-pro", "BN PRO"),
    ];

    const ids = athleticClubStudentIds(companyA, plans, [
      enrollment("active-bn", "student-1", "bn-pro", "active", "2026-08-01T00:00:00Z"),
      enrollment("renewal-club", "student-1", "club", "awaiting_renewal", "2026-09-10T00:00:00Z"),
    ]);

    expect(ids.has("student-1")).toBe(false);
  });

  it("isolates tenant plans and enrollments before selecting badges", () => {
    const ids = athleticClubStudentIds(companyA, [
      plan("club-a", "Athletic Club Iniciante", companyA),
      plan("club-b", "Athletic Club Iniciante", companyB),
    ], [
      enrollment("tenant-b", "student-1", "club-b", "active", "2026-09-01T00:00:00Z", companyB),
      enrollment("tenant-a", "student-2", "club-a", "active", "2026-09-01T00:00:00Z", companyA),
    ]);

    expect(ids).toEqual(new Set(["student-2"]));
  });
});
