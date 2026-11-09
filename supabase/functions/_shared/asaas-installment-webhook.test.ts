import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { isSecondaryCardInstallment, matchesLinkedSecondaryInstallment, matchesSecondaryInstallmentOrder, secondaryInstallmentOrderId, uniquePrimaryCardCharge } from "./asaas-installment-webhook.ts";

const order = {
  id: "7b1306ef-dd14-433d-aa44-7b7f7c6cd232", company_id: "company", student_id: "student",
  asaas_customer_id: "cus_fixture", asaas_payment_id: "pay_first", billing_type: "CREDIT_CARD", installment_count: 3,
};
const primary = { id: "pay_first", customer: "cus_fixture", billingType: "CREDIT_CARD", installment: "group", installmentNumber: 1, externalReference: "sett-payment:" + order.id };
const secondary = { ...primary, id: "pay_second", installmentNumber: 2 };

Deno.test("links an authenticated secondary installment to the same checkout without using the primary path", () => {
  assert(isSecondaryCardInstallment(secondary));
  assertEquals(secondaryInstallmentOrderId(secondary), order.id);
  assert(matchesSecondaryInstallmentOrder(secondary, order, primary));
  assertFalse(isSecondaryCardInstallment(primary));
  assertFalse(isSecondaryCardInstallment({ ...secondary, billingType: "PIX" }));
});

Deno.test("rejects secondary events with an unrelated checkout, customer, group, or primary", () => {
  for (const [field, value] of Object.entries({
    customer: "cus_other", installment: "other-group", externalReference: "unrelated",
    id: "pay_first", installmentNumber: 4,
  })) assertFalse(matchesSecondaryInstallmentOrder({ ...secondary, [field]: value }, order, primary));
  assertFalse(matchesSecondaryInstallmentOrder(secondary, { ...order, company_id: null }, primary));
  assertFalse(matchesSecondaryInstallmentOrder(secondary, order, { ...primary, installmentNumber: 2 }));
});


Deno.test("an early delivery verifies the primary even before its ID is stored", () => {
  const result = uniquePrimaryCardCharge([secondary, primary], primary.externalReference, order.asaas_customer_id, 3);
  assertEquals(result?.id, primary.id);
  assert(result && matchesSecondaryInstallmentOrder(secondary, { ...order, asaas_payment_id: null }, result));
  assertEquals(uniquePrimaryCardCharge([secondary], primary.externalReference, order.asaas_customer_id, 3), null);
  assertEquals(uniquePrimaryCardCharge([primary, { ...primary, id: "pay_other" }], primary.externalReference, order.asaas_customer_id, 3), null);
});

Deno.test("legacy secondary updates require a local tenant, student and the exact provider charge and customer", () => {
  const legacy = { ...order, asaas_payment_id: secondary.id };
  assert(matchesLinkedSecondaryInstallment({ ...secondary, externalReference: null }, legacy));
  assertFalse(matchesLinkedSecondaryInstallment({ ...secondary, customer: "cus_other" }, legacy));
  assertFalse(matchesLinkedSecondaryInstallment(secondary, { ...legacy, company_id: null }));
  assertFalse(matchesLinkedSecondaryInstallment(primary, legacy));
});
