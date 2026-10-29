import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getSubscriptionTier,type StripeCatalogClient } from "../_shared/stripe-catalog-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function claimEvent(client: any, event: Stripe.Event) {
  const { error } = await client.from("integration_webhook_events").insert({
    provider: "stripe",
    event_id: event.id,
    event_type: event.type,
    status: "processing",
  });
  if (!error) return true;
  if (error.code !== "23505") throw new Error(`Falha ao registrar evento Stripe: ${error.message}`);

  const { data: existing } = await client.from("integration_webhook_events")
    .select("status")
    .eq("provider", "stripe")
    .eq("event_id", event.id)
    .maybeSingle();
  if (existing?.status !== "failed") return false;

  await client.from("integration_webhook_events").update({
    status: "processing",
    error: null,
    received_at: new Date().toISOString(),
    processed_at: null,
  }).eq("provider", "stripe").eq("event_id", event.id);
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  let eventId: string | null = null;
  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey || !webhookSecret) throw new HttpError(503, "Stripe webhook is not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new HttpError(401, "Missing Stripe signature");

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch {
      throw new HttpError(400, "Invalid Stripe signature");
    }
    eventId = event.id;
    if (!(await claimEvent(supabaseClient, event))) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("Event parsed", { type: event.type });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.company_id;
        const subscriptionId = session.subscription as string;

        if (companyId && subscriptionId && UUID_RE.test(companyId)) {
          const subscription=await stripe.subscriptions.retrieve(subscriptionId);
          if(subscription.metadata?.company_id!==companyId)throw new Error("Subscription company mismatch");
          const tier=await getSubscriptionTier(supabaseClient as unknown as StripeCatalogClient,subscription.items.data);
          logStep("Processing checkout completion", { companyId, tier, subscriptionId });

          const {error:companyError}=await supabaseClient
            .from("companies")
            .update({
              subscription_status: subscription.status,
              tier,
            })
            .eq("id", companyId);
          if(companyError)throw new Error("Unable to update company subscription");

          await supabaseClient
            .from("company_billing")
            .upsert(
              { company_id: companyId, stripe_subscription_id: subscriptionId },
              { onConflict: "company_id" }
            );

          logStep("Company updated with subscription", { companyId });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;

        if (companyId && UUID_RE.test(companyId)) {
          const tier = await getSubscriptionTier(supabaseClient as unknown as StripeCatalogClient,subscription.items.data);

          logStep("Processing subscription update", { companyId, tier, status: subscription.status });

          const {error:companyError}=await supabaseClient
            .from("companies")
            .update({
              subscription_status: subscription.status,
              tier: tier,
            })
            .eq("id", companyId);
          if(companyError)throw new Error("Unable to update company subscription");

          logStep("Company subscription updated", { companyId, tier });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;

        if (companyId && UUID_RE.test(companyId)) {
          // Unknown/ambiguous billing prices require reconciliation, including cancellation events.
          await getSubscriptionTier(supabaseClient as unknown as StripeCatalogClient,subscription.items.data);
          logStep("Processing subscription cancellation", { companyId });

          await supabaseClient
            .from("companies")
            .update({
              subscription_status: "canceled",
              tier: "basic",
            })
            .eq("id", companyId);

          logStep("Company downgraded to basic", { companyId });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const { data: billings } = await supabaseClient
            .from("company_billing")
            .select("company_id")
            .eq("stripe_subscription_id", subscriptionId);

          if (billings && billings.length > 0) {
            await supabaseClient
              .from("companies")
              .update({ subscription_status: "past_due" })
              .eq("id", billings[0].company_id);

            logStep("Company marked as past due", { companyId: billings[0].company_id });
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    await supabaseClient.from("integration_webhook_events").update({
      status: "completed",
      processed_at: new Date().toISOString(),
    }).eq("provider", "stripe").eq("event_id", event.id);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    if (eventId) {
      await supabaseClient.from("integration_webhook_events").update({
        status: "failed",
        error: errorMessage.slice(0, 1000),
        processed_at: new Date().toISOString(),
      }).eq("provider", "stripe").eq("event_id", eventId);
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof HttpError ? error.status : 500,
    });
  }
});
