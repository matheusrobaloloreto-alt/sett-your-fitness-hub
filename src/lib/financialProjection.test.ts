import { describe, expect, it } from "vitest";
import {
  billingMonthKey,
  cashMonthKey,
  financialMonthKey,
  isCashAvailableEntry,
  isPaidFinancialEntry,
  isProjectedCashEntry,
  projectedCashMonthKey,
  unresolvedCreditCardCount,
  type FinancialProjectionEntry,
} from "./financialProjection";

describe("financial projection UI semantics", () => {
  const baseEntry: FinancialProjectionEntry = {
    resolution: "provider_group",
    localPaymentIds: ["local-1"],
    asaasPaymentId: "pay_1",
    installmentGroupId: "ins_1",
    installmentNumber: 1,
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: "2026-09-01",
    creditDate: null,
    estimatedCreditDate: null,
    status: "CONFIRMED",
    invoiceStatus: null,
  };

  it("parses provider YYYY-MM-DD as a local civil date, preserving month boundaries", () => {
    expect(financialMonthKey("2026-09-01")).toBe("2026-09");
  });

  it("treats CONFIRMED as billing but not cash availability", () => {
    expect(isPaidFinancialEntry(baseEntry)).toBe(true);
    expect(isCashAvailableEntry(baseEntry)).toBe(false);
    expect(cashMonthKey(baseEntry)).toBeNull();
  });

  it("uses provider credit date for cash month when received", () => {
    const received = { ...baseEntry, status: "RECEIVED", creditDate: "2026-10-02" };
    expect(isCashAvailableEntry(received)).toBe(true);
    expect(cashMonthKey(received)).toBe("2026-10");
  });

  it("does not turn estimated credit date into available cash", () => {
    const estimated = { ...baseEntry, status: "RECEIVED", estimatedCreditDate: "2026-10-02" };
    expect(isCashAvailableEntry(estimated)).toBe(false);
    expect(cashMonthKey(estimated)).toBeNull();
  });

  it("keeps confirmed installments as forecast instead of received cash", () => {
    const forecast = { ...baseEntry, status: "CONFIRMED", estimatedCreditDate: "2026-10-02" };
    expect(isProjectedCashEntry(forecast)).toBe(true);
    expect(projectedCashMonthKey(forecast)).toBe("2026-10");
  });

  it("keeps billing on provider creation month, not future due months", () => {
    const futureDue = { ...baseEntry, dateCreated: "2026-09-01", dueDate: "2026-12-01" };
    expect(billingMonthKey(futureDue)).toBe("2026-09");
  });

  it("counts unresolved credit-card locals separately from official totals", () => {
    expect(unresolvedCreditCardCount([
      {
        resolution: "unresolved_local",
        reason: "provider_group_unavailable",
        localPaymentId: "local-1",
        asaasPaymentId: "pay_1",
        billingType: "CREDIT_CARD",
        localValue: 1380,
        localStatus: "CONFIRMED",
        dueDate: "2026-09-01",
      },
    ])).toBe(1);
  });
});
