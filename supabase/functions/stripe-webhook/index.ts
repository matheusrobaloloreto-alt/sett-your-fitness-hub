import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const PRODUCT_TO_TIER: Record<string, string> = {
  "prod_U76LIOQ0o1AQKR": "basic",
  "prod_U76MUDoCG8wBz9": "intermediate",
  "prod_U76MWcqIAGGYpm": "advanced",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.text();
    
    // For production, verify webhook signature
    // const sig = req.headers.get("stripe-signature");
    // const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    // const event = stripe.webhooks.constructEvent(body, sig!, webhookSecret!);
    
    const event = JSON.parse(body) as Stripe.Event;
    logStep("Event parsed", { type: event.type });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.company_id;
        const tier = session.metadata?.tier;
        const subscriptionId = session.subscription as string;

        if (companyId && subscriptionId) {
          logStep("Processing checkout completion", { companyId, tier, subscriptionId });

          await supabaseClient
            .from("companies")
            .update({
              stripe_subscription_id: subscriptionId,
              subscription_status: "active",
              tier: tier || "basic",
            })
            .eq("id", companyId);

          logStep("Company updated with subscription", { companyId });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;

        if (companyId) {
          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = PRODUCT_TO_TIER[productId] || "basic";

          logStep("Processing subscription update", { companyId, productId, tier, status: subscription.status });

          await supabaseClient
            .from("companies")
            .update({
              subscription_status: subscription.status,
              tier: tier,
            })
            .eq("id", companyId);

          logStep("Company subscription updated", { companyId, tier });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;

        if (companyId) {
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
          const { data: companies } = await supabaseClient
            .from("companies")
            .select("id")
            .eq("stripe_subscription_id", subscriptionId);

          if (companies && companies.length > 0) {
            await supabaseClient
              .from("companies")
              .update({ subscription_status: "past_due" })
              .eq("id", companies[0].id);

            logStep("Company marked as past due", { companyId: companies[0].id });
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
