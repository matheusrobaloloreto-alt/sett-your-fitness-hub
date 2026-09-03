import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(
  SUPABASE_URL,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RECOVERY_EVENTS = new Set([
  "plan_selected",
  "payment_started",
  "payment_abandoned",
  "payment_completed",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function requiredText(value: unknown, label: string, maxLength = 160) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new HttpError(422, `${label} é obrigatório.`);
  if (normalized.length > maxLength) throw new HttpError(422, `${label} excede o limite permitido.`);
  return normalized;
}

async function getBranding(companyId: string) {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("logo_url, platform_title, primary_color, background_color, card_color, text_color")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new HttpError(500, `Falha ao carregar identidade visual: ${error.message}`);
  return data ?? null;
}

async function requireStaff(req: Request, studentId: unknown) {
  if (!isUuid(studentId)) throw new HttpError(400, "studentId inválido.");
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "Unauthorized");

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(
    authHeader.slice("Bearer ".length),
  );
  if (userError || !userData?.user?.id) throw new HttpError(401, "Unauthorized");

  const tenant = await assertTenantAccess(supabase, { sub: userData.user.id }, { studentId });
  const roleNames = ["master", "admin", "coordinator", "trainer"];
  const roleResults = await Promise.all(
    roleNames.map((role) => supabase.rpc("has_role", { _user_id: tenant.userId, _role: role })),
  );
  const failedRole = roleResults.find((result) => result.error);
  if (failedRole?.error) {
    throw new HttpError(503, `Falha ao validar função do usuário: ${failedRole.error.message}`);
  }
  if (!roleResults.some((result) => result.data === true)) throw new HttpError(403, "Forbidden");
  return tenant;
}

type CheckoutLink = {
  id: string;
  student_id: string;
  company_id: string;
  expires_at: string;
};

async function resolveCheckoutToken(token: unknown, touch = true): Promise<CheckoutLink> {
  if (!isUuid(token)) throw new HttpError(404, "Link de pagamento inválido.");
  const { data, error } = await supabase
    .from("public_payment_links")
    .select("id, student_id, company_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new HttpError(500, `Falha ao validar link de pagamento: ${error.message}`);
  if (!data) throw new HttpError(404, "Link de pagamento inválido.");
  if (data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    throw new HttpError(410, "Este link de pagamento expirou. Solicite um novo link ao seu treinador.");
  }
  if (touch) {
    const { error: touchError } = await supabase
      .from("public_payment_links")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);
    if (touchError) console.error("public-payment-context: failed to touch checkout link", touchError);
  }
  return data;
}

async function validatePlan(planId: unknown, companyId: string) {
  if (!isUuid(planId)) throw new HttpError(400, "planId inválido.");
  const { data, error } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .eq("plan_kind", "standard")
    .gt("price", 0)
    .maybeSingle();
  if (error) throw new HttpError(500, `Falha ao validar plano: ${error.message}`);
  if (!data) throw new HttpError(400, "Plano inválido.");
  return data.id as string;
}

async function createLink(req: Request, studentId: unknown) {
  const tenant = await requireStaff(req, studentId);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("public_payment_links")
    .select("token, expires_at")
    .eq("student_id", studentId)
    .eq("company_id", tenant.companyId)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new HttpError(500, `Falha ao consultar link de pagamento: ${existingError.message}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("public_payment_links")
    .insert({
      student_id: studentId,
      company_id: tenant.companyId,
      created_by: tenant.userId,
    })
    .select("token, expires_at")
    .single();
  if (error || !data) throw new HttpError(500, `Falha ao criar link de pagamento: ${error?.message ?? "erro desconhecido"}`);
  return data;
}

async function recordRecoveryEvent(link: CheckoutLink, body: Record<string, unknown>) {
  const eventType = typeof body.eventType === "string" ? body.eventType : "";
  if (!RECOVERY_EVENTS.has(eventType)) throw new HttpError(400, "Tipo de evento inválido.");

  let planId: string | null = null;
  if (body.planId != null) planId = await validatePlan(body.planId, link.company_id);

  let localPaymentId: string | null = null;
  let enrollmentId: string | null = null;
  if (typeof body.paymentId === "string" && body.paymentId) {
    const { data: payment, error } = await supabase
      .from("payments")
      .select("id, enrollment_id")
      .eq("asaas_payment_id", body.paymentId)
      .eq("student_id", link.student_id)
      .eq("company_id", link.company_id)
      .maybeSingle();
    if (error) throw new HttpError(500, `Falha ao validar pagamento: ${error.message}`);
    if (!payment) throw new HttpError(403, "Pagamento não pertence a este link.");
    localPaymentId = payment.id;
    enrollmentId = payment.enrollment_id;
  }

  const rawMetadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? body.metadata
    : {};
  const metadataJson = JSON.stringify(rawMetadata);
  if (metadataJson.length > 8_000) throw new HttpError(413, "Metadados do evento excedem o limite.");

  const { error } = await supabase.from("payment_recovery_events").insert({
    student_id: link.student_id,
    company_id: link.company_id,
    plan_id: planId,
    payment_id: localPaymentId,
    enrollment_id: enrollmentId,
    event_type: eventType,
    source: "public-payment",
    metadata: rawMetadata,
  });
  if (error) throw new HttpError(500, `Falha ao registrar evento do checkout: ${error.message}`);
}

async function setBrazilianBillingProfile(link: CheckoutLink, body: Record<string, unknown>) {
  const billing = body.billing && typeof body.billing === "object" && !Array.isArray(body.billing)
    ? body.billing as Record<string, unknown>
    : {};
  const cpf = digits(billing.cpfCnpj);
  const cep = digits(billing.postalCode);
  if (![11, 14].includes(cpf.length)) throw new HttpError(422, "Informe um CPF/CNPJ brasileiro válido.");
  if (cep.length !== 8) throw new HttpError(422, "Informe um CEP brasileiro válido.");

  const email = requiredText(billing.email, "E-mail", 254).toLowerCase();
  if (!email.includes("@")) throw new HttpError(422, "Informe um e-mail válido.");
  const name = requiredText(billing.name, "Nome do pagador");
  const address = requiredText(billing.address, "Endereço");
  const addressNumber = requiredText(billing.addressNumber, "Número do endereço", 40);
  const province = requiredText(billing.province, "Bairro");
  let phone = digits(billing.phone);
  if (phone.startsWith("55") && (phone.length === 12 || phone.length === 13)) phone = phone.slice(2);
  if (phone && !(phone.length === 10 || (phone.length === 11 && phone[2] === "9"))) {
    throw new HttpError(422, "Informe um telefone brasileiro válido para o pagador.");
  }

  const { data: current, error: currentError } = await supabase
    .from("students")
    .select("country_code, cpf, billing_cpf_cnpj, asaas_customer_id")
    .eq("id", link.student_id)
    .eq("company_id", link.company_id)
    .maybeSingle();
  if (currentError) throw new HttpError(500, `Falha ao conferir o pagador atual: ${currentError.message}`);
  if (!current) throw new HttpError(404, "Aluno não encontrado.");
  const currentPayerDocument = digits(
    current.billing_cpf_cnpj || (String(current.country_code || "").toUpperCase() === "BR" ? current.cpf : ""),
  );
  const payerChanged = Boolean(current.asaas_customer_id && currentPayerDocument !== cpf);

  const { error } = await supabase
    .from("students")
    .update({
      billing_country_code: "BR",
      billing_name: name,
      billing_email: email,
      billing_cpf_cnpj: cpf,
      billing_postal_code: cep,
      billing_address: address,
      billing_address_number: addressNumber,
      billing_neighborhood: province,
      billing_phone: phone || null,
      ...(payerChanged ? { asaas_customer_id: null } : {}),
    })
    .eq("id", link.student_id)
    .eq("company_id", link.company_id);
  if (error) throw new HttpError(500, `Falha ao salvar dados de cobrança: ${error.message}`);
  return { ok: true, billingCountryCode: "BR" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "create-link") {
      const link = await createLink(req, body.studentId);
      return json(link);
    }

    const link = await resolveCheckoutToken(body?.token);

    if (action === "set-brazilian-billing-profile") {
      return json(await setBrazilianBillingProfile(link, body));
    }

    if (action === "context") {
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id, full_name, email, cpf, cep, phone, whatsapp, country_code, billing_country_code, billing_name, billing_email, billing_cpf_cnpj, billing_postal_code, billing_address, billing_address_number, billing_neighborhood, billing_phone, selected_plan_id, address, address_number, neighborhood, fiscal_completed_at, sales_stage")
        .eq("id", link.student_id)
        .eq("company_id", link.company_id)
        .maybeSingle();
      if (studentError) throw new HttpError(500, `Falha ao carregar aluno: ${studentError.message}`);
      if (!student) throw new HttpError(404, "Aluno não encontrado.");

      const [{ data: plans, error: plansError }, { data: enrollment, error: enrollmentError }, branding] = await Promise.all([
        supabase.from("plans")
          .select("id, name, price, duration_weeks, description")
          .eq("company_id", link.company_id)
          .eq("is_active", true)
          .eq("plan_kind", "standard")
          .gt("price", 0)
          .order("price"),
        supabase.from("enrollments")
          .select("id")
          .eq("student_id", link.student_id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
        getBranding(link.company_id),
      ]);
      if (plansError) throw new HttpError(500, `Falha ao carregar planos: ${plansError.message}`);
      if (enrollmentError) throw new HttpError(500, `Falha ao carregar matrícula: ${enrollmentError.message}`);
      return json({ student, plans: plans ?? [], isRenewal: !!enrollment, branding, expiresAt: link.expires_at });
    }

    if (action === "select-plan") {
      const planId = await validatePlan(body?.planId, link.company_id);
      const { data: currentStudent, error: currentStudentError } = await supabase
        .from("students")
        .select("status")
        .eq("id", link.student_id)
        .eq("company_id", link.company_id)
        .maybeSingle();
      if (currentStudentError || !currentStudent) {
        throw new HttpError(500, `Falha ao carregar status do aluno: ${currentStudentError?.message || "aluno não encontrado"}`);
      }
      const { error } = await supabase
        .from("students")
        .update({
          selected_plan_id: planId,
          status: ["active", "awaiting_renewal"].includes(currentStudent.status || "")
            ? currentStudent.status
            : "pending",
          sales_stage: ["active", "awaiting_renewal"].includes(currentStudent.status || "")
            ? "active"
            : "payment_pending",
        })
        .eq("id", link.student_id)
        .eq("company_id", link.company_id);
      if (error) throw new HttpError(500, `Falha ao selecionar plano: ${error.message}`);
      return json({ ok: true });
    }

    if (action === "record-event") {
      await recordRecoveryEvent(link, body);
      return json({ ok: true });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    console.error("public-payment-context:", error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erro interno";
    return json({ error: message }, status);
  }
});
