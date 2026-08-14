import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814120000_wearables_secure_foundation.sql"),
  "utf8",
).toLowerCase();

describe("wearables migration security contract", () => {
  it("creates every reproducibility table", () => {
    for (const table of [
      "wearable_devices",
      "wearable_credentials",
      "wearable_consents",
      "wearable_sync_cursors",
      "wearable_leases",
      "wearable_events",
      "wearable_data",
      "wearable_workouts",
    ]) expect(sql).toContain(`table if not exists public.${table}`);
  });

  it("keeps credential and coordination tables away from browser roles", () => {
    expect(sql).toContain("revoke all on public.wearable_credentials from public, anon, authenticated");
    expect(sql).toContain("revoke all on public.wearable_sync_cursors from public, anon, authenticated");
    expect(sql).not.toMatch(/grant select on public\.wearable_credentials[^;]*authenticated/);
  });

  it("quarantines legacy tokens and provides atomic state consumption and leases", () => {
    expect(sql).not.toContain("drop column if exists access_token");
    expect(sql).not.toContain("drop column if exists refresh_token");
    expect(sql).toContain("column grant deliberately excludes any legacy plaintext token");
    expect(sql).toContain("delete from public.wearable_oauth_states");
    expect(sql).toContain("function public.acquire_wearable_lease");
  });

  it("enforces own-student, staff and master reads without raw membership", () => {
    expect(sql.match(/enable row level security/g)?.length).toBeGreaterThanOrEqual(8);
    expect(sql).toContain("s.user_id = auth.uid()");
    expect(sql).toContain("public.is_company_staff(auth.uid(), company_id)");
    expect(sql).not.toContain("get_user_company_id(auth.uid())");
    expect(sql).toContain("public.has_role(auth.uid(), 'master')");
  });

  it("derives tenant, actor and provider identity from authoritative relationships", () => {
    expect(sql).toContain("function public.enforce_wearable_tenant_integrity");
    expect(sql).toContain("wearable_company_mismatch");
    expect(sql).toContain("wearable_actor_mismatch");
    expect(sql).toContain("wearable_provider_mismatch");
    expect(sql).toContain("requested_scopes text[]");
  });
});
