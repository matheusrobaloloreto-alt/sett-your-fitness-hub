// Versioned RPC seam. Never fall back to non-transactional writes if migration is missing.
export interface StripeLedgerClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface StripeEventIdentity {
  id: string;
  type: string;
  created: number;
}
export async function claimStripeEventV2(
  client: StripeLedgerClient,
  event: StripeEventIdentity,
  owner: string,
) {
  const { data, error } = await client.rpc("stripe_claim_event_v2", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_created: event.created,
    p_owner: owner,
  });
  if (
    error ||
    !["claimed", "completed", "busy", "reconcile"].includes(String(data))
  ) {
    throw new Error("Stripe durable claim unavailable");
  }
  return data as "claimed" | "completed" | "busy" | "reconcile";
}
export async function applyStripeEventV2(
  client: StripeLedgerClient,
  eventId: string,
  owner: string,
  mutation: {
    companyId: string;
    subscriptionId: string;
    status: string;
    tier: string | null;
  } | null,
) {
  const { data, error } = await client.rpc("stripe_apply_event_v2", {
    p_event_id: eventId,
    p_owner: owner,
    p_company_id: mutation?.companyId ?? null,
    p_subscription_id: mutation?.subscriptionId ?? null,
    p_status: mutation?.status ?? null,
    p_tier: mutation?.tier ?? null,
  });
  if (error || !["applied", "stale", "ignored"].includes(String(data))) {
    throw new Error("Stripe atomic persistence unavailable");
  }
  return data as "applied" | "stale" | "ignored";
}
export async function failStripeEventV2(
  client: StripeLedgerClient,
  eventId: string,
  owner: string,
) {
  const { data, error } = await client.rpc("stripe_fail_event_v2", {
    p_event_id: eventId,
    p_owner: owner,
  });
  // false means another worker owns the event, or the uncertain apply actually committed.
  if (error || typeof data !== "boolean") {
    throw new Error("Stripe failure persistence unavailable");
  }
  return data;
}
