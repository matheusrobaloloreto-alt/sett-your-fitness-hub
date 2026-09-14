import { describe, expect, it } from "vitest";
import { parseCompanyDashboardSnapshot, type CompanyDashboardSnapshot } from "./companyDashboardSnapshot";

const companyId = "company-a";
function fixture(): CompanyDashboardSnapshot {
  return {
    version: 1, companyId, asOfDate: "2026-09-14",
    stats: { totalStudents: 0, interestedStudents: 0, pendingStudents: 0, awaitingRenewalStudents: 0, inactiveStudents: 0, trainers: 0 },
    planChart: [], expiringContracts: [], cycleCountdowns: [], trainerMap: {},
    renewals: { expiringContracts: [], awaitingRenewal: [], cycleCountdowns: [], trainerMap: {} },
    alerts: { pendingActions: [], birthdays: [], missingWorkouts: [], awaitingTrainer: [], awaitingTrainingDate: [], missingEnrollment: [], incompleteBilling: [], recentStudents: [] },
    monthlyPrescriptions: [], pendingFeedback: [], contactCadence: [], cohortFeedback: [], atRiskStudents: [],
  };
}
describe("company Dashboard snapshot boundary", () => {
  it("accepts a legitimately empty tenant as an explicit complete result", () => {
    const data = fixture();
    expect(parseCompanyDashboardSnapshot(data, companyId)).toBe(data);
  });
  it("rejects another tenant's cached response", () => {
    expect(() => parseCompanyDashboardSnapshot(fixture(), "company-b")).toThrow(/contrato/);
  });
  it("fails closed when any operational section is missing instead of hiding it", () => {
    for (const section of ["alerts", "renewals", "pendingFeedback", "monthlyPrescriptions", "contactCadence", "cohortFeedback", "atRiskStudents"] as const) {
      const data: Record<string, unknown> = { ...fixture() };
      delete data[section];
      expect(() => parseCompanyDashboardSnapshot(data, companyId)).toThrow(/contrato/);
    }
    const data = fixture();
    delete (data.alerts as Partial<typeof data.alerts>).birthdays;
    expect(() => parseCompanyDashboardSnapshot(data, companyId)).toThrow(/contrato/);
  });
  it("rejects unavailable RPC payloads and incompatible versions", () => {
    for (const data of [null, [], {}, { ...fixture(), version: 2 }]) {
      expect(() => parseCompanyDashboardSnapshot(data, companyId)).toThrow();
    }
  });
});
