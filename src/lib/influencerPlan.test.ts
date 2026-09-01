import { describe, expect, it } from "vitest";
import { planOperationalRequirements } from "./influencerPlan";

describe("planOperationalRequirements", () => {
  it("allows influencer classification without paid enrollment fields", () => {
    expect(planOperationalRequirements("influencer")).toEqual({
      requiresEnrollment: false,
      requiresTrainer: false,
      requiresStartDate: false,
      requiresPayment: false,
    });
  });

  it("preserves every existing requirement for standard plans", () => {
    expect(planOperationalRequirements("standard")).toEqual({
      requiresEnrollment: true,
      requiresTrainer: true,
      requiresStartDate: true,
      requiresPayment: true,
    });
    expect(planOperationalRequirements(null)).toEqual({
      requiresEnrollment: true,
      requiresTrainer: true,
      requiresStartDate: true,
      requiresPayment: true,
    });
  });
});
