import { describe, expect, it } from "vitest";
import { assertInstallmentCountAllowed, maxInstallmentsForPlanDuration } from "../../supabase/functions/_shared/payment-installments";
describe("company installment policy", () => {
  const policy = { installments_short: 1, installments_medium: 3, installments_long: 8 };
  it("uses company policy for exact supported durations", () => {
    expect(maxInstallmentsForPlanDuration(24, policy)).toBe(3);
    expect(maxInstallmentsForPlanDuration(48, policy)).toBe(8);
    expect(() => assertInstallmentCountAllowed(4, 24, policy)).toThrow();
    expect(assertInstallmentCountAllowed(3, 24, policy)).toBe(3);
  });
  it("preserves conservative legacy defaults and unknown-duration fallback", () => {
    expect(maxInstallmentsForPlanDuration(6)).toBe(1);
    expect(maxInstallmentsForPlanDuration(24)).toBe(6);
    expect(maxInstallmentsForPlanDuration(48)).toBe(12);
    expect(maxInstallmentsForPlanDuration(12, policy)).toBe(1);
  });
  it("never lets malformed policy expand installments", () => {
    expect(() => maxInstallmentsForPlanDuration(24, { ...policy, installments_medium: 99 })).toThrow();
    expect(() => assertInstallmentCountAllowed(2.5, 24, policy)).toThrow();
  });
});
