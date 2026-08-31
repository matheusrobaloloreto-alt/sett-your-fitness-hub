import { describe, expect, it } from "vitest";
import {
  assertInstallmentCountAllowed,
  maxInstallmentsForPlanDuration,
} from "../../supabase/functions/_shared/payment-installments";

describe("payment installment policy", () => {
  it("maps BN plan durations to the approved limits", () => {
    expect(maxInstallmentsForPlanDuration(6)).toBe(1);
    expect(maxInstallmentsForPlanDuration(24)).toBe(6);
    expect(maxInstallmentsForPlanDuration(48)).toBe(12);
  });

  it("fails closed for an unknown duration", () => {
    expect(maxInstallmentsForPlanDuration(12)).toBe(1);
    expect(() => assertInstallmentCountAllowed(2, 12)).toThrow(/não permitida/);
  });

  it("rejects fractional, zero and excessive installments", () => {
    expect(() => assertInstallmentCountAllowed(0, 24)).toThrow(/não permitida/);
    expect(() => assertInstallmentCountAllowed(2.5, 24)).toThrow(/não permitida/);
    expect(() => assertInstallmentCountAllowed(7, 24)).toThrow(/não permitida/);
    expect(assertInstallmentCountAllowed(6, 24)).toBe(6);
  });
});
