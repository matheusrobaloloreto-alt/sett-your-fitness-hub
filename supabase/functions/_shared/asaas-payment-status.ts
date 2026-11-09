export function asaasPaymentStatus(
  payment: { status?: string | null; deleted?: boolean },
): string | null | undefined {
  // Asaas reports removal separately from the financial status.
  if (payment.status === "REFUNDED") return payment.status;
  return payment.deleted === true ? "DELETED" : payment.status;
}
