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

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") || "";
const ASAAS_BASE_URL = "https://api.asaas.com/v3";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function claimEvent(eventId: string, eventType: string) {
  const { error } = await supabaseAdmin.from("integration_webhook_events").insert({
    provider: "asaas",
    event_id: eventId,
    event_type: eventType,
    status: "processing",
  });
  if (!error) return "claimed" as const;
  if (error.code !== "23505") throw new Error(`Falha ao registrar evento Asaas: ${error.message}`);

  const { data: existing } = await supabaseAdmin.from("integration_webhook_events")
    .select("status")
    .eq("provider", "asaas")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.status === "completed") return "completed" as const;
  if (existing?.status !== "failed") return "processing" as const;

  const { error: retryError } = await supabaseAdmin.from("integration_webhook_events").update({
    status: "processing",
    error: null,
    received_at: new Date().toISOString(),
    processed_at: null,
  }).eq("provider", "asaas").eq("event_id", eventId);
  if (retryError) throw new Error(`Falha ao reabrir evento Asaas: ${retryError.message}`);
  return "claimed" as const;
}

async function createInvoice(asaasPaymentId: string) {
  try {
    const today = businessDateYmd();
    const res = await fetch(`${ASAAS_BASE_URL}/invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: ASAAS_API_KEY,
      },
      body: JSON.stringify({
        payment: asaasPaymentId,
        serviceDescription: "Consultoria em educação física",
        observations: "Nota fiscal referente ao plano BN Performance Training",
        effectiveDate: today,
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
    const data = await res.json();
    if (!res.ok) {
      console.error("Erro ao emitir NFS-e:", JSON.stringify(data));
      return null;
    }
    console.log("NFS-e agendada com sucesso:", JSON.stringify(data));
    return data;
  } catch (err) {
    console.error("Falha ao criar NFS-e:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let claimedEventId: string | null = null;
  let claimedFunnelEvent: { studentId: string; eventKey: string } | null = null;
  try {
    if (!ASAAS_WEBHOOK_TOKEN || !ASAAS_API_KEY) {
      throw new HttpError(503, "Asaas webhook is not configured");
    }

    const token = req.headers.get("asaas-access-token");
    if (token !== ASAAS_WEBHOOK_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = await req.json();
    const { event: eventType, payment } = event;

    if (!payment?.id) {
      console.log("No payment data in event, ignoring");
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const asaasPaymentId = payment.id;
    const remotePaymentResponse = await fetch(`${ASAAS_BASE_URL}/payments/${encodeURIComponent(asaasPaymentId)}`, {
      headers: { access_token: ASAAS_API_KEY },
    });
    if (!remotePaymentResponse.ok) {
      throw new HttpError(502, `Falha ao confirmar pagamento no Asaas (HTTP ${remotePaymentResponse.status})`);
    }
    const remotePayment = await remotePaymentResponse.json();
    if (remotePayment?.id !== asaasPaymentId) throw new HttpError(400, "Pagamento Asaas divergente");
    const newStatus = remotePayment.status;
    const eventId = String(event.id || `${eventType}:${asaasPaymentId}:${newStatus}`);
    const eventClaim = await claimEvent(eventId, String(eventType || "payment"));
    if (eventClaim === "completed") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (eventClaim === "processing") {
      return new Response(JSON.stringify({ received: false, retry: true }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    claimedEventId = eventId;
    console.log("Asaas webhook", JSON.stringify({ eventType, asaasPaymentId, newStatus }));

    // Update payment status in our database
    const { data: localPayment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .update({ status: newStatus })
      .eq("asaas_payment_id", asaasPaymentId)
      .select("student_id, company_id, plan_id, enrollment_id")
      .single();

    if (paymentError) {
      console.error("Error updating payment:", paymentError);
      throw new HttpError(409, "Pagamento confirmado no provedor, mas não encontrado localmente.");
    }

    const studentId = localPayment.student_id;
    const companyId = localPayment.company_id;
    const planId = localPayment.plan_id;
    if (!companyId || !planId) {
      throw new Error("Pagamento sem empresa ou plano imutável; ciclo de ativação bloqueado.");
    }
    const isConfirmed = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(newStatus);

    // Handle status transitions
    if (isConfirmed) {
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

      const eventKey = `payment_lifecycle:${asaasPaymentId}`;
      const shouldApplyExternalEffects = await claimFunnelEvent(supabaseAdmin, {
        studentId,
        companyId,
        eventType: "payment_confirmed",
        eventKey,
        payload: { payment_id: asaasPaymentId, status: newStatus, plan_id: planId },
      });
      if (shouldApplyExternalEffects) claimedFunnelEvent = { studentId, eventKey };

      console.log(
        `Student ${studentId} activated after payment ${asaasPaymentId}`
      );

      if (shouldApplyExternalEffects) {
        // Emitir NFS-e automaticamente
        await createInvoice(asaasPaymentId);

        if (isFirstActivation && previousStudent.full_name) {
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
          }).eq("id", studentId).eq("company_id", companyId);
        }
        }
      }
      if (shouldApplyExternalEffects && claimedFunnelEvent) {
        await completeFunnelEvent(
          supabaseAdmin,
          claimedFunnelEvent.studentId,
          claimedFunnelEvent.eventKey,
          "completed",
        );
        claimedFunnelEvent = null;
      }
    } else if (newStatus === "OVERDUE") {
      await supabaseAdmin
        .from("enrollments")
        .update({ payment_status: "overdue" })
        .eq("student_id", studentId)
        .eq("company_id", companyId)
        .eq("status", "active");

      console.log(`Student ${studentId} payment overdue`);
    } else if (
      newStatus === "REFUNDED" ||
      newStatus === "DELETED" ||
      newStatus === "REFUND_REQUESTED"
    ) {
      await supabaseAdmin
        .from("students")
        .update({ status: "pending" })
        .eq("id", studentId)
        .eq("company_id", companyId);

      await supabaseAdmin
        .from("enrollments")
        .update({ payment_status: "refunded" })
        .eq("student_id", studentId)
        .eq("company_id", companyId)
        .eq("status", "active");

      console.log(`Student ${studentId} deactivated after refund/delete`);
    }

    const { error: completionError } = await supabaseAdmin.from("integration_webhook_events").update({
      status: "completed",
      processed_at: new Date().toISOString(),
    }).eq("provider", "asaas").eq("event_id", eventId);
    if (completionError) throw new Error(`Falha ao concluir evento Asaas: ${completionError.message}`);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    if (claimedFunnelEvent) {
      await completeFunnelEvent(
        supabaseAdmin,
        claimedFunnelEvent.studentId,
        claimedFunnelEvent.eventKey,
        "failed",
        message,
      );
    }
    if (claimedEventId) {
      await supabaseAdmin.from("integration_webhook_events").update({
        status: "failed",
        error: message.slice(0, 1000),
        processed_at: new Date().toISOString(),
      }).eq("provider", "asaas").eq("event_id", claimedEventId);
    }
    return new Response(JSON.stringify({ error: message }), {
      status: error instanceof HttpError ? error.status : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
