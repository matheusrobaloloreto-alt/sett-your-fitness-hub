import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { isSecondaryCardInstallment, matchesSecondaryInstallmentOrder, secondaryInstallmentOrderId } from "./asaas-installment-webhook.ts";

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
