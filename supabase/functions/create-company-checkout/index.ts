import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getPlatformProductSettings, companyTiers, type CompanyTier, type PlatformSettingsClient } from "../_shared/platform-product-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ORIGINS = new Set([
  "https://www.settapp.com.br",
  "https://settapp.com.br",
  "https://bn-performance-webapp-matheus.netlify.app",
  "http://localhost:8080",
]);

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new HttpError(401, "No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new HttpError(401, `Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new HttpError(401, "User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Check if user is master
    const { data: isMaster, error: roleError } = await supabaseClient.rpc("has_role", { _user_id: user.id, _role: "master" });
    if (roleError) throw new HttpError(503, "Unable to verify user role");
    if (!isMaster) throw new HttpError(403, "Only master users can create company checkouts");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new HttpError(503, "Stripe is not configured");

    const { companyId, tier } = await req.json();
    if (!companyId || !tier) throw new HttpError(400, "companyId and tier are required");
    if (!UUID_RE.test(companyId)) throw new HttpError(400, "Invalid companyId");
    if (!companyTiers.includes(tier)) throw new HttpError(400, "Invalid tier");
    const catalog = await getPlatformProductSettings(supabaseClient as unknown as PlatformSettingsClient);
    const tierDefinition = catalog.settings.tiers[tier as CompanyTier];
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
    const price = await stripe.prices.retrieve(tierDefinition.stripe_price_id);
    if (!price.active || price.currency !== "brl" || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.unit_amount !== Math.round(tierDefinition.monthly_price * 100)) {
      throw new HttpError(422, "Preço Stripe incompatível com o catálogo. Revise o ID e o valor mensal.");
    }

    // Find or create Stripe customer (billing data lives in restricted company_billing table)
    const { data: billing } = await supabaseClient
      .from("company_billing")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .maybeSingle();

    let customerId = billing?.stripe_customer_id;
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

      // Save customer ID to billing table
      await supabaseClient
        .from("company_billing")
        .upsert({ company_id: companyId, stripe_customer_id: customerId }, { onConflict: "company_id" });

      logStep("Stripe customer created/found", { customerId });
    }

    const requestOrigin = req.headers.get("origin") || "";
    const origin = ALLOWED_ORIGINS.has(requestOrigin) ? requestOrigin : "https://www.settapp.com.br";
    const priceId = tierDefinition.stripe_price_id;

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
      status: error instanceof HttpError ? error.status : 500,
    });
  }
});
