import { describe, expect, it } from "vitest";
import { canAccessStudentWorkout } from "./studentAccess";

describe("student workout access", () => {
  it("keeps the profile login but blocks an inactive student from workout URLs", () => {
    expect(canAccessStudentWorkout({
      role: "student",
      userId: "user-1",
      studentUserId: "user-1",
      studentCompanyId: "company-1",
      studentStatus: "inactive",
    })).toBe(false);
  });

  it("allows the active student to open only their own workout", () => {
    expect(canAccessStudentWorkout({
      role: "student",
      userId: "user-1",
      studentUserId: "user-1",
      studentStatus: "active",
    })).toBe(true);
    expect(canAccessStudentWorkout({
      role: "student",
      userId: "user-2",
      studentUserId: "user-1",
      studentStatus: "active",
    })).toBe(false);
  });

  it("keeps same-company staff and master support access", () => {
    expect(canAccessStudentWorkout({
      role: "trainer",
      userId: "trainer-1",
      companyId: "company-1",
      studentCompanyId: "company-1",
      studentStatus: "inactive",
    })).toBe(true);
    expect(canAccessStudentWorkout({
      role: "trainer",
      userId: "trainer-1",
      companyId: "company-2",
      studentCompanyId: "company-1",
      studentStatus: "active",
    })).toBe(false);
    expect(canAccessStudentWorkout({
      role: "master",
      userId: "master-1",
      studentCompanyId: "company-1",
      studentStatus: "inactive",
    })).toBe(true);
  });
});
