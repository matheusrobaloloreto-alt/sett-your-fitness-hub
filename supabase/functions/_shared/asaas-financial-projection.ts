export const ASAAS_FINANCIAL_PROJECTION_LOCAL_LIMIT = 250;
export const ASAAS_FINANCIAL_PROJECTION_GROUP_LIMIT = 100;
export const ASAAS_FINANCIAL_PROJECTION_GROUP_PAGE_CAP = 10;

export type FinancialProjectionResolution =
  | "provider_group"
  | "single_provider_payment"
  | "unresolved_local";

export type FinancialProjectionUnresolvedReason =
  | "missing_asaas_payment_id"
  | "provider_payment_unavailable"
  | "provider_group_unavailable";

export interface LocalFinancialPayment {
  id: string;
  student_id: string | null;
  company_id: string | null;
  asaas_payment_id: string | null;
  asaas_customer_id?: string | null;
  billing_type: string | null;
  installment_count: number | null;
  invoice_status?: string | null;
  status: string | null;
  value: number | null;
  due_date: string | null;
  created_at: string;
}

export interface AsaasFinancialPayment {
  id: string;
  customer: string | null;
  billingType: string | null;
  value: number | null;
  netValue?: number | null;
  dateCreated: string | null;
  dueDate: string | null;
  creditDate?: string | null;
  estimatedCreditDate?: string | null;
  clientPaymentDate?: string | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  status: string | null;
  installment?: string | null;
  installmentNumber?: number | null;
}

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
  reason: FinancialProjectionUnresolvedReason;
  localPaymentId: string;
  asaasPaymentId: string | null;
  billingType: string | null;
  localValue: number | null;
  localStatus: string | null;
  dueDate: string | null;
}

export interface BuildFinancialProjectionInput {
  localPayments: LocalFinancialPayment[];
  providerPaymentsById: Map<string, AsaasFinancialPayment>;
  providerGroupsById: Map<string, AsaasFinancialPayment[]>;
  unavailableProviderPaymentIds?: Set<string>;
  unavailableProviderGroupIds?: Set<string>;
}

export interface BuildFinancialProjectionResult {
  entries: FinancialProjectionEntry[];
  unresolved: FinancialProjectionUnresolved[];
  groupIds: string[];
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeAsaasFinancialPayment(raw: Record<string, unknown>): AsaasFinancialPayment {
  return {
    id: String(raw.id || ""),
    customer: asNullableString(raw.customer),
    billingType: asNullableString(raw.billingType),
    value: asNullableNumber(raw.value),
    netValue: asNullableNumber(raw.netValue),
    dateCreated: asNullableString(raw.dateCreated),
    dueDate: asNullableString(raw.dueDate),
    creditDate: asNullableString(raw.creditDate),
    estimatedCreditDate: asNullableString(raw.estimatedCreditDate),
    clientPaymentDate: asNullableString(raw.clientPaymentDate),
    paymentDate: asNullableString(raw.paymentDate),
    confirmedDate: asNullableString(raw.confirmedDate),
    status: asNullableString(raw.status),
    installment: asNullableString(raw.installment),
    installmentNumber: asNullableNumber(raw.installmentNumber),
  };
}

function actualCreditDate(payment: AsaasFinancialPayment): string | null {
  return payment.creditDate
    || payment.clientPaymentDate
    || payment.paymentDate
    || null;
}

function compareProviderPayments(a: AsaasFinancialPayment, b: AsaasFinancialPayment): number {
  const aOrdinal = a.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  const bOrdinal = b.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  if (aOrdinal !== bOrdinal) return aOrdinal - bOrdinal;
  return String(a.dueDate || "").localeCompare(String(b.dueDate || ""))
    || String(a.id).localeCompare(String(b.id));
}

function expectedGroupCount(locals: LocalFinancialPayment[]): number | null {
  const counts = locals
    .map((local) => Number(local.installment_count))
    .filter((count) => Number.isInteger(count) && count > 1);
  if (counts.length !== locals.length) return null;
  const unique = new Set(counts);
  return unique.size === 1 ? counts[0] : null;
}

function groupIsAuthoritative(
  groupId: string,
  payments: AsaasFinancialPayment[],
  expectedCount: number | null,
): boolean {
  if (!expectedCount || payments.length !== expectedCount) return false;
  if (payments.length === 0) return false;
  const seen = new Set<string>();
  const ordinals = new Set<number>();
  for (const payment of payments) {
    if (!payment.id || seen.has(payment.id) || payment.installment !== groupId) return false;
    seen.add(payment.id);
    const ordinal = Number(payment.installmentNumber);
    if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > expectedCount || ordinals.has(ordinal)) return false;
    ordinals.add(ordinal);
  }
  return ordinals.size === expectedCount;
}

export function buildFinancialProjection(input: BuildFinancialProjectionInput): BuildFinancialProjectionResult {
  const unavailablePaymentIds = input.unavailableProviderPaymentIds ?? new Set<string>();
  const unavailableGroupIds = input.unavailableProviderGroupIds ?? new Set<string>();
  const localByProviderId = new Map<string, LocalFinancialPayment[]>();
  const unresolved: FinancialProjectionUnresolved[] = [];
  const unresolvedLocalIds = new Set<string>();

  const pushUnresolved = (
    local: LocalFinancialPayment,
    reason: FinancialProjectionUnresolved["reason"],
    asaasPaymentId: string | null = local.asaas_payment_id ?? null,
  ) => {
    if (unresolvedLocalIds.has(local.id)) return;
    unresolvedLocalIds.add(local.id);
    unresolved.push({
      resolution: "unresolved_local",
      reason,
      localPaymentId: local.id,
      asaasPaymentId,
      billingType: local.billing_type,
      localValue: local.value,
      localStatus: local.status,
      dueDate: local.due_date,
    });
  };

  for (const local of input.localPayments) {
    if (!local.asaas_payment_id) {
      pushUnresolved(local, "missing_asaas_payment_id", null);
      continue;
    }

    const list = localByProviderId.get(local.asaas_payment_id) ?? [];
    list.push(local);
    localByProviderId.set(local.asaas_payment_id, list);
  }

  const entries: FinancialProjectionEntry[] = [];
  const emittedProviderIds = new Set<string>();
  const emittedGroupIds = new Set<string>();
  const groupIds: string[] = [];

  for (const [providerId, locals] of localByProviderId) {
    if (emittedProviderIds.has(providerId)) continue;

    if (unavailablePaymentIds.has(providerId)) {
      for (const local of locals) {
        pushUnresolved(local, "provider_payment_unavailable", providerId);
      }
      continue;
    }

    const provider = input.providerPaymentsById.get(providerId);
    if (!provider) {
      for (const local of locals) {
        pushUnresolved(local, "provider_payment_unavailable", providerId);
      }
      continue;
    }

    const groupId = provider.installment || null;
    if (!groupId) {
      emittedProviderIds.add(providerId);
      entries.push({
        resolution: "single_provider_payment",
        localPaymentIds: locals.map((local) => local.id),
        asaasPaymentId: provider.id,
        installmentGroupId: null,
        installmentNumber: provider.installmentNumber ?? null,
        billingType: provider.billingType,
        value: asNumber(provider.value),
        dateCreated: provider.dateCreated || provider.confirmedDate || provider.dueDate,
        dueDate: provider.dueDate,
        creditDate: actualCreditDate(provider),
        estimatedCreditDate: provider.estimatedCreditDate || null,
        status: provider.status,
        invoiceStatus: locals.find((local) => local.invoice_status)?.invoice_status ?? null,
      });
      continue;
    }

    if (emittedGroupIds.has(groupId)) continue;
    emittedGroupIds.add(groupId);
    groupIds.push(groupId);

    const rawGroupPayments = input.providerGroupsById.get(groupId) ?? [];
    const rawGroupProviderIds = new Set(rawGroupPayments.map((payment) => payment.id).filter(Boolean));
    const impactedLocals = Array.from(localByProviderId.entries())
      .filter(([id]) => input.providerPaymentsById.get(id)?.installment === groupId || rawGroupProviderIds.has(id))
      .flatMap(([, groupLocals]) => groupLocals);
    const expectedCount = expectedGroupCount(impactedLocals.length ? impactedLocals : locals);
    if (
      unavailableGroupIds.has(groupId)
      || !input.providerGroupsById.has(groupId)
      || (impactedLocals.length ? impactedLocals : locals).some((local) =>
        Boolean(local.asaas_payment_id) && !rawGroupProviderIds.has(local.asaas_payment_id as string)
      )
      || !groupIsAuthoritative(groupId, rawGroupPayments, expectedCount)
    ) {
      for (const local of impactedLocals.length ? impactedLocals : locals) {
        pushUnresolved(local, "provider_group_unavailable", local.asaas_payment_id);
      }
      continue;
    }

    const groupPayments = [...rawGroupPayments].sort(compareProviderPayments);

    for (const groupPayment of groupPayments) {
      if (emittedProviderIds.has(groupPayment.id)) continue;
      emittedProviderIds.add(groupPayment.id);
      const groupLocals = localByProviderId.get(groupPayment.id) ?? [];
      entries.push({
        resolution: "provider_group",
        localPaymentIds: groupLocals.map((local) => local.id),
        asaasPaymentId: groupPayment.id,
        installmentGroupId: groupId,
        installmentNumber: groupPayment.installmentNumber ?? null,
        billingType: groupPayment.billingType,
        value: asNumber(groupPayment.value),
        dateCreated: groupPayment.dateCreated || groupPayment.confirmedDate || groupPayment.dueDate,
        dueDate: groupPayment.dueDate,
        creditDate: actualCreditDate(groupPayment),
        estimatedCreditDate: groupPayment.estimatedCreditDate || null,
        status: groupPayment.status,
        invoiceStatus: groupLocals.find((local) => local.invoice_status)?.invoice_status ?? null,
      });
    }
  }

  return { entries, unresolved, groupIds };
}
