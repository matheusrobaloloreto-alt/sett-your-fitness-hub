type ProviderInstallment = {
  id?: unknown;
  customer?: unknown;
  billingType?: unknown;
  installment?: unknown;
  installmentNumber?: unknown;
  externalReference?: unknown;
};

type LocalOrder = {
  id: string;
  company_id: string | null;
  student_id: string | null;
  asaas_customer_id: string | null;
  asaas_payment_id: string | null;
  billing_type: string | null;
  installment_count: number | null;
};

const orderReference = /^sett-payment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function isSecondaryCardInstallment(payment: ProviderInstallment) {
  return payment.billingType === "CREDIT_CARD" &&
    typeof payment.installment === "string" && payment.installment.length > 0 &&
    typeof payment.installmentNumber === "number" &&
    Number.isSafeInteger(payment.installmentNumber) && payment.installmentNumber > 1;
}

export function secondaryInstallmentOrderId(payment: ProviderInstallment): string | null {
  if (!isSecondaryCardInstallment(payment) || typeof payment.externalReference !== "string") return null;
  return orderReference.exec(payment.externalReference)?.[1] ?? null;
}

export function matchesSecondaryInstallmentOrder(
  secondary: ProviderInstallment, order: LocalOrder, primary: ProviderInstallment,
) {
  return secondaryInstallmentOrderId(secondary) === order.id &&
    Boolean(order.company_id && order.student_id && order.asaas_customer_id && order.asaas_payment_id) &&
    order.billing_type === "CREDIT_CARD" &&
    typeof order.installment_count === "number" && Number(secondary.installmentNumber) <= order.installment_count &&
    primary.id === order.asaas_payment_id && primary.id !== secondary.id &&
    primary.billingType === "CREDIT_CARD" && primary.installmentNumber === 1 &&
    primary.customer === order.asaas_customer_id && secondary.customer === primary.customer &&
    secondary.installment === primary.installment && secondary.externalReference === primary.externalReference;
}
