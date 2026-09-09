import { format } from "date-fns";

export const FINANCIAL_PAID_STATUSES = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"] as const;
export const CASH_AVAILABLE_STATUSES = ["RECEIVED", "RECEIVED_IN_CASH"] as const;

export type FinancialProjectionResolution =
  | "provider_group"
  | "single_provider_payment"
  | "unresolved_local";

export interface FinancialProjectionEntry {
  resolution: Exclude<FinancialProjectionResolution, "unresolved_local">;
  localPaymentIds: string[];
  asaasPaymentId: string;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  billingType: string | null;
  value: number;
  dateCreated: string | null;
  dueDate: string | null;
  creditDate: string | null;
  estimatedCreditDate: string | null;
  status: string | null;
  invoiceStatus: string | null;
}

export interface FinancialProjectionUnresolved {
  resolution: "unresolved_local";
  reason: string;
  localPaymentId: string;
  asaasPaymentId: string | null;
  billingType: string | null;
  localValue: number | null;
  localStatus: string | null;
  dueDate: string | null;
}

export interface FinancialProjectionSnapshot {
  source: string;
  generatedAt: string;
  entries: FinancialProjectionEntry[];
  unresolved: FinancialProjectionUnresolved[];
}

export function parseFinancialDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function financialMonthKey(value: string | null | undefined): string | null {
  const date = parseFinancialDate(value);
  return date ? format(date, "yyyy-MM") : null;
}

export function isPaidFinancialEntry(entry: FinancialProjectionEntry): boolean {
  return FINANCIAL_PAID_STATUSES.includes(entry.status as typeof FINANCIAL_PAID_STATUSES[number]);
}

export function isCashAvailableEntry(entry: FinancialProjectionEntry): boolean {
  if (entry.status === "RECEIVED_IN_CASH") return Boolean(entry.creditDate || entry.dueDate);
  return entry.status === "RECEIVED" && Boolean(entry.creditDate);
}

export function isProjectedCashEntry(entry: FinancialProjectionEntry): boolean {
  return entry.billingType === "CREDIT_CARD"
    && isPaidFinancialEntry(entry)
    && !isCashAvailableEntry(entry)
    && Boolean(entry.estimatedCreditDate || entry.dueDate);
}

export function billingMonthKey(entry: FinancialProjectionEntry): string | null {
  return financialMonthKey(entry.dateCreated || entry.dueDate);
}

export function cashMonthKey(entry: FinancialProjectionEntry): string | null {
  if (entry.status === "RECEIVED_IN_CASH") return financialMonthKey(entry.creditDate || entry.dueDate);
  return financialMonthKey(entry.creditDate);
}

export function projectedCashMonthKey(entry: FinancialProjectionEntry): string | null {
  return financialMonthKey(entry.estimatedCreditDate || entry.dueDate);
}

export function unresolvedCreditCardCount(unresolved: FinancialProjectionUnresolved[]): number {
  return unresolved.filter((item) => item.billingType === "CREDIT_CARD").length;
}
