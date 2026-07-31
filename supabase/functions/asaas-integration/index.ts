import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { businessDateYmd } from "../_shared/business-date.ts";
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
const ASAAS_BASE_URL = "https://api.asaas.com/v3";
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

async function asaasFetch(path: string, options: RequestInit = {}) {
  if (!ASAAS_API_KEY) throw new HttpError(503, "Integração Asaas não configurada no servidor.");
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "SETT-BNApp/1.0 (Supabase Edge; production)",
      access_token: ASAAS_API_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas API error:", res.status, JSON.stringify(data));
    const firstErr = data.errors?.[0];
    const msg = firstErr
      ? `${firstErr.description || "Erro"}${firstErr.code ? ` (${firstErr.code})` : ""}`
      : data.message || `Erro na API do Asaas (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function checkConnection() {
  await asaasFetch("/customers?limit=1&offset=0");
  return {
    connected: true,
    environment: "production",
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
  const { studentId, name, email, mobilePhone, postalCode, address, addressNumber, province } = body;
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
async function resolvePlanPrice(student: any, planId?: string): Promise<number> {
  const effectivePlanId = planId || student?.selected_plan_id;
  if (!effectivePlanId) {
    throw new Error("Plano não informado para o pagamento.");
  }
  const { data: plan } = await supabaseAdmin
    .from("plans")
    .select("price, company_id, is_active")
    .eq("id", effectivePlanId)
    .maybeSingle();
  if (!plan || plan.price == null || !plan.is_active) {
    throw new Error("Plano inválido, inativo ou sem preço definido.");
  }
  if (plan.company_id && student?.company_id && plan.company_id !== student.company_id) {
    throw new Error("Plano não pertence à empresa do aluno.");
  }
  const price = Number(plan.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Plano sem valor de cobrança válido.");
  }
  return price;
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
    .select("asaas_customer_id, company_id, selected_plan_id, full_name, email, cpf, phone, whatsapp, cep, address, address_number, neighborhood, city, state")
    .eq("id", studentId)
    .single();

  if (!student) {
    throw new Error("Aluno não encontrado.");
  }

  // SECURITY: amount comes from the plan in the DB, never from the client body.
  const value = await resolvePlanPrice(student, planId);
  const paymentDueDate = dueDate || businessDateYmd();
  const checkoutRequestKey = body.checkoutToken && planId
    ? `checkout:${body.checkoutToken}:plan:${planId}:${billingType}`
    : null;

  // A retry in the same checkout/day must not create another Pix charge.
  if (checkoutRequestKey) {
    const { data: existingPayment, error: existingError } = await supabaseAdmin
      .from("payments")
      .select("asaas_payment_id, status, invoice_url")
      .eq("student_id", studentId)
      .eq("company_id", student.company_id)
      .eq("billing_type", billingType)
      .eq("due_date", paymentDueDate)
      .eq("notes", checkoutRequestKey)
      .in("status", ["PENDING", "RECEIVED", "CONFIRMED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new HttpError(500, `Falha ao verificar cobrança pendente: ${existingError.message}`);
    if (existingPayment?.asaas_payment_id) {
      const providerPayment = await asaasFetch(`/payments/${existingPayment.asaas_payment_id}`);
      await supabaseAdmin
        .from("payments")
        .update({
          status: providerPayment.status || existingPayment.status,
          invoice_url: providerPayment.invoiceUrl || existingPayment.invoice_url,
          asaas_invoice_url: providerPayment.invoiceUrl || existingPayment.invoice_url,
        })
        .eq("asaas_payment_id", existingPayment.asaas_payment_id);
      if (["PENDING", "RECEIVED", "CONFIRMED"].includes(providerPayment.status)) {
        return {
          paymentId: existingPayment.asaas_payment_id,
          status: providerPayment.status,
          invoiceUrl: providerPayment.invoiceUrl || existingPayment.invoice_url,
          reused: true,
        };
      }
    }
  }

  // Auto-create Asaas customer if missing
  if (!student.asaas_customer_id) {
    console.log(`[PAYMENT] Auto-creating Asaas customer for student ${studentId}`);
    const { customerId } = await createCustomer({
      studentId,
      name: student.full_name,
      email: student.email || undefined,
      cpfCnpj: student.cpf || "",
      mobilePhone: (student.whatsapp || student.phone || "").replace(/\D/g, ""),
      postalCode: (student.cep || "").replace(/\D/g, ""),
      address: student.address || undefined,
      addressNumber: student.address_number || undefined,
      province: student.neighborhood || undefined,
      cityName: student.city || undefined,
      state: student.state || undefined,
    });
    student.asaas_customer_id = customerId;
  }

  const payment = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: student.asaas_customer_id,
      billingType,
      value: Number(value),
      dueDate: paymentDueDate,
      description: description || "Plano BN Performance Training",
      externalReference: studentId,
    }),
  });

  // Save to payments table
  const { error: insertError } = await supabaseAdmin.from("payments").insert({
    student_id: studentId,
    company_id: student.company_id || null,
    asaas_customer_id: student.asaas_customer_id,
    asaas_payment_id: payment.id,
    billing_type: billingType,
    payment_method: billingType,
    amount: Number(value),
    value: Number(value),
    status: payment.status || "PENDING",
    due_date: payment.dueDate || null,
    asaas_invoice_url: payment.invoiceUrl || null,
    invoice_url: payment.invoiceUrl || null,
    installment_count: 1,
    notes: checkoutRequestKey,
  });
  if (insertError) throw new HttpError(500, `Falha ao persistir pagamento: ${insertError.message}`);

  // Ativar aluno automaticamente se pagamento já confirmado
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status)) {
    await applyPaymentStatusEffects(studentId, payment.status, payment.id, planId);
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
    .select("asaas_customer_id, company_id, selected_plan_id, full_name, email, cpf, phone, whatsapp, cep, address, address_number, neighborhood, city, state")
    .eq("id", studentId)
    .single();

  if (!student) {
    throw new Error("Aluno não encontrado.");
  }

  // SECURITY: amount comes from the plan in the DB, never from the client body.
  const value = await resolvePlanPrice(student, planId);

  // Auto-create Asaas customer if missing
  if (!student.asaas_customer_id) {
    console.log(`[CARD] Auto-creating Asaas customer for student ${studentId}`);
    const { customerId } = await createCustomer({
      studentId,
      name: student.full_name,
      email: student.email || undefined,
      cpfCnpj: student.cpf || "",
      mobilePhone: (student.whatsapp || student.phone || "").replace(/\D/g, ""),
      postalCode: (student.cep || "").replace(/\D/g, ""),
      address: student.address || undefined,
      addressNumber: student.address_number || undefined,
      province: student.neighborhood || undefined,
    });
    student.asaas_customer_id = customerId;
  }

  const paymentPayload: any = {
    customer: student.asaas_customer_id,
    billingType: "CREDIT_CARD",
    value: Number(value),
    dueDate: dueDate || businessDateYmd(),
    description: description || "Plano BN Performance Training",
    externalReference: studentId,
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

  if (installmentCount && installmentCount > 1) {
    paymentPayload.installmentCount = installmentCount;
    // Recalculado a partir do valor autoritativo do servidor (ignora installmentValue do client).
    paymentPayload.installmentValue = Number((Number(value) / installmentCount).toFixed(2));
  }

  const payment = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify(paymentPayload),
  });

  const { error: insertError } = await supabaseAdmin.from("payments").insert({
    student_id: studentId,
    company_id: student.company_id || null,
    asaas_customer_id: student.asaas_customer_id,
    asaas_payment_id: payment.id,
    billing_type: "CREDIT_CARD",
    payment_method: "CREDIT_CARD",
    amount: Number(value),
    value: Number(value),
    status: payment.status || "PENDING",
    due_date: payment.dueDate || null,
    asaas_invoice_url: payment.invoiceUrl || null,
    invoice_url: payment.invoiceUrl || null,
    installment_count: installmentCount && installmentCount > 1 ? installmentCount : 1,
  });
  if (insertError) throw new HttpError(500, `Falha ao persistir pagamento: ${insertError.message}`);

  // Ativar aluno automaticamente se pagamento já confirmado
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status)) {
    await applyPaymentStatusEffects(studentId, payment.status, payment.id, planId);
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
      .select("id, asaas_customer_id, full_name, email, phone, whatsapp, cpf, cep, address, address_number, neighborhood")
      .eq("id", localPayment.student_id)
      .single();

    if (student?.asaas_customer_id) {
      const normalizedCep = (student.cep || "").replace(/\D/g, "");
      const normalizedPhone = (student.whatsapp || student.phone || "").replace(/\D/g, "");

      if (!student.address || !student.address_number || !student.neighborhood || normalizedCep.length !== 8) {
        throw new Error(
          "Dados de endereço incompletos para emissão de nota. Preencha Rua, Número, Bairro e CEP válido (8 dígitos)."
        );
      }

      await updateCustomer({
        studentId: student.id,
        name: student.full_name,
        email: student.email || undefined,
        mobilePhone: normalizedPhone || undefined,
        postalCode: normalizedCep,
        address: student.address,
        addressNumber: student.address_number,
        province: student.neighborhood,
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

async function ensureEnrollmentExists(studentId: string, planId?: string) {
  const { data: existing } = await supabaseAdmin
    .from("enrollments")
    .select("id, end_date, plan_id, payment_status, status")
    .eq("student_id", studentId)
    .in("status", ["active", "awaiting_training", "awaiting_renewal"])
    .maybeSingle();

  // Get student data
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("selected_plan_id, assigned_trainer_id, company_id")
    .eq("id", studentId)
    .single();

  const effectivePlanId = planId || student?.selected_plan_id;

  if (!effectivePlanId) {
    console.error(`Student ${studentId} has no plan_id for enrollment`);
    return null;
  }

  const { data: plan } = await supabaseAdmin
    .from("plans")
    .select("duration_weeks, duration_days, company_id, cycle_duration_days")
    .eq("id", effectivePlanId)
    .single();

  if (!plan) return null;

  const planDays = plan.duration_days || (plan.duration_weeks ? plan.duration_weeks * 7 : 90);
  const companyId = student?.company_id || plan.company_id || null;

  // Enrollment may be provisioned before the first payment. In that case confirm it
  // without extending the contract; only an already-paid enrollment is a renewal.
  if (existing && existing.payment_status !== "paid") {
    await supabaseAdmin.from("enrollments").update({
      plan_id: effectivePlanId,
      status: "active",
      payment_status: "paid",
      payment_date: businessDateYmd(),
    }).eq("id", existing.id);
    return existing.id;
  }

  // --- RENEWAL: active enrollment exists → extend it ---
  if (existing) {
    const todayYmd = businessDateYmd();
    const extensionStartYmd = existing.end_date && existing.end_date > todayYmd ? existing.end_date : todayYmd;
    const extensionStart = new Date(`${extensionStartYmd}T12:00:00Z`);
    const newEnd = new Date(extensionStart);
    newEnd.setUTCDate(newEnd.getUTCDate() + planDays);

    const newEndStr = businessDateYmd(newEnd);

    console.log(`[RENEWAL] Extending enrollment ${existing.id} from ${existing.end_date} to ${newEndStr} (+${planDays} days)`);

    // Update enrollment end_date and plan
    await supabaseAdmin
      .from("enrollments")
      .update({
        end_date: newEndStr,
        plan_id: effectivePlanId,
        payment_status: "paid",
      })
      .eq("id", existing.id);

    // Generate new cycles for the extended period
    // We need to find the last cycle to continue numbering
    const { data: lastCycle } = await supabaseAdmin
      .from("training_cycles")
      .select("cycle_number, end_date")
      .eq("enrollment_id", existing.id)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .single();

    const cycleDays = plan.cycle_duration_days || 42;
    let cycleNum = (lastCycle?.cycle_number || 0) + 1;
    // New cycles start after the last cycle ends (or from extensionStart+1 if no cycles)
    let cycleStart = lastCycle?.end_date
      ? new Date(`${lastCycle.end_date}T12:00:00Z`)
      : new Date(extensionStart);
    cycleStart.setUTCDate(cycleStart.getUTCDate() + 1);

    while (cycleStart <= newEnd) {
      let cycleEnd = new Date(cycleStart);
      cycleEnd.setUTCDate(cycleEnd.getUTCDate() + cycleDays - 1);
      if (cycleEnd > newEnd) cycleEnd = newEnd;

      await supabaseAdmin.from("training_cycles").insert({
        enrollment_id: existing.id,
        cycle_number: cycleNum,
        start_date: businessDateYmd(cycleStart),
        end_date: businessDateYmd(cycleEnd),
        status: "pending",
        company_id: companyId,
      });

      console.log(`[RENEWAL] Created cycle ${cycleNum}: ${businessDateYmd(cycleStart)} → ${businessDateYmd(cycleEnd)}`);

      cycleNum++;
      cycleStart = new Date(cycleEnd);
      cycleStart.setUTCDate(cycleStart.getUTCDate() + 1);
    }

    return existing.id;
  }

  // --- FIRST ENROLLMENT: create new ---

  const today = new Date(`${businessDateYmd()}T12:00:00Z`);
  const endDate = new Date(today);
  endDate.setUTCDate(endDate.getUTCDate() + planDays - 1);

  const { data: enrollment, error } = await supabaseAdmin
    .from("enrollments")
    .insert({
      student_id: studentId,
      plan_id: effectivePlanId,
      trainer_id: student?.assigned_trainer_id || null,
      start_date: businessDateYmd(today),
      end_date: businessDateYmd(endDate),
      payment_status: "paid",
      payment_date: businessDateYmd(today),
      status: "active",
      company_id: companyId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error auto-creating enrollment:", error);
    return null;
  }

  console.log(`Auto-created enrollment ${enrollment.id} for student ${studentId} (company: ${companyId})`);
  return enrollment.id;
}

async function applyPaymentStatusEffects(studentId: string, paymentStatus: string, asaasPaymentId?: string, planId?: string) {
  console.log(`[PAYMENT] Aplicando status ${paymentStatus} para aluno ${studentId} (planId: ${planId || 'none'})`);

  if (
    paymentStatus === "RECEIVED" ||
    paymentStatus === "CONFIRMED" ||
    paymentStatus === "RECEIVED_IN_CASH"
  ) {
    const lifecycleEventKey = asaasPaymentId ? `payment_lifecycle:${asaasPaymentId}` : null;
    if (lifecycleEventKey) {
      const { data: lifecycleStudent } = await supabaseAdmin
        .from("students")
        .select("company_id")
        .eq("id", studentId)
        .maybeSingle();
      if (!lifecycleStudent?.company_id) throw new Error("Aluno sem empresa para aplicar pagamento.");
      const claimed = await claimFunnelEvent(supabaseAdmin, {
        studentId,
        companyId: lifecycleStudent.company_id,
        eventType: "payment_confirmed",
        eventKey: lifecycleEventKey,
        payload: { payment_id: asaasPaymentId, status: paymentStatus, plan_id: planId || null },
      });
      if (!claimed) return;
    }
    try {
    const [{ data: previousStudent }, { data: previousEnrollment }] = await Promise.all([
      supabaseAdmin.from("students")
        .select("status, activated_at, full_name, whatsapp, phone, company_id")
        .eq("id", studentId)
        .maybeSingle(),
      supabaseAdmin.from("enrollments")
        .select("id")
        .eq("student_id", studentId)
        .in("status", ["active", "awaiting_training", "awaiting_renewal"])
        .limit(1)
        .maybeSingle(),
    ]);
    const isFirstActivation = !previousStudent?.activated_at &&
      !previousEnrollment &&
      !["active", "awaiting_renewal"].includes(previousStudent?.status || "");
    const dueDate = addBusinessDays(new Date(), 5);
    const activatedAt = new Date().toISOString();
    const { error: studentError } = await supabaseAdmin
      .from("students")
      .update({
        status: "active",
        sales_stage: isFirstActivation ? "active_onboarding" : "active",
        activated_at: previousStudent?.activated_at || activatedAt,
        assessment_due_at: isFirstActivation ? isoDate(dueDate) : undefined,
      })
      .eq("id", studentId);

    if (studentError) {
      console.error("Erro ao ativar aluno:", studentError);
    }

    // Ensure enrollment exists or extend existing one (renewal)
    const enrollmentId = await ensureEnrollmentExists(studentId, planId || undefined);

    const { error: enrollmentError } = await supabaseAdmin
      .from("enrollments")
      .update({
        payment_status: "paid",
        payment_date: businessDateYmd(),
      })
      .eq("student_id", studentId)
      .eq("status", "active");

    if (enrollmentError) {
      console.error("Erro ao atualizar matrícula:", enrollmentError);
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
        }).eq("id", studentId);
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
      .eq("id", studentId);

    if (studentError) {
      console.error("Erro ao desativar aluno:", studentError);
    }

    const { error: enrollmentError } = await supabaseAdmin
      .from("enrollments")
      .update({ payment_status: "refunded" })
      .eq("student_id", studentId)
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
    .select("student_id")
    .single();

  if (paymentError) {
    console.error("Erro ao atualizar pagamento no fallback:", paymentError);
  } else if (localPayment?.student_id) {
    await applyPaymentStatusEffects(localPayment.student_id, payment.status, paymentId);
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
  let studentsQuery = supabaseAdmin.from("students").select("id, asaas_customer_id, full_name, company_id");
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
          .select("id")
          .eq("asaas_payment_id", ap.id)
          .maybeSingle();

        if (existing) {
          // Update status + correct installment_count
          await supabaseAdmin
            .from("payments")
            .update({
              status: ap.status,
              invoice_url: ap.invoiceUrl || null,
              installment_count: installmentCount,
            })
            .eq("id", existing.id);
        } else {
          // Insert new
          await supabaseAdmin.from("payments").insert({
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
