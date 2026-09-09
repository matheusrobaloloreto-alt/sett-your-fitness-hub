import {
  buildFinancialProjection,
  normalizeAsaasFinancialPayment,
} from "./asaas-financial-projection.ts";

Deno.test("provider group dedupes a legacy local total plus local children", () => {
  const localPayments = [
    {
      id: "local-total",
      student_id: "student-1",
      company_id: "company-1",
      asaas_payment_id: "pay_1",
      billing_type: "CREDIT_CARD",
      installment_count: 6,
      invoice_status: null,
      status: "CONFIRMED",
      value: 1380,
      due_date: "2026-04-03",
      created_at: "2026-04-03T10:00:00Z",
    },
    ...[2, 3, 4, 5, 6].map((n) => ({
      id: `local-${n}`,
      student_id: "student-1",
      company_id: "company-1",
      asaas_payment_id: `pay_${n}`,
      billing_type: "CREDIT_CARD",
      installment_count: 6,
      invoice_status: null,
      status: "CONFIRMED",
      value: 230,
      due_date: `2026-04-0${n + 2}`,
      created_at: `2026-04-0${n + 2}T10:00:00Z`,
    })),
  ];
  const group = [1, 2, 3, 4, 5, 6].map((n) => normalizeAsaasFinancialPayment({
    id: `pay_${n}`,
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: `2026-04-0${n + 2}`,
    status: "CONFIRMED",
    installment: "ins_group",
    installmentNumber: n,
  }));

  const result = buildFinancialProjection({
    localPayments,
    providerPaymentsById: new Map(group.map((payment) => [payment.id, payment])),
    providerGroupsById: new Map([["ins_group", group]]),
  });

  if (result.unresolved.length !== 0) throw new Error("group should be fully resolved");
  if (result.entries.length !== 6) throw new Error(`unexpected entries: ${result.entries.length}`);
  const total = result.entries.reduce((sum, entry) => sum + entry.value, 0);
  if (total !== 1380) throw new Error(`expected 1380, got ${total}`);
  const first = result.entries[0];
  if (first.localPaymentIds[0] !== "local-total" || first.value !== 230 || first.installmentNumber !== 1) {
    throw new Error(`first parcel not reconciled correctly: ${JSON.stringify(first)}`);
  }
});

Deno.test("provider group preserves provider cent rounding instead of local division", () => {
  const group = Array.from({ length: 12 }, (_, index) => normalizeAsaasFinancialPayment({
    id: `pay_${index + 1}`,
    billingType: "CREDIT_CARD",
    value: index === 11 ? 208.37 : 208.33,
    dateCreated: "2026-09-01",
    dueDate: `2026-${String(index + 1).padStart(2, "0")}-09`,
    status: "CONFIRMED",
    installment: "ins_12",
    installmentNumber: index + 1,
  }));

  const result = buildFinancialProjection({
    localPayments: [{
      id: "local-total",
      student_id: "student-1",
      company_id: "company-1",
      asaas_payment_id: "pay_1",
      billing_type: "CREDIT_CARD",
      installment_count: 12,
      invoice_status: null,
      status: "CONFIRMED",
      value: 2500,
      due_date: "2026-01-09",
      created_at: "2026-01-09T10:00:00Z",
    }],
    providerPaymentsById: new Map([["pay_1", group[0]]]),
    providerGroupsById: new Map([["ins_12", group]]),
  });

  const total = result.entries.reduce((sum, entry) => sum + entry.value, 0);
  if (Math.round(total * 100) !== 250000) throw new Error(`bad provider total ${total}`);
  if (result.entries[11].value !== 208.37) throw new Error("last provider parcel rounding was lost");
});

Deno.test("unavailable provider group fails closed and does not emit partial entries", () => {
  const provider = normalizeAsaasFinancialPayment({
    id: "pay_1",
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: "2026-04-03",
    status: "CONFIRMED",
    installment: "ins_missing",
    installmentNumber: 1,
  });
  const result = buildFinancialProjection({
    localPayments: [{
      id: "local-total",
      student_id: "student-1",
      company_id: "company-1",
      asaas_payment_id: "pay_1",
      billing_type: "CREDIT_CARD",
      installment_count: 6,
      invoice_status: null,
      status: "CONFIRMED",
      value: 1380,
      due_date: "2026-04-03",
      created_at: "2026-04-03T10:00:00Z",
    }],
    providerPaymentsById: new Map([["pay_1", provider]]),
    providerGroupsById: new Map(),
    unavailableProviderGroupIds: new Set(["ins_missing"]),
  });

  if (result.entries.length !== 0) throw new Error("partial group entries must not be emitted");
  if (result.unresolved[0]?.reason !== "provider_group_unavailable") {
    throw new Error(`expected provider_group_unavailable: ${JSON.stringify(result.unresolved)}`);
  }
});

Deno.test("empty, duplicated or divergent provider groups fail closed", () => {
  const localPayment = {
    id: "local-total",
    student_id: "student-1",
    company_id: "company-1",
    asaas_payment_id: "pay_1",
    billing_type: "CREDIT_CARD",
    installment_count: 6,
    invoice_status: null,
    status: "CONFIRMED",
    value: 1380,
    due_date: "2026-04-03",
    created_at: "2026-04-03T10:00:00Z",
  };
  const provider = normalizeAsaasFinancialPayment({
    id: "pay_1",
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: "2026-04-03",
    status: "CONFIRMED",
    installment: "ins_group",
    installmentNumber: 1,
  });

  for (const groupPayments of [
    [],
    [provider, provider],
    [{ ...provider, installment: "other_group" }],
  ]) {
    const result = buildFinancialProjection({
      localPayments: [localPayment],
      providerPaymentsById: new Map([["pay_1", provider]]),
      providerGroupsById: new Map([["ins_group", groupPayments]]),
    });

    if (result.entries.length !== 0) {
      throw new Error(`invalid group emitted entries: ${JSON.stringify(groupPayments)}`);
    }
    if (result.unresolved[0]?.reason !== "provider_group_unavailable") {
      throw new Error(`invalid group should be unresolved: ${JSON.stringify(result)}`);
    }
  }
});

Deno.test("partial provider groups fail closed when local count expects more parcels", () => {
  const provider = normalizeAsaasFinancialPayment({
    id: "pay_1",
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: "2026-09-01",
    status: "CONFIRMED",
    installment: "ins_group",
    installmentNumber: 1,
  });
  const result = buildFinancialProjection({
    localPayments: [{
      id: "local-total",
      student_id: "student-1",
      company_id: "company-1",
      asaas_payment_id: "pay_1",
      billing_type: "CREDIT_CARD",
      installment_count: 6,
      invoice_status: null,
      status: "CONFIRMED",
      value: 1380,
      due_date: "2026-09-01",
      created_at: "2026-09-01T10:00:00Z",
    }],
    providerPaymentsById: new Map([["pay_1", provider]]),
    providerGroupsById: new Map([["ins_group", [provider]]]),
  });

  if (result.entries.length !== 0) throw new Error(`partial group emitted entries: ${JSON.stringify(result)}`);
  if (result.unresolved[0]?.reason !== "provider_group_unavailable") {
    throw new Error(`partial group should be unresolved: ${JSON.stringify(result)}`);
  }
});

Deno.test("groups missing the seed ordinal fail closed", () => {
  const locals = [2, 3, 4, 5, 6].map((n) => ({
    id: `local-${n}`,
    student_id: "student-1",
    company_id: "company-1",
    asaas_payment_id: `pay_${n}`,
    billing_type: "CREDIT_CARD",
    installment_count: 6,
    invoice_status: null,
    status: "CONFIRMED",
    value: 230,
    due_date: `2026-09-0${n}`,
    created_at: `2026-09-0${n}T10:00:00Z`,
  }));
  const providerPayments = [2, 3, 4, 5, 6].map((n) => normalizeAsaasFinancialPayment({
    id: `pay_${n}`,
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: `2026-09-0${n}`,
    status: "CONFIRMED",
    installment: "ins_group",
    installmentNumber: n,
  }));

  const result = buildFinancialProjection({
    localPayments: locals,
    providerPaymentsById: new Map(providerPayments.map((payment) => [payment.id, payment])),
    providerGroupsById: new Map([["ins_group", providerPayments]]),
  });

  if (result.entries.length !== 0) throw new Error(`missing seed group emitted entries: ${JSON.stringify(result)}`);
  if (result.unresolved.length !== 5) throw new Error(`expected five unresolved locals: ${JSON.stringify(result)}`);
});

Deno.test("null local installment count fails closed for provider groups", () => {
  const provider = normalizeAsaasFinancialPayment({
    id: "pay_1",
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: "2026-09-01",
    status: "CONFIRMED",
    installment: "ins_group",
    installmentNumber: 1,
  });
  const result = buildFinancialProjection({
    localPayments: [{
      id: "local-total",
      student_id: "student-1",
      company_id: "company-1",
      asaas_payment_id: "pay_1",
      billing_type: "CREDIT_CARD",
      installment_count: null,
      invoice_status: null,
      status: "CONFIRMED",
      value: 1380,
      due_date: "2026-09-01",
      created_at: "2026-09-01T10:00:00Z",
    }],
    providerPaymentsById: new Map([["pay_1", provider]]),
    providerGroupsById: new Map([["ins_group", [provider]]]),
  });

  if (result.entries.length !== 0) throw new Error(`null count emitted entries: ${JSON.stringify(result)}`);
  if (result.unresolved[0]?.reason !== "provider_group_unavailable") {
    throw new Error(`null count should be unresolved: ${JSON.stringify(result)}`);
  }
});

Deno.test("a null count in any local sibling fails the whole provider group", () => {
  const group = [1, 2, 3, 4, 5, 6].map((n) => normalizeAsaasFinancialPayment({
    id: `pay_${n}`,
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: `2026-09-0${n}`,
    status: "CONFIRMED",
    installment: "ins_group",
    installmentNumber: n,
  }));
  const locals = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: `local-${n}`,
    student_id: "student-1",
    company_id: "company-1",
    asaas_payment_id: `pay_${n}`,
    billing_type: "CREDIT_CARD",
    installment_count: n === 4 ? null : 6,
    invoice_status: null,
    status: "CONFIRMED",
    value: n === 1 ? 1380 : 230,
    due_date: `2026-09-0${n}`,
    created_at: `2026-09-0${n}T10:00:00Z`,
  }));

  const result = buildFinancialProjection({
    localPayments: locals,
    providerPaymentsById: new Map([["pay_1", group[0]]]),
    providerGroupsById: new Map([["ins_group", group]]),
  });

  if (result.entries.length !== 0) throw new Error(`null sibling count emitted entries: ${JSON.stringify(result)}`);
  if (result.unresolved.length !== 6) throw new Error(`expected whole group unresolved: ${JSON.stringify(result)}`);
});

Deno.test("credit-card locals without provider id stay explicitly unresolved", () => {
  const result = buildFinancialProjection({
    localPayments: [{
      id: "local-missing-provider",
      student_id: "student-1",
      company_id: "company-1",
      asaas_payment_id: null,
      billing_type: "CREDIT_CARD",
      installment_count: 6,
      invoice_status: null,
      status: "CONFIRMED",
      value: 1380,
      due_date: "2026-09-01",
      created_at: "2026-09-01T10:00:00Z",
    }],
    providerPaymentsById: new Map(),
    providerGroupsById: new Map(),
  });

  if (result.entries.length !== 0) throw new Error(`missing provider id emitted entries: ${JSON.stringify(result)}`);
  if (result.unresolved[0]?.reason !== "missing_asaas_payment_id") {
    throw new Error(`missing provider id should be unresolved: ${JSON.stringify(result)}`);
  }
});

Deno.test("provider group must contain every local provider id it resolves", () => {
  const localPayment = {
    id: "local-anchor",
    student_id: "student-1",
    company_id: "company-1",
    asaas_payment_id: "pay_1",
    billing_type: "CREDIT_CARD",
    installment_count: 6,
    invoice_status: null,
    status: "CONFIRMED",
    value: 1380,
    due_date: "2026-09-01",
    created_at: "2026-09-01T10:00:00Z",
  };
  const provider = normalizeAsaasFinancialPayment({
    id: "pay_1",
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: "2026-09-01",
    status: "CONFIRMED",
    installment: "ins_group",
    installmentNumber: 1,
  });
  const wrongAnchorGroup = [1, 2, 3, 4, 5, 6].map((n) => normalizeAsaasFinancialPayment({
    id: n === 1 ? "pay_wrong_anchor" : `pay_${n}`,
    billingType: "CREDIT_CARD",
    value: 230,
    dateCreated: "2026-09-01",
    dueDate: `2026-09-0${n}`,
    status: "CONFIRMED",
    installment: "ins_group",
    installmentNumber: n,
  }));

  const result = buildFinancialProjection({
    localPayments: [localPayment],
    providerPaymentsById: new Map([["pay_1", provider]]),
    providerGroupsById: new Map([["ins_group", wrongAnchorGroup]]),
  });

  if (result.entries.length !== 0) throw new Error(`wrong anchor group emitted entries: ${JSON.stringify(result)}`);
  if (result.unresolved[0]?.reason !== "provider_group_unavailable") {
    throw new Error(`wrong anchor group should be unresolved: ${JSON.stringify(result)}`);
  }
});
