import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { businessDateYmd } from "../_shared/business-date.ts";
import { effectiveBillingCountryCode, supportsAsaasBilling } from "../_shared/fiscal-registration.ts";
import { assertInstallmentCountAllowed, maxInstallmentsForPlanDuration } from "../_shared/payment-installments.ts";
import {
  asaasApiUrl,
  type AsaasApiConfig,
  resolveAsaasApiConfig,
} from "../_shared/asaas-environment.ts";
import {
  addBusinessDays,
  buildAssessmentOnboardingMessage,
  claimFunnelEvent,
  completeFunnelEvent,
  isoDate,
  sendFunnelWhatsAppMessage,
} from "../_shared/sales-funnel.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function domesticAsaasMobilePhone(student: Record<string, unknown>): string | undefined {
  if (!supportsAsaasBilling(effectiveBillingCountryCode(student))) return undefined;
  const contactIsBrazilian = String(student.country_code || "").toUpperCase() === "BR";
  let phone = String(student.billing_phone || (contactIsBrazilian ? student.whatsapp || student.phone : "") || "").replace(/\D/g, "");
  if (phone.startsWith("55") && (phone.length === 12 || phone.length === 13)) phone = phone.slice(2);
  const valid = phone.length === 10 || (phone.length === 11 && phone[2] === "9");
  return valid ? phone : undefined;
}

function billingField(student: Record<string, unknown>, billingKey: string, legacyKey: string): string {
  const billing = String(student[billingKey] || "").trim();
  if (billing) return billing;
  const contactIsBrazilian = String(student.country_code || "").trim().toUpperCase() === "BR";
  return contactIsBrazilian ? String(student[legacyKey] || "").trim() : "";
}

function resolveBrazilianBillingProfile(student: Record<string, unknown>) {
  if (!supportsAsaasBilling(effectiveBillingCountryCode(student))) {
    throw new HttpError(422, "Pagamento internacional não é processado automaticamente. Confirme um pagador brasileiro ou fale com a equipe.");
  }
  const profile = {
    name: billingField(student, "billing_name", "full_name"),
    email: billingField(student, "billing_email", "email"),
    cpfCnpj: billingField(student, "billing_cpf_cnpj", "cpf").replace(/\D/g, ""),
    postalCode: billingField(student, "billing_postal_code", "cep").replace(/\D/g, ""),
    address: billingField(student, "billing_address", "address"),
    addressNumber: billingField(student, "billing_address_number", "address_number"),
    province: billingField(student, "billing_neighborhood", "neighborhood"),
    mobilePhone: domesticAsaasMobilePhone(student),
  };
  if (!profile.name || ![11, 14].includes(profile.cpfCnpj.length) || profile.postalCode.length !== 8
    || !profile.address || !profile.addressNumber || !profile.province) {
    throw new HttpError(422, "Complete os dados brasileiros do pagador antes de gerar a cobrança.");
  }
  return profile;
}

function requireAsaasApiConfig(): AsaasApiConfig {
  try {
    return resolveAsaasApiConfig(Deno.env.get("ASAAS_BASE_URL"));
  } catch {
    throw new HttpError(503, "Ambiente Asaas não configurado com segurança.");
  }
}

async function asaasFetch(path: string, options: RequestInit = {}) {
  if (!ASAAS_API_KEY) throw new HttpError(503, "Integração Asaas não configurada no servidor.");
  const config = requireAsaasApiConfig();
  const res = await fetch(asaasApiUrl(config, path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `SETT-BNApp/1.0 (Supabase Edge; ${config.environment})`,
      access_token: ASAAS_API_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const firstErr = data.errors?.[0];
    console.error("Asaas API error", {
      status: res.status,
      code: firstErr?.code || null,
      endpoint: path.split("?")[0],
    });
    const msg = firstErr
      ? `${firstErr.description || "Erro"}${firstErr.code ? ` (${firstErr.code})` : ""}`
      : data.message || `Erro na API do Asaas (HTTP ${res.status})`;
    throw new HttpError(res.status >= 500 ? 502 : 422, msg);
  }
  return data;
}

async function checkConnection() {
  const config = requireAsaasApiConfig();
  await asaasFetch("/customers?limit=1&offset=0");
  return {
    connected: true,
    environment: config.environment,
  };
}

async function requireAdminTenant(req: Request, body: any) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "Unauthorized");

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) throw new HttpError(401, "Unauthorized");
  const userId = claimsData.claims.sub as string;

  const roleResults = await Promise.all([
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "master" }),
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "coordinator" }),
    supabaseAdmin.rpc("get_user_company_id", { _user_id: userId }),
  ]);
  const failedCheck = roleResults.find((result) => result.error);
  if (failedCheck?.error) {
    throw new HttpError(503, `Falha ao validar permissões: ${failedCheck.error.message}`);
  }
  const [{ data: hasMaster }, { data: hasAdmin }, { data: hasCoord }, { data: userCompanyId }] = roleResults;
  if (!hasMaster && !hasAdmin && !hasCoord) throw new HttpError(403, "Forbidden");

  let targetCompanyId = typeof body.companyId === "string" && body.companyId ? body.companyId : null;
  if (targetCompanyId && !UUID_RE.test(targetCompanyId)) throw new HttpError(400, "companyId inválido.");

  if (body.studentId) {
    if (!UUID_RE.test(body.studentId)) throw new HttpError(400, "studentId inválido.");
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("company_id")
      .eq("id", body.studentId)
      .maybeSingle();
    if (!student?.company_id) throw new HttpError(404, "Aluno não encontrado.");
    if (targetCompanyId && targetCompanyId !== student.company_id) throw new HttpError(403, "Forbidden: student/company mismatch.");
    targetCompanyId = student.company_id;
  }

  if (body.paymentId) {
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("company_id")
      .eq("asaas_payment_id", body.paymentId)
      .maybeSingle();
    if (!payment?.company_id) throw new HttpError(404, "Pagamento local não encontrado.");
    if (targetCompanyId && targetCompanyId !== payment.company_id) throw new HttpError(403, "Forbidden: payment/company mismatch.");
    targetCompanyId = payment.company_id;
  }

  if (!targetCompanyId) throw new HttpError(400, "Selecione uma empresa.");
  if (!hasMaster && targetCompanyId !== userCompanyId) throw new HttpError(403, "Forbidden: company mismatch.");
  return { companyId: targetCompanyId };
}

async function requireCheckoutToken(body: any, action: string) {
  const token = typeof body.checkoutToken === "string" ? body.checkoutToken : "";
  if (!UUID_RE.test(token)) throw new HttpError(401, "Link de pagamento inválido.");

  const { data: link, error: linkError } = await supabaseAdmin
    .from("public_payment_links")
    .select("id, student_id, company_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (linkError) throw new HttpError(500, `Falha ao validar link de pagamento: ${linkError.message}`);
  if (!link) throw new HttpError(401, "Link de pagamento inválido.");
  if (link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    throw new HttpError(410, "Este link de pagamento expirou. Solicite um novo link ao seu treinador.");
  }

  if (body.studentId && body.studentId !== link.student_id) {
    throw new HttpError(403, "Forbidden: student mismatch.");
  }
  body.studentId = link.student_id;
  body.companyId = link.company_id;

  if (action === "get-pix-qrcode" || action === "get-payment-status") {
    if (typeof body.paymentId !== "string" || !body.paymentId) {
      throw new HttpError(400, "paymentId é obrigatório.");
    }
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("asaas_payment_id", body.paymentId)
      .eq("student_id", link.student_id)
      .eq("company_id", link.company_id)
      .maybeSingle();
    if (paymentError) throw new HttpError(500, `Falha ao validar pagamento: ${paymentError.message}`);
    if (!payment) throw new HttpError(403, "Pagamento não pertence a este link.");
  }

  const { error: touchError } = await supabaseAdmin
    .from("public_payment_links")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", link.id);
  if (touchError) console.error("asaas-integration: failed to touch checkout link", touchError);
  return { studentId: link.student_id, companyId: link.company_id };
}

async function createCustomer(body: any) {
  const { studentId, name, email, cpfCnpj, mobilePhone, postalCode, address, addressNumber, province, cityName, state } = body;
  if (!studentId || !name || !cpfCnpj) {
    throw new Error("studentId, name e cpfCnpj são obrigatórios");
  }

  // Check if student already has asaas_customer_id
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("asaas_customer_id")
    .eq("id", studentId)
    .single();

  if (student?.asaas_customer_id) {
    return { customerId: student.asaas_customer_id };
  }

  const customerPayload: any = {
    name,
    email: email || undefined,
    cpfCnpj: cpfCnpj.replace(/\D/g, ""),
    mobilePhone: mobilePhone?.replace(/\D/g, "") || undefined,
    externalReference: studentId,
  };

  if (postalCode) customerPayload.postalCode = postalCode.replace(/\D/g, "");
  if (address) customerPayload.address = address;
  if (addressNumber) customerPayload.addressNumber = addressNumber;
  if (province) customerPayload.province = province;

  const customer = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify(customerPayload),
  });

  // Save asaas_customer_id on student
  await supabaseAdmin
    .from("students")
    .update({ asaas_customer_id: customer.id })
    .eq("id", studentId);

  return { customerId: customer.id };
}

async function updateCustomer(body: any) {
  const { studentId, name, email, cpfCnpj, mobilePhone, postalCode, address, addressNumber, province } = body;
  if (!studentId) throw new Error("studentId é obrigatório");

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("asaas_customer_id")
    .eq("id", studentId)
    .single();

  if (!student?.asaas_customer_id) {
    throw new Error("Cliente Asaas não encontrado para este aluno.");
  }

  const payload: any = {};
  if (name) payload.name = name;
  if (email) payload.email = email;
  if (cpfCnpj) payload.cpfCnpj = cpfCnpj.replace(/\D/g, "");
  if (mobilePhone) payload.mobilePhone = mobilePhone.replace(/\D/g, "");
  if (postalCode) payload.postalCode = postalCode.replace(/\D/g, "");
  if (address) payload.address = address;
  if (addressNumber) payload.addressNumber = addressNumber;
  if (province) payload.province = province;

  const customer = await asaasFetch(`/customers/${student.asaas_customer_id}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return { customerId: customer.id, updated: true };
}


// SECURITY: never trust a client-supplied amount. Derive the authoritative price from the plan
// in the DB (validated against the student's company). Public payment flows always send planId,
// so this fails closed when a plan/price cannot be resolved.
async function resolvePlanPrice(student: any, planId?: string) {
  const effectivePlanId = planId || student?.selected_plan_id;
  if (!effectivePlanId) {
    throw new Error("Plano não informado para o pagamento.");
  }
  const { data: plan } = await supabaseAdmin
    .from("plans")
    .select("id, name, price, duration_weeks, company_id, is_active, plan_kind")
    .eq("id", effectivePlanId)
    .maybeSingle();
  if (!plan || plan.price == null || !plan.is_active || plan.plan_kind !== "standard") {
    throw new Error("Plano inválido, inativo ou sem preço definido.");
  }
  if (plan.company_id && student?.company_id && plan.company_id !== student.company_id) {
    throw new Error("Plano não pertence à empresa do aluno.");
  }
  const price = Number(plan.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Plano sem valor de cobrança válido.");
  }
  return { ...plan, price };
}

const PAID_PAYMENT_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

type ExistingCheckoutPayment = {
  id: string;
  student_id?: string | null;
  company_id?: string | null;
  plan_id?: string | null;
  asaas_payment_id?: string | null;
  status?: string | null;
};

function assertExistingPaymentScope(
  existingPayment: ExistingCheckoutPayment,
  expectedStudentId: string,
  expectedCompanyId: string | null,
): asserts existingPayment is ExistingCheckoutPayment & {
  student_id: string;
  company_id: string;
} {
  if (
    !existingPayment.student_id ||
    !existingPayment.company_id ||
    existingPayment.student_id !== expectedStudentId ||
    existingPayment.company_id !== expectedCompanyId
  ) {
    throw new HttpError(409, "A cobrança existente não pertence ao aluno e à empresa deste checkout.");
  }
}

async function applyExistingPaymentLifecycle(
  existingPayment: ExistingCheckoutPayment,
  providerPayment: { id?: string | null; status?: string | null },
  expectedStudentId: string,
  expectedCompanyId: string | null,
  expectedPlanId: string,
) {
  assertExistingPaymentScope(existingPayment, expectedStudentId, expectedCompanyId);

  const status = providerPayment.status || existingPayment.status || "";
  if (!PAID_PAYMENT_STATUSES.has(status)) return;
  if (!existingPayment.plan_id || existingPayment.plan_id !== expectedPlanId) {
    throw new HttpError(409, "Pagamento confirmado, mas o plano pago precisa de conciliação manual.");
  }

  const providerPaymentId = providerPayment.id || existingPayment.asaas_payment_id;
  if (!providerPaymentId) {
    throw new HttpError(409, "Pagamento confirmado sem identificador do provedor para conciliação.");
  }

  await applyPaymentStatusEffects(
    existingPayment.student_id,
    status,
    providerPaymentId,
    existingPayment.plan_id,
    existingPayment.company_id,
  );
}

async function createPayment(body: any) {
  const { studentId, billingType, dueDate, description, planId } = body;
  if (!studentId || !billingType) {
    throw new Error("studentId e billingType são obrigatórios");
  }
  if (body.checkoutToken && billingType !== "PIX") {
    throw new HttpError(400, "O link público aceita somente Pix nesta operação.");
  }
  if (!["PIX", "BOLETO", "UNDEFINED"].includes(billingType)) {
    throw new HttpError(400, "Forma de pagamento inválida.");
  }

  // Get customer id
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("asaas_customer_id, company_id, selected_plan_id, full_name, email, cpf, phone, whatsapp, cep, address, address_number, neighborhood, city, state, country_code, billing_country_code, billing_name, billing_email, billing_cpf_cnpj, billing_postal_code, billing_address, billing_address_number, billing_neighborhood, billing_phone")
    .eq("id", studentId)
    .single();

  if (!student) {
    throw new Error("Aluno não encontrado.");
  }
  const billingProfile = resolveBrazilianBillingProfile(student);

  // SECURITY: amount comes from the plan in the DB, never from the client body.
  const plan = await resolvePlanPrice(student, planId);
  const value = plan.price;
  const paymentDueDate = dueDate || businessDateYmd();
  const checkoutRequestKey = body.checkoutToken
    ? `checkout:${body.checkoutToken}:plan:${plan.id}:${billingType}`
    : null;

  // A retry in the same checkout/day must not create another Pix charge.
  if (checkoutRequestKey) {
    const { data: existingPayment, error: existingError } = await supabaseAdmin
      .from("payments")
      .select("id, student_id, company_id, plan_id, asaas_payment_id, status, invoice_url")
      .eq("checkout_request_key", checkoutRequestKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new HttpError(500, `Falha ao verificar cobrança pendente: ${existingError.message}`);
    if (existingPayment?.asaas_payment_id) {
      assertExistingPaymentScope(existingPayment, studentId, student.company_id);
      const providerPayment = await asaasFetch(`/payments/${existingPayment.asaas_payment_id}`);
      const { error: updateError } = await supabaseAdmin
        .from("payments")
        .update({
          status: providerPayment.status || existingPayment.status,
          invoice_url: providerPayment.invoiceUrl || existingPayment.invoice_url,
          asaas_invoice_url: providerPayment.invoiceUrl || existingPayment.invoice_url,
        })
        .eq("asaas_payment_id", existingPayment.asaas_payment_id)
        .eq("company_id", student.company_id);
      if (updateError) throw new HttpError(500, "Cobrança confirmada no provedor, mas pendente de conciliação local.");
      if (["PENDING", "RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(providerPayment.status)) {
        await applyExistingPaymentLifecycle(
          existingPayment,
          providerPayment,
          studentId,
          student.company_id,
          plan.id,
        );
        return {
          paymentId: existingPayment.asaas_payment_id,
          status: providerPayment.status,
          invoiceUrl: providerPayment.invoiceUrl || existingPayment.invoice_url,
          reused: true,
        };
      }
      const { error: releaseError } = await supabaseAdmin
        .from("payments")
        .update({ checkout_request_key: null })
        .eq("id", existingPayment.id)
        .eq("company_id", student.company_id);
      if (releaseError) throw new HttpError(500, "Falha ao liberar uma nova tentativa Pix.");
    } else if (existingPayment) {
      assertExistingPaymentScope(existingPayment, studentId, student.company_id);
      const reconciliation = await asaasFetch(
        `/payments?externalReference=${encodeURIComponent(`sett-payment:${existingPayment.id}`)}&limit=1&offset=0`,
      );
      const reconciled = Array.isArray(reconciliation?.data) ? reconciliation.data[0] : null;
      if (reconciled?.id) {
        const { error: updateError } = await supabaseAdmin.from("payments").update({
          asaas_payment_id: reconciled.id,
          status: reconciled.status || existingPayment.status,
          invoice_url: reconciled.invoiceUrl || null,
          asaas_invoice_url: reconciled.invoiceUrl || null,
        }).eq("id", existingPayment.id).eq("company_id", student.company_id);
        if (updateError) throw new HttpError(500, "Cobrança confirmada no provedor, mas pendente de conciliação local.");
        await applyExistingPaymentLifecycle(
          existingPayment,
          reconciled,
          studentId,
          student.company_id,
          plan.id,
        );
        return {
          paymentId: reconciled.id,
          status: reconciled.status,
          invoiceUrl: reconciled.invoiceUrl || null,
          reconciled: true,
        };
      }
      throw new HttpError(409, "A cobrança Pix anterior ainda está sendo conciliada.");
    }
  }

  // Auto-create Asaas customer if missing
  if (!student.asaas_customer_id) {
    console.log(`[PAYMENT] Auto-creating Asaas customer for student ${studentId}`);
    const { customerId } = await createCustomer({
      studentId,
      ...billingProfile,
      cityName: student.city || undefined,
      state: student.state || undefined,
    });
    student.asaas_customer_id = customerId;
  } else {
    await updateCustomer({
      studentId,
      ...billingProfile,
    });
  }

  const { data: localOrder, error: orderError } = await supabaseAdmin.from("payments").insert({
    student_id: studentId,
    company_id: student.company_id || null,
    asaas_customer_id: student.asaas_customer_id,
    billing_type: billingType,
    payment_method: billingType,
    amount: Number(value),
    value: Number(value),
    status: "CREATING",
    due_date: paymentDueDate,
    installment_count: 1,
    notes: checkoutRequestKey,
    checkout_request_key: checkoutRequestKey,
    plan_id: plan.id,
    plan_name_snapshot: plan.name,
    plan_duration_weeks_snapshot: plan.duration_weeks,
  }).select("id").single();
  if (orderError || !localOrder) {
    if (orderError?.code === "23505") throw new HttpError(409, "A cobrança Pix já está em processamento.");
    throw new HttpError(500, "Falha ao preparar cobrança Pix.");
  }

  let payment: any;
  try {
    payment = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: student.asaas_customer_id,
        billingType,
        value: Number(value),
        dueDate: paymentDueDate,
        description: description || "Plano BN Performance Training",
        externalReference: `sett-payment:${localOrder.id}`,
      }),
    });
  } catch (error) {
    const isDefinitiveFailure = error instanceof HttpError && error.status < 500;
    await supabaseAdmin.from("payments").update({
      status: isDefinitiveFailure ? "FAILED" : "RECONCILIATION_PENDING",
      checkout_request_key: isDefinitiveFailure ? null : checkoutRequestKey,
    }).eq("id", localOrder.id);
    throw error;
  }

  const { error: updateError } = await supabaseAdmin.from("payments").update({
    asaas_payment_id: payment.id,
    status: payment.status || "PENDING",
    due_date: payment.dueDate || paymentDueDate,
    asaas_invoice_url: payment.invoiceUrl || null,
    invoice_url: payment.invoiceUrl || null,
  }).eq("id", localOrder.id);
  if (updateError) throw new HttpError(500, "Cobrança Pix criada, mas pendente de conciliação local.");

  // Ativar aluno automaticamente se pagamento já confirmado
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status)) {
    await applyPaymentStatusEffects(studentId, payment.status, payment.id, plan.id);
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    invoiceUrl: payment.invoiceUrl,
  };
}

async function getPixQrCode(body: any) {
  const { paymentId } = body;
  if (!paymentId) throw new Error("paymentId é obrigatório");

  const data = await asaasFetch(`/payments/${paymentId}/pixQrCode`);
  if (!data?.encodedImage || !data?.payload) {
    throw new HttpError(502, "O Asaas não retornou um QR Code Pix válido.");
  }
  const { error: updateError } = await supabaseAdmin
    .from("payments")
    .update({
      asaas_pix_qr_code: data.encodedImage,
      asaas_pix_payload: data.payload,
    })
    .eq("asaas_payment_id", paymentId);
  if (updateError) console.error("Falha ao persistir QR Code Pix:", updateError.message);
  return {
    encodedImage: data.encodedImage,
    payload: data.payload,
    expirationDate: data.expirationDate,
  };
}

async function createCardPayment(body: any) {
  const {
    studentId,
    dueDate,
    description,
    creditCard,
    creditCardHolderInfo,
    remoteIp,
    installmentCount,
    planId,
  } = body;

  if (!studentId || !creditCard || !creditCardHolderInfo) {
    throw new Error("Dados incompletos para pagamento com cartão");
  }

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("asaas_customer_id, company_id, selected_plan_id, full_name, email, cpf, phone, whatsapp, cep, address, address_number, neighborhood, city, state, country_code, billing_country_code, billing_name, billing_email, billing_cpf_cnpj, billing_postal_code, billing_address, billing_address_number, billing_neighborhood, billing_phone")
    .eq("id", studentId)
    .single();

  if (!student) {
    throw new Error("Aluno não encontrado.");
  }
  const billingProfile = resolveBrazilianBillingProfile(student);

  // SECURITY: amount comes from the plan in the DB, never from the client body.
  const plan = await resolvePlanPrice(student, planId);
  const value = plan.price;
  const allowedInstallmentCount = assertInstallmentCountAllowed(
    installmentCount,
    Number(plan.duration_weeks || 0),
  );
  const checkoutRequestKey = body.checkoutToken
    ? `checkout:${body.checkoutToken}:plan:${plan.id}:CREDIT_CARD:${allowedInstallmentCount}`
    : null;

  if (checkoutRequestKey) {
    const { data: existingPayment, error: existingError } = await supabaseAdmin
      .from("payments")
      .select("id, student_id, company_id, plan_id, asaas_payment_id, status, invoice_url")
      .eq("checkout_request_key", checkoutRequestKey)
      .maybeSingle();
    if (existingError) throw new HttpError(500, "Falha ao verificar tentativa de pagamento.");
    if (existingPayment?.asaas_payment_id) {
      assertExistingPaymentScope(existingPayment, studentId, student.company_id);
      const providerPayment = await asaasFetch(`/payments/${existingPayment.asaas_payment_id}`);
      const { error: updateError } = await supabaseAdmin.from("payments").update({
        status: providerPayment.status || existingPayment.status,
        invoice_url: providerPayment.invoiceUrl || existingPayment.invoice_url,
        asaas_invoice_url: providerPayment.invoiceUrl || existingPayment.invoice_url,
      }).eq("id", existingPayment.id).eq("company_id", student.company_id);
      if (updateError) throw new HttpError(500, "Pagamento confirmado no provedor, mas pendente de conciliação local.");
      await applyExistingPaymentLifecycle(
        existingPayment,
        providerPayment,
        studentId,
        student.company_id,
        plan.id,
      );
      return {
        paymentId: existingPayment.asaas_payment_id,
        status: providerPayment.status || existingPayment.status,
        invoiceUrl: providerPayment.invoiceUrl || existingPayment.invoice_url,
        reused: true,
      };
    }
    if (existingPayment) {
      assertExistingPaymentScope(existingPayment, studentId, student.company_id);
      const reconciliation = await asaasFetch(
        `/payments?externalReference=${encodeURIComponent(`sett-payment:${existingPayment.id}`)}&limit=1&offset=0`,
      );
      const reconciled = Array.isArray(reconciliation?.data) ? reconciliation.data[0] : null;
      if (reconciled?.id) {
        const { error: updateError } = await supabaseAdmin.from("payments").update({
          asaas_payment_id: reconciled.id,
          status: reconciled.status || existingPayment.status,
          invoice_url: reconciled.invoiceUrl || null,
          asaas_invoice_url: reconciled.invoiceUrl || null,
        }).eq("id", existingPayment.id).eq("company_id", student.company_id);
        if (updateError) throw new HttpError(500, "Pagamento confirmado no provedor, mas pendente de conciliação local.");
        await applyExistingPaymentLifecycle(
          existingPayment,
          reconciled,
          studentId,
          student.company_id,
          plan.id,
        );
        return {
          paymentId: reconciled.id,
          status: reconciled.status,
          invoiceUrl: reconciled.invoiceUrl || null,
          reconciled: true,
        };
      }
      throw new HttpError(409, "Este pagamento ainda está sendo conciliado. Aguarde antes de tentar novamente.");
    }
  }

  // Auto-create Asaas customer if missing
  if (!student.asaas_customer_id) {
    console.log(`[CARD] Auto-creating Asaas customer for student ${studentId}`);
    const { customerId } = await createCustomer({
      studentId,
      ...billingProfile,
    });
    student.asaas_customer_id = customerId;
  } else {
    await updateCustomer({
      studentId,
      ...billingProfile,
    });
  }

  const { data: localOrder, error: orderError } = await supabaseAdmin
    .from("payments")
    .insert({
      student_id: studentId,
      company_id: student.company_id || null,
      asaas_customer_id: student.asaas_customer_id,
      billing_type: "CREDIT_CARD",
      payment_method: "CREDIT_CARD",
      amount: Number(value),
      value: Number(value),
      status: "CREATING",
      due_date: dueDate || businessDateYmd(),
      installment_count: allowedInstallmentCount,
      checkout_request_key: checkoutRequestKey,
      plan_id: plan.id,
      plan_name_snapshot: plan.name,
      plan_duration_weeks_snapshot: plan.duration_weeks,
    })
    .select("id")
    .single();
  if (orderError || !localOrder) {
    if (orderError?.code === "23505") {
      throw new HttpError(409, "Este pagamento já está em processamento.");
    }
    throw new HttpError(500, "Falha ao preparar pagamento com cartão.");
  }

  const paymentPayload: any = {
    customer: student.asaas_customer_id,
    billingType: "CREDIT_CARD",
    dueDate: dueDate || businessDateYmd(),
    description: description || "Plano BN Performance Training",
    externalReference: `sett-payment:${localOrder.id}`,
    creditCard: {
      holderName: creditCard.holderName,
      number: creditCard.number.replace(/\D/g, ""),
      expiryMonth: creditCard.expiryMonth,
      expiryYear: creditCard.expiryYear,
      ccv: creditCard.ccv,
    },
    creditCardHolderInfo: {
      name: creditCardHolderInfo.name,
      email: creditCardHolderInfo.email,
      cpfCnpj: creditCardHolderInfo.cpfCnpj?.replace(/\D/g, ""),
      postalCode: creditCardHolderInfo.postalCode?.replace(/\D/g, ""),
      addressNumber: (creditCardHolderInfo.addressNumber || "").toString().trim() || undefined,
      address: creditCardHolderInfo.address || undefined,
      province: creditCardHolderInfo.province || undefined,
      phone: creditCardHolderInfo.phone?.replace(/\D/g, "") || undefined,
    },
    remoteIp: remoteIp || undefined,
  };

  if (allowedInstallmentCount > 1) {
    paymentPayload.installmentCount = allowedInstallmentCount;
    paymentPayload.totalValue = Number(value);
  } else {
    paymentPayload.value = Number(value);
  }

  let payment: any;
  try {
    payment = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify(paymentPayload),
    });
  } catch (error) {
    const isDefinitiveFailure = error instanceof HttpError && error.status < 500;
    await supabaseAdmin.from("payments").update({
      status: isDefinitiveFailure ? "FAILED" : "RECONCILIATION_PENDING",
      checkout_request_key: isDefinitiveFailure ? null : checkoutRequestKey,
    }).eq("id", localOrder.id);
    throw error;
  }

  const { error: updateError } = await supabaseAdmin.from("payments").update({
    asaas_payment_id: payment.id,
    status: payment.status || "PENDING",
    due_date: payment.dueDate || dueDate || businessDateYmd(),
    asaas_invoice_url: payment.invoiceUrl || null,
    invoice_url: payment.invoiceUrl || null,
  }).eq("id", localOrder.id);
  if (updateError) throw new HttpError(500, "Pagamento criado, mas pendente de conciliação local.");

  // Ativar aluno automaticamente se pagamento já confirmado
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status)) {
    await applyPaymentStatusEffects(studentId, payment.status, payment.id, plan.id);
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    invoiceUrl: payment.invoiceUrl,
  };
}

async function createInvoice(body: any) {
  const { paymentId } = body;
  if (!paymentId) throw new Error("paymentId é obrigatório");

  const { data: localPayment } = await supabaseAdmin
    .from("payments")
    .select("student_id")
    .eq("asaas_payment_id", paymentId)
    .single();

  if (localPayment?.student_id) {
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, asaas_customer_id, full_name, email, phone, whatsapp, cpf, cep, address, address_number, neighborhood, country_code, billing_country_code, billing_name, billing_email, billing_postal_code, billing_address, billing_address_number, billing_neighborhood, billing_phone")
      .eq("id", localPayment.student_id)
      .single();

    if (student && !supportsAsaasBilling(effectiveBillingCountryCode(student))) {
      throw new HttpError(422, "A emissão automática de NFS-e está disponível apenas para cadastros brasileiros.");
    }

    if (student?.asaas_customer_id) {
      const normalizedCep = billingField(student, "billing_postal_code", "cep").replace(/\D/g, "");
      const normalizedPhone = domesticAsaasMobilePhone(student);
      const billingAddress = billingField(student, "billing_address", "address");
      const billingAddressNumber = billingField(student, "billing_address_number", "address_number");
      const billingNeighborhood = billingField(student, "billing_neighborhood", "neighborhood");

      if (!billingAddress || !billingAddressNumber || !billingNeighborhood || normalizedCep.length !== 8) {
        throw new Error(
          "Dados de endereço incompletos para emissão de nota. Preencha Rua, Número, Bairro e CEP válido (8 dígitos)."
        );
      }

      await updateCustomer({
        studentId: student.id,
        name: billingField(student, "billing_name", "full_name"),
        email: billingField(student, "billing_email", "email") || undefined,
        mobilePhone: normalizedPhone || undefined,
        postalCode: normalizedCep,
        address: billingAddress,
        addressNumber: billingAddressNumber,
        province: billingNeighborhood,
      });
    }
  }

  const invoice = await asaasFetch("/invoices", {
    method: "POST",
    body: JSON.stringify({
      payment: paymentId,
      serviceDescription: "Consultoria em educação física",
      observations: "Nota fiscal referente ao plano BN Performance Training",
      effectiveDate: businessDateYmd(),
      municipalServiceId: "8446",
      municipalServiceCode: "8599-6/04",
      municipalServiceName: "8.02 - TREINAMENTO EM DESENVOLVIMENTO PROFISSIONAL E GERENCIAL",
      taxes: {
        retainIss: false,
        iss: 0,
        cofins: 0,
        csll: 0,
        inss: 0,
        ir: 0,
        pis: 0,
      },
    }),
  });

  // Save invoice status on the payment record
  await supabaseAdmin
    .from("payments")
    .update({ invoice_status: invoice.status || "SCHEDULED" })
    .eq("asaas_payment_id", paymentId);

  return {
    invoiceId: invoice.id,
    status: invoice.status,
  };
}

async function applyPaymentStatusEffects(
  studentId: string,
  paymentStatus: string,
  asaasPaymentId?: string,
  planId?: string,
  expectedCompanyId?: string,
) {
  console.log(`[PAYMENT] Aplicando status ${paymentStatus} para aluno ${studentId} (planId: ${planId || 'none'})`);

  const { data: scopedStudent } = await supabaseAdmin
    .from("students")
    .select("company_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!scopedStudent?.company_id) throw new Error("Aluno sem empresa para aplicar pagamento.");
  if (expectedCompanyId && expectedCompanyId !== scopedStudent.company_id) {
    throw new Error("Pagamento e aluno pertencem a empresas diferentes.");
  }
  const companyId = scopedStudent.company_id;

  if (
    paymentStatus === "RECEIVED" ||
    paymentStatus === "CONFIRMED" ||
    paymentStatus === "RECEIVED_IN_CASH"
  ) {
    if (!planId) throw new Error("Pagamento confirmado sem snapshot imutável do plano.");
    const lifecycleEventKey = asaasPaymentId ? `payment_lifecycle:${asaasPaymentId}` : null;
    try {
    if (!asaasPaymentId) throw new Error("Pagamento confirmado sem identificador do provedor.");
    const dueDate = addBusinessDays(new Date(), 5);
    const { data: lifecycleRows, error: lifecycleError } = await supabaseAdmin.rpc(
      "apply_paid_payment_lifecycle",
      {
        _student_id: studentId,
        _company_id: companyId,
        _plan_id: planId,
        _asaas_payment_id: asaasPaymentId,
        _business_date: businessDateYmd(),
        _assessment_due_date: isoDate(dueDate),
      },
    );
    if (lifecycleError) throw new Error(`Falha ao aplicar lifecycle do pagamento: ${lifecycleError.message}`);
    const lifecycle = Array.isArray(lifecycleRows) ? lifecycleRows[0] : lifecycleRows;
    const enrollmentId = lifecycle?.enrollment_id;
    const isFirstActivation = lifecycle?.first_activation === true;
    if (!enrollmentId) throw new Error("Pagamento confirmado sem matrícula local aplicada.");

    const { data: previousStudent } = await supabaseAdmin.from("students")
      .select("full_name, whatsapp, phone, country_code, company_id")
      .eq("id", studentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!previousStudent?.company_id) throw new Error("Aluno sem empresa após aplicar pagamento.");

    if (lifecycleEventKey) {
      const claimed = await claimFunnelEvent(supabaseAdmin, {
        studentId,
        companyId,
        eventType: "payment_confirmed",
        eventKey: lifecycleEventKey,
        payload: { payment_id: asaasPaymentId, status: paymentStatus, plan_id: planId || null },
      });
      if (!claimed) return;
    }

    if (asaasPaymentId) {
      try {
        await createInvoice({ paymentId: asaasPaymentId });
      } catch (error) {
        console.error("Erro ao emitir NFS-e:", error);
      }
    }

    if (
      isFirstActivation &&
      asaasPaymentId &&
      previousStudent?.company_id &&
      previousStudent.full_name
    ) {
      const { data: anamnesis } = await supabaseAdmin
        .from("student_anamneses")
        .select("id")
        .eq("student_id", studentId)
        .limit(1)
        .maybeSingle();
      const formattedDueDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(dueDate);
      const result = await sendFunnelWhatsAppMessage({
        admin: supabaseAdmin,
        studentId,
        companyId: previousStudent.company_id,
        fullName: previousStudent.full_name,
        phone: previousStudent.whatsapp || previousStudent.phone,
        countryCode: previousStudent.country_code,
        text: buildAssessmentOnboardingMessage({
          fullName: previousStudent.full_name,
          dueDate: formattedDueDate,
          hasAnamnesis: !!anamnesis,
        }),
        eventType: "assessment_instructions_sent",
        eventKey: `assessment_instructions:${asaasPaymentId}`,
        payload: {
          payment_id: asaasPaymentId,
          enrollment_id: enrollmentId,
          assessment_due_at: isoDate(dueDate),
          has_anamnesis: !!anamnesis,
        },
      });
      if (result.sent) {
          await supabaseAdmin.from("students").update({
            onboarding_instructions_sent_at: new Date().toISOString(),
          }).eq("id", studentId).eq("company_id", previousStudent.company_id);
      }
    }

      if (lifecycleEventKey) {
        await completeFunnelEvent(supabaseAdmin, studentId, lifecycleEventKey, "completed");
      }
      return;
    } catch (error) {
      if (lifecycleEventKey) {
        await completeFunnelEvent(
          supabaseAdmin,
          studentId,
          lifecycleEventKey,
          "failed",
          error instanceof Error ? error.message : "Falha ao aplicar pagamento.",
        );
      }
      throw error;
    }
  }

  if (paymentStatus === "OVERDUE") {
    const { error } = await supabaseAdmin
      .from("enrollments")
      .update({ payment_status: "overdue" })
      .eq("student_id", studentId)
      .eq("company_id", companyId)
      .eq("status", "active");

    if (error) {
      console.error("Erro ao marcar matrícula como overdue:", error);
    }

    return;
  }

  if (
    paymentStatus === "REFUNDED" ||
    paymentStatus === "DELETED" ||
    paymentStatus === "REFUND_REQUESTED"
  ) {
    const { error: studentError } = await supabaseAdmin
      .from("students")
      .update({ status: "pending" })
      .eq("id", studentId)
      .eq("company_id", companyId);

    if (studentError) {
      console.error("Erro ao desativar aluno:", studentError);
    }

    const { error: enrollmentError } = await supabaseAdmin
      .from("enrollments")
      .update({ payment_status: "refunded" })
      .eq("student_id", studentId)
      .eq("company_id", companyId)
      .eq("status", "active");

    if (enrollmentError) {
      console.error("Erro ao atualizar matrícula para refunded:", enrollmentError);
    }
  }
}

async function getPaymentStatus(body: any) {
  const { paymentId } = body;
  if (!paymentId) throw new Error("paymentId é obrigatório");

  const payment = await asaasFetch(`/payments/${paymentId}`);

  // Update local payment status + installment count if available
  const updateData: any = { status: payment.status };
  if (payment.installmentCount && payment.installmentCount > 1) {
    updateData.installment_count = payment.installmentCount;
  }
  const { data: localPayment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .update(updateData)
    .eq("asaas_payment_id", paymentId)
    .select("student_id, company_id, plan_id, enrollment_id")
    .single();

  if (paymentError) {
    console.error("Erro ao atualizar pagamento no fallback:", paymentError);
  } else if (localPayment?.student_id) {
    const confirmedStatus = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status);
    if (confirmedStatus && !localPayment.plan_id) {
      throw new HttpError(409, "Pagamento confirmado, mas o plano pago precisa de conciliação manual.");
    }
    await applyPaymentStatusEffects(
      localPayment.student_id,
      payment.status,
      paymentId,
      localPayment.plan_id || undefined,
      localPayment.company_id || undefined,
    );
  }

  return {
    status: payment.status,
    value: payment.value,
    billingType: payment.billingType,
    invoiceUrl: payment.invoiceUrl,
  };
}

async function syncPayments(body: any) {
  const { companyId, syncAll } = body;

  // Get all students with asaas_customer_id for this company
  let studentsQuery = supabaseAdmin.from("students").select("id, asaas_customer_id, full_name, company_id, selected_plan_id");
  if (companyId) studentsQuery = studentsQuery.eq("company_id", companyId);
  const { data: students } = await studentsQuery.not("asaas_customer_id", "is", null);

  if (!students || students.length === 0) {
    return { synced: 0, message: "Nenhum aluno com cadastro no Asaas encontrado." };
  }

  let synced = 0;

  // Calculate 6 months ago date for syncAll
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateFilter = syncAll ? `&dateCreated[ge]=${businessDateYmd(sixMonthsAgo)}` : "";

  for (const student of students) {
    try {
      // Fetch payments from Asaas with pagination
      let allAsaasPayments: any[] = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const data = await asaasFetch(`/payments?customer=${student.asaas_customer_id}&limit=${limit}&offset=${offset}${dateFilter}`);
        const page = data.data || [];
        allAsaasPayments = allAsaasPayments.concat(page);
        hasMore = data.hasMore === true && page.length === limit;
        offset += limit;
        // Safety: stop if not syncAll and we already got first page
        if (!syncAll) break;
      }

      const asaasPayments = allAsaasPayments;

      // Group by installment ID to calculate installment count
      const installmentGroups: Record<string, number> = {};
      for (const ap of asaasPayments) {
        if (ap.installment) {
          installmentGroups[ap.installment] = (installmentGroups[ap.installment] || 0) + 1;
        }
      }

      for (const ap of asaasPayments) {
        // Determine correct installment_count:
        // If payment belongs to an installment group, count how many in the group
        // Otherwise it's a single payment (à vista)
        const installmentCount = ap.installment
          ? (installmentGroups[ap.installment] || 1)
          : 1;

        // Check if already exists locally
          const { data: existing } = await supabaseAdmin
            .from("payments")
            .select("id, status, student_id, company_id, plan_id")
          .eq("asaas_payment_id", ap.id)
          .maybeSingle();

        if (existing) {
          // Update status + correct installment_count
          const { error: updateError } = await supabaseAdmin
            .from("payments")
            .update({
              status: ap.status,
              invoice_url: ap.invoiceUrl || null,
              installment_count: installmentCount,
            })
            .eq("id", existing.id);
          if (updateError) throw updateError;
          if (existing.status !== ap.status && existing.plan_id && existing.company_id) {
            await applyPaymentStatusEffects(student.id, ap.status, ap.id, existing.plan_id, existing.company_id);
          }
        } else {
          // Insert new
          const { error: insertError } = await supabaseAdmin.from("payments").insert({
            student_id: student.id,
            company_id: student.company_id || null,
            asaas_customer_id: student.asaas_customer_id,
            asaas_payment_id: ap.id,
            billing_type: ap.billingType || null,
            value: Number(ap.value) || 0,
            status: ap.status || "PENDING",
            due_date: ap.dueDate || null,
            invoice_url: ap.invoiceUrl || null,
            installment_count: installmentCount,
          });
          if (insertError) throw insertError;
          // Cobranças externas sem snapshot imutável do plano são apenas importadas.
          // Ativação/renovação automática fica bloqueada até reconciliação manual do plano pago.
        }
        synced++;
      }
    } catch (err) {
      console.error(`Error syncing payments for student ${student.id}:`, err);
    }
  }

  return { synced, message: `${synced} cobranças sincronizadas do Asaas.` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...body } = await req.json();
    const adminActions = new Set([
      "check-connection",
      "create-customer",
      "update-customer",
      "create-invoice",
      "sync-payments",
    ]);
    const checkoutActions = new Set(["create-payment", "get-pix-qrcode", "create-card-payment", "get-payment-status"]);
    if (adminActions.has(action)) {
      const tenant = await requireAdminTenant(req, body);
      body.companyId = body.companyId || tenant.companyId;
    } else if (checkoutActions.has(action)) {
      if (body.checkoutToken) {
        await requireCheckoutToken(body, action);
      } else {
        const tenant = await requireAdminTenant(req, body);
        body.companyId = body.companyId || tenant.companyId;
      }
      const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const connectingIp = req.headers.get("cf-connecting-ip")?.trim();
      body.remoteIp = connectingIp || forwardedFor || body.remoteIp;
    }

    let result;
    switch (action) {
      case "check-connection":
        result = await checkConnection();
        break;
      case "create-customer":
        result = await createCustomer(body);
        break;
      case "create-payment":
        result = await createPayment(body);
        break;
      case "get-pix-qrcode":
        result = await getPixQrCode(body);
        break;
      case "create-card-payment":
        result = await createCardPayment(body);
        break;
      case "get-payment-status":
        result = await getPaymentStatus(body);
        break;
      case "create-invoice":
        result = await createInvoice(body);
        break;
      case "update-customer":
        result = await updateCustomer(body);
        break;
      case "sync-payments":
        result = await syncPayments(body);
        break;
      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: error instanceof HttpError ? error.status : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
