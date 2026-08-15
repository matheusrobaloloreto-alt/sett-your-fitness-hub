import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814120000_wearables_secure_foundation.sql"),
  "utf8",
).toLowerCase();
const edge = readFileSync(resolve(process.cwd(), "supabase/functions/wearable-connect/index.ts"), "utf8").toLowerCase();

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
    const deviceColumnGrant = sql.match(/grant select \(([^;]+)\)\s*on public\.wearable_devices to authenticated;/)?.[1] ?? "";
    expect(deviceColumnGrant).not.toContain("access_token");
    expect(deviceColumnGrant).not.toContain("refresh_token");
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
    expect(sql).toContain("function public.commit_wearable_connection");
    expect(sql).toContain("wearable_actor_no_longer_active");
    expect(sql).toContain("coalesce(v_student.status, '') <> 'active'");
  });

  it("rejects expired/replayed OAuth state and binds requested scopes", () => {
    expect(sql).toContain("expires_at > now()");
    expect(sql).toContain("delete from public.wearable_oauth_states");
    expect(edge.indexOf("consume_wearable_oauth_state")).toBeLessThan(edge.indexOf("await exchangeauthorizationcode"));
    expect(edge).toContain("oauth_scope_state_mismatch");
    expect(edge).toContain("actor_user_id");
  });

  it("serializes rotating refresh and persists with compare-and-swap", () => {
    expect(edge).toContain('acquirelease(device.id, "refresh"');
    expect(edge).toContain('.eq("version", version)');
    expect(edge).toContain("refresh_version_conflict");
  });

  it("keeps webhooks fail-closed and data deletion explicit", () => {
    expect(edge).toContain('"webhooks_disabled"');
    expect(edge).toContain('confirm_phrase !== "excluir dados"');
    expect(edge).toContain("revokeprovidertoken");
    expect(edge).toContain('connection_status: revocationstatus === "succeeded"');
    expect(edge).toContain("credential_delete_after");
  });

  it("adds revocation_pending to both fresh and existing device schemas", () => {
    expect(sql.match(/revocation_pending/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("drop constraint if exists wearable_devices_connection_status_check");
    expect(sql).toContain("add constraint wearable_devices_connection_status_check");
  });
});
