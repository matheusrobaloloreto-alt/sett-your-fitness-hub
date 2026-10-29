import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  getSubscriptionTier,
  type StripeCatalogClient,
} from "../_shared/stripe-catalog-policy.ts";

import {
  applyStripeEventV2,
  claimStripeEventV2,
  failStripeEventV2,
} from "../_shared/stripe-event-ledger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    { auth: { persistSession: false } },
  );

  let eventId: string | null = null;
  const owner = crypto.randomUUID();
  let ownsClaim = false;
  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey || !webhookSecret) {
      throw new HttpError(503, "Stripe webhook is not configured");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new HttpError(401, "Missing Stripe signature");

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
      );
    } catch {
      throw new HttpError(400, "Invalid Stripe signature");
    }
    eventId = event.id;
    const claim = await claimStripeEventV2(supabaseClient, event, owner);
    if (claim === "completed") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    if (claim !== "claimed") {
      throw new HttpError(503, "Stripe event requires retry or reconciliation");
    }
    ownsClaim = true;
    logStep("Event parsed", { type: event.type });

    let mutation: {
      companyId: string;
      subscriptionId: string;
      status: string;
      tier: string | null;
    } | null = null;
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.company_id;
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
        if (!companyId || !UUID_RE.test(companyId) || !subscriptionId) {
          throw new Error("Stripe checkout binding missing");
        }
        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId,
        );
        if (subscription.metadata?.company_id !== companyId) {
          throw new Error("Subscription company mismatch");
        }
        const tier = await getSubscriptionTier(
          supabaseClient as unknown as StripeCatalogClient,
          subscription.items.data,
        );
        mutation = {
          companyId,
          subscriptionId,
          status: subscription.status,
          tier,
        };
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;
        if (!companyId || !UUID_RE.test(companyId) || !subscription.id) {
          throw new Error("Stripe subscription binding missing");
        }
        // Preserve price policy even for cancellations: unknown/ambiguous catalog is reconciliation.
        const tier = await getSubscriptionTier(
          supabaseClient as unknown as StripeCatalogClient,
          subscription.items.data,
        );
        const canceled = event.type === "customer.subscription.deleted";
        mutation = {
          companyId,
          subscriptionId: subscription.id,
          status: canceled ? "canceled" : subscription.status,
          tier: canceled ? "basic" : tier,
        };
        break;
      }
      case "invoice.payment_failed": {
        // Basil moved invoice.subscription to parent.subscription_details.subscription.
        const invoice = event.data.object as unknown as {
          subscription?: string | { id: string } | null;
          parent?: {
            subscription_details?: {
              subscription?: string | { id: string } | null;
            };
          };
        };
        const reference = invoice.parent?.subscription_details?.subscription ??
          invoice.subscription;
        const subscriptionId = typeof reference === "string"
          ? reference
          : reference?.id;
        if (!subscriptionId) {
          throw new Error("Stripe invoice subscription missing");
        }
        const { data: billings, error } = await supabaseClient.from(
          "company_billing",
        )
          .select("company_id").eq("stripe_subscription_id", subscriptionId);
        if (
          error || !billings || billings.length !== 1 ||
          !UUID_RE.test(billings[0].company_id)
        ) {
          throw new Error("Stripe invoice tenant binding unavailable");
        }
        mutation = {
          companyId: billings[0].company_id,
          subscriptionId,
          status: "past_due",
          tier: null,
        };
        break;
      }
      default:
        logStep("Unhandled event type");
    }
    // One transaction checks owner/lease + tenant + ordering + row counts, writes business
    // state, and completes the ledger. Ambiguous RPC outcomes are resolved by durable replay.
    await applyStripeEventV2(supabaseClient, event.id, owner, mutation);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    // Do not log provider bodies, identifiers or raw DB errors.
    const errorMessage = error instanceof HttpError
      ? error.message
      : "Stripe webhook persistence failed";
    logStep("ERROR", { message: errorMessage });
    if (eventId && ownsClaim) {
      try {
        await failStripeEventV2(supabaseClient, eventId, owner);
      } catch {
        logStep("Failure state unavailable; lease recovery required");
      }
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof HttpError ? error.status : 500,
    });
  }
});
