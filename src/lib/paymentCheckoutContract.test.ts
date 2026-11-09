import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertInstallmentCountAllowed, maxInstallmentsForPlanDuration } from "../../supabase/functions/_shared/payment-installments";

const uiSource = readFileSync("src/pages/PublicPayment.tsx", "utf8");
const edgeSource = readFileSync("supabase/functions/asaas-integration/index.ts", "utf8");
const asaasEnvironmentSource = readFileSync(
  "supabase/functions/_shared/asaas-environment.ts",
  "utf8",
);
const installmentSource = readFileSync("supabase/functions/_shared/payment-installments.ts", "utf8");
const webhookSource = readFileSync("supabase/functions/asaas-webhook/index.ts", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260831193000_harden_payment_checkout_orders.sql", "utf8");
const lifecycleMigrationSource = readFileSync(
  "supabase/migrations/20260901123000_atomic_payment_lifecycle.sql",
  "utf8",
);
const renewalScheduleFixSource = readFileSync(
  "supabase/migrations/20260909154800_fix_paid_renewal_cycle_window.sql",
  "utf8",
);
const paymentContextSource = readFileSync(
  "supabase/functions/public-payment-context/index.ts",
  "utf8",
);
const registrationSource = readFileSync(
  "supabase/functions/public-registration/index.ts",
  "utf8",
);
const billingCountryMigrationSource = readFileSync(
  "supabase/migrations/20260903193000_separate_contact_and_billing_country.sql",
  "utf8",
);

describe("public credit-card checkout contract", () => {
  it("fails closed unless the Asaas base URL is an explicitly allowed environment", () => {
    expect(edgeSource).toContain('resolveAsaasApiConfig(Deno.env.get("ASAAS_BASE_URL"))');
    expect(edgeSource).toContain("asaasApiUrl(config, path)");
    expect(edgeSource).not.toContain('const ASAAS_BASE_URL = "https://api.asaas.com/v3"');
    expect(webhookSource).toContain('resolveAsaasApiConfig(Deno.env.get("ASAAS_BASE_URL"))');
    expect(webhookSource).toContain("asaasApiUrl(asaasConfig,");
    expect(webhookSource).not.toContain('const ASAAS_BASE_URL = "https://api.asaas.com/v3"');
    expect(asaasEnvironmentSource).toContain('"https://api.asaas.com/v3"');
    expect(asaasEnvironmentSource).toContain('"https://api-sandbox.asaas.com/v3"');
  });

  it("authenticates the webhook before resolving or calling the configured Asaas environment", () => {
    const handler = webhookSource.slice(webhookSource.indexOf("Deno.serve"));
    expect(handler.indexOf('token !== ASAAS_WEBHOOK_TOKEN')).toBeLessThan(
      handler.indexOf("const asaasConfig = requireAsaasApiConfig()"),
    );
    expect(handler.indexOf("const asaasConfig = requireAsaasApiConfig()")).toBeLessThan(
      handler.indexOf("const remotePaymentResponse = await fetch"),
    );
  });

  it("does not write the raw fiscal provider response to webhook logs", () => {
    const createInvoice = webhookSource.slice(
      webhookSource.indexOf("async function createInvoice"),
      webhookSource.indexOf("Deno.serve"),
    );
    expect(createInvoice).not.toContain('JSON.stringify(data)');
    expect(createInvoice).toContain('providerErrorCode');
    expect(createInvoice).toContain('providerStatus');
  });

  it("offers credit card to first purchases as well as renewals", () => {
    const chooser = uiSource.slice(uiSource.indexOf('{step === "choose"'), uiSource.indexOf('{step === "pix"'));
    expect(chooser).toContain("Pagar com Cartão");
    expect(chooser).not.toContain("{isRenewal &&");
  });

  it("keeps the WhatsApp country separate from the Brazilian billing profile", () => {
    expect(billingCountryMigrationSource).toContain("billing_country_code");
    expect(billingCountryMigrationSource).toContain("billing_name");
    expect(billingCountryMigrationSource).toContain("billing_cpf_cnpj");
    expect(paymentContextSource).toContain('action === "set-brazilian-billing-profile"');
    expect(paymentContextSource).toContain('billing_country_code: "BR"');
    expect(paymentContextSource).not.toMatch(/\n\s+country_code:\s*"BR"/);
    expect(edgeSource).toContain("effectiveBillingCountryCode(student)");
    expect(edgeSource).toContain("resolveBrazilianBillingProfile(student)");
    expect(edgeSource).toContain("domesticAsaasMobilePhone(student)");
    expect(edgeSource).toContain('billingField(student, "billing_cpf_cnpj", "cpf")');
    expect(uiSource).toContain("DADOS DE COBRANÇA NO BRASIL");
    const profileAction = paymentContextSource.slice(
      paymentContextSource.indexOf("async function setBrazilianBillingProfile"),
      paymentContextSource.indexOf("Deno.serve"),
    );
    expect(profileAction).not.toMatch(/\n\s+(cpf|cep|address|phone|whatsapp|country_code):/);
  });

  it("lets an international contact reach checkout without pretending the payer is Brazilian", () => {
    expect(registrationSource).toContain("billingPayloadForRegistration");
    expect(registrationSource).toContain("const paymentLink = await createPaymentLink");
    expect(registrationSource).not.toContain("manualPaymentRequired: true");
    expect(uiSource).toContain('disabled={loading || billingCountryCode !== "BR"}');
  });

  it("enforces the typed company installment policy from the authoritative plan duration", () => {
    expect(edgeSource).toContain("assertInstallmentCountAllowed");
    expect(edgeSource).toContain("getCompanyProductSettings(supabaseAdmin as unknown as SettingsReadClient, student.company_id)");
    expect(edgeSource).toContain("plan.duration_weeks");
    expect(installmentSource).toContain("Quantidade de parcelas não permitida para este plano");
    for (const [weeks,limit] of [[6,1],[24,6],[48,12]]) {
      expect(maxInstallmentsForPlanDuration(weeks)).toBe(limit);
      expect(assertInstallmentCountAllowed(limit,weeks)).toBe(limit);
      expect(() => assertInstallmentCountAllowed(limit+1,weeks)).toThrow();
    }
    const policy = { installments_short:1,installments_medium:3,installments_long:8 };
    expect(assertInstallmentCountAllowed(3,24,policy)).toBe(3);
    expect(() => assertInstallmentCountAllowed(4,24,policy)).toThrow();
    expect(() => assertInstallmentCountAllowed(9,48,policy)).toThrow();
    expect(maxInstallmentsForPlanDuration(12,policy)).toBe(1);
  });

  it("uses the authoritative total for installments and never trusts a client installment value", () => {
    const start = edgeSource.indexOf("async function createCardPayment");
    const end = edgeSource.indexOf("async function createInvoice", start);
    const handler = edgeSource.slice(start, end);
    expect(handler).toContain("paymentPayload.totalValue = Number(value)");
    expect(handler).not.toContain("paymentPayload.installmentValue");
    expect(handler).not.toContain("paymentPayload.interest");
    expect(uiSource).toContain("Sem juros para você");
    expect(uiSource).toContain("planValue / installments");
  });

  it("creates an idempotent local order and snapshots the plan before calling Asaas", () => {
    const start = edgeSource.indexOf("async function createCardPayment");
    const end = edgeSource.indexOf("async function createInvoice", start);
    const handler = edgeSource.slice(start, end);
    expect(handler.indexOf('status: "CREATING"')).toBeLessThan(handler.indexOf('asaasFetch("/payments"'));
    expect(handler).toContain("checkout_request_key: checkoutRequestKey");
    expect(handler).toContain("plan_id: plan.id");
    expect(migrationSource).toContain("payments_checkout_request_key_unique");
  });

  it("activates from the payment snapshot and scopes lifecycle writes to the company", () => {
    expect(webhookSource).toContain('select("student_id, company_id, plan_id, enrollment_id")');
    expect(webhookSource).toContain('"apply_paid_payment_lifecycle"');
    expect(webhookSource.indexOf('"apply_paid_payment_lifecycle"')).toBeLessThan(
      webhookSource.indexOf("await claimFunnelEvent"),
    );
    expect(webhookSource).not.toContain("ensureEnrollmentExists");
    expect(webhookSource).toContain('.eq("company_id", companyId)');
  });

  it("asks the provider to retry a concurrent or locally missing webhook", () => {
    expect(webhookSource).toContain('eventClaim === "processing"');
    expect(webhookSource).toContain("status: 409");
    expect(webhookSource).toContain("Pagamento confirmado no provedor, mas não encontrado localmente.");
    expect(webhookSource).toContain("Falha ao concluir evento Asaas");
  });

  it("releases the Pix idempotency key after a terminal provider status", () => {
    const start = edgeSource.indexOf("async function createPayment");
    const end = edgeSource.indexOf("async function getPixQrCode", start);
    const handler = edgeSource.slice(start, end);
    expect(handler).toContain('.update({ checkout_request_key: null })');
    expect(handler).toContain('throw new HttpError(409, "A cobrança Pix anterior ainda está sendo conciliada.")');
    expect(handler).toContain("plan:${plan.id}:${billingType}");
    expect(handler.indexOf('status: "CREATING"')).toBeLessThan(handler.indexOf('asaasFetch("/payments"'));
  });

  it("does not infer the paid plan from the student's current selection during sync", () => {
    const start = edgeSource.indexOf("async function syncPayments");
    const handler = edgeSource.slice(start);
    expect(handler).toContain("applyPaymentStatusEffects(student.id, providerStatus, ap.id, existing.plan_id, existing.company_id)");
    expect(handler).not.toContain("student.selected_plan_id");
    expect(migrationSource).not.toContain("set plan_id = s.selected_plan_id");
  });

  it("scopes fallback overdue and refund writes to the payment company", () => {
    const start = edgeSource.indexOf("async function applyPaymentStatusEffects");
    const end = edgeSource.indexOf("async function getPaymentStatus", start);
    const handler = edgeSource.slice(start, end);
    expect(handler).toContain('rpc("apply_asaas_payment_reversal"');
    expect(handler).toContain("_company_id: companyId");
    expect(handler).toContain("_asaas_payment_id: asaasPaymentId");
  });

  it("blocks confirmed fallback lifecycle when the immutable paid plan is missing", () => {
    expect(edgeSource).toContain("Pagamento confirmado sem snapshot imutável do plano");
    expect(edgeSource).toContain("Pagamento confirmado, mas o plano pago precisa de conciliação manual");
  });

  it("keeps initial checkout links separate and shares one payment key per renewal", () => {
    expect(paymentContextSource).toContain('action === "create-renewal-link"');
    expect(paymentContextSource).toContain('.is("renewal_of_enrollment_id", null)');
    expect(registrationSource).toContain('.is("renewal_of_enrollment_id", null)');
    expect(edgeSource).toContain("body.renewalOfEnrollmentId = link.renewal_of_enrollment_id");
    expect(edgeSource.match(/checkout:\$\{body.checkoutToken\}:renewal/g)).toHaveLength(2);
    expect(edgeSource.match(/assertRenewalPaymentChoice\(existingPayment/g)).toHaveLength(2);
  });

  it("applies the local lifecycle before reused or reconciled paid checkouts return success", () => {
    expect(edgeSource.match(/\.select\("id, student_id, company_id, plan_id, asaas_payment_id, status, invoice_url, billing_type, installment_count"\)/g))
      .toHaveLength(2);
    expect(edgeSource.match(/await applyExistingPaymentLifecycle\(/g)?.length).toBe(4);

    const helperStart = edgeSource.indexOf("async function applyExistingPaymentLifecycle");
    const helperEnd = edgeSource.indexOf("async function createPayment", helperStart);
    const helper = edgeSource.slice(helperStart, helperEnd);
    expect(helper).toContain("assertExistingPaymentScope");
    expect(helper).toContain("PAID_PAYMENT_STATUSES.has(status)");
    expect(helper).toContain("existingPayment.plan_id !== expectedPlanId");
    expect(helper).toContain("await applyPaymentStatusEffects(");
    expect(helper).toContain("existingPayment.company_id");

    const lifecycleStart = edgeSource.indexOf("async function applyPaymentStatusEffects");
    const lifecycleEnd = edgeSource.indexOf("async function getPaymentStatus", lifecycleStart);
    const lifecycle = edgeSource.slice(lifecycleStart, lifecycleEnd);
    expect(lifecycle).toContain('"apply_paid_payment_lifecycle"');
    expect(lifecycle).toContain("Pagamento confirmado sem matrícula local aplicada");
    expect(lifecycle.indexOf('"apply_paid_payment_lifecycle"')).toBeLessThan(
      lifecycle.indexOf("await claimFunnelEvent"),
    );
    expect(edgeSource.match(/await ensureEnrollmentExists\(/g)).toBeNull();

    expect(lifecycleMigrationSource).toContain("for update");
    expect(lifecycleMigrationSource).toContain("lifecycle_applied_at");
    expect(lifecycleMigrationSource).toContain("v_payment.lifecycle_applied_at is not null");
    expect(lifecycleMigrationSource).toContain("set end_date = v_new_end");
    expect(lifecycleMigrationSource).not.toContain("_business_date + 5");
    expect(lifecycleMigrationSource).toContain("lifecycle_enrollment_id = v_enrollment_id");
    expect(lifecycleMigrationSource).toContain("return query select v_enrollment_id, v_first_activation, false");
  });

  it("keeps the paid RPC argument but never derives assessment timing from payment", () => {
    for (const source of [edgeSource, webhookSource]) {
      expect(source).toContain("_assessment_due_date: null");
      expect(source).not.toMatch(/assessmentDeadline|formattedDueDate|assessment_due_at:/);
      expect(source).toContain("assessment_instructions:${asaasPaymentId}");
      expect(source).toMatch(/if \([\s\n]*isFirstActivation\b/);
    }
  });

  it("starts a paid renewal after the financial term instead of a stale cycle tail", () => {
    expect(renewalScheduleFixSource).toContain("create or replace function public.apply_paid_payment_lifecycle");
    expect(renewalScheduleFixSource).toContain("v_cycle_start := v_extension_start + 1");
    expect(renewalScheduleFixSource).not.toContain("v_cycle_start := coalesce(v_last_cycle_end + 1");
    expect(renewalScheduleFixSource).not.toContain("v_last_cycle_end");
    expect(renewalScheduleFixSource).toContain("v_new_end := v_extension_start + v_plan_days");
    expect(renewalScheduleFixSource).toContain("lifecycle_applied_at");
  });
});
