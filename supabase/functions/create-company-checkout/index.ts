import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mapping between tiers and Stripe price IDs
const TIER_PRICES = {
  basic: "price_1T8s8n0JX9nASSiUNWHuxTYM",
  intermediate: "price_1T8s9P0JX9nASSiUERk7XYh2",
  advanced: "price_1T8s9k0JX9nASSiUC8Fx1K2K",
};

const TIER_PRODUCTS = {
  "prod_U76LIOQ0o1AQKR": "basic",
  "prod_U76MUDoCG8wBz9": "intermediate",
  "prod_U76MWcqIAGGYpm": "advanced",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-COMPANY-CHECKOUT] ${step}${detailsStr}`);
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
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Check if user is master
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "master") {
      throw new Error("Only master users can create company checkouts");
    }

    const { companyId, tier } = await req.json();
    if (!companyId || !tier) throw new Error("companyId and tier are required");
    if (!TIER_PRICES[tier as keyof typeof TIER_PRICES]) throw new Error("Invalid tier");
    logStep("Request parsed", { companyId, tier });

    // Get company info
    const { data: company, error: companyError } = await supabaseClient
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) throw new Error("Company not found");
    logStep("Company found", { companyName: company.name });

    // Get owner email
    const { data: ownerAuth } = await supabaseClient.auth.admin.getUserById(company.owner_user_id);
    const ownerEmail = ownerAuth?.user?.email;
    if (!ownerEmail) throw new Error("Company owner email not found");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find or create Stripe customer
    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: ownerEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: ownerEmail,
          name: company.name,
          metadata: { company_id: companyId },
        });
        customerId = customer.id;
      }

      // Save customer ID to company
      await supabaseClient
        .from("companies")
        .update({ stripe_customer_id: customerId })
        .eq("id", companyId);

      logStep("Stripe customer created/found", { customerId });
    }

    const origin = req.headers.get("origin") || "https://bnperformancetraining.lovable.app";
    const priceId = TIER_PRICES[tier as keyof typeof TIER_PRICES];

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/master/companies?success=true&company=${companyId}`,
      cancel_url: `${origin}/master/companies?canceled=true`,
      metadata: { company_id: companyId, tier },
      subscription_data: {
        metadata: { company_id: companyId, tier },
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
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
