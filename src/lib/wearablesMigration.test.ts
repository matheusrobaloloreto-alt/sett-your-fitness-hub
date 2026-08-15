import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814120000_wearables_secure_foundation.sql"),
  "utf8",
).toLowerCase();
const edge = readFileSync(resolve(process.cwd(), "supabase/functions/wearable-connect/index.ts"), "utf8").toLowerCase();
const ui = readFileSync(
  resolve(process.cwd(), "src/components/student/WearableIntegrations.tsx"),
  "utf8",
).toLowerCase();
const legacyHardening = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260718121000_harden_extended_student_modules.sql"),
  "utf8",
).toLowerCase();
const oauthMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260805150000_wearable_connections.sql"),
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
    for (const table of [
      "wearable_oauth_states",
      "wearable_credentials",
      "wearable_sync_cursors",
      "wearable_leases",
      "wearable_events",
    ]) {
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
    }
    expect(sql).toContain("grant all on public.wearable_oauth_states, public.wearable_credentials");
    expect(oauthMigration).toContain("revoke all on public.wearable_oauth_states from public, anon, authenticated");
    expect(oauthMigration).toContain("grant all on public.wearable_oauth_states to service_role");
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
    expect(sql).toContain("connection_status = 'revocation_pending'");
    expect(sql).toContain("credential_delete_after = now() + interval '30 days'");
  });

  it("adds revocation_pending to both fresh and existing device schemas", () => {
    expect(sql.match(/revocation_pending/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("drop constraint if exists wearable_devices_connection_status_check");
    expect(sql).toContain("add constraint wearable_devices_connection_status_check");
  });

  it("replays fresh migrations safely before wearable tables exist", () => {
    expect(legacyHardening).toContain("to_regclass('public.wearable_data') is not null");
    expect(legacyHardening).toContain("to_regclass('public.wearable_devices') is not null");
    expect(legacyHardening).toContain("to_regclass('public.wearable_workouts') is not null");
    expect(legacyHardening).not.toMatch(/^create policy .*wearable/m);
  });

  it("serializes maintenance against sync and commits lifecycle operations transactionally", () => {
    expect(sql).toContain("'sync', 'refresh', 'maintenance'");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("purpose = 'maintenance' or p_purpose = 'maintenance'");
    for (const rpc of [
      "begin_wearable_sync",
      "commit_wearable_sync",
      "fail_wearable_sync",
      "complete_wearable_disconnect",
      "delete_wearable_provider_data",
    ]) {
      expect(sql).toContain(`function public.${rpc}`);
      expect(edge).toContain(`"${rpc}"`);
    }
    expect(sql).toContain("connection_status = 'syncing'");
    expect(sql).toContain("and locked_until > now()");
    expect(sql).toContain("delete from public.wearable_credentials where device_id = v_device.id");
  });

  it("requires active authorization, live pre-exchange recheck and compensating revoke", () => {
    expect(edge).toContain('student.status !== "active"');
    expect(edge.indexOf('eq("status", "active")')).toBeLessThan(edge.indexOf("await exchangeauthorizationcode"));
    expect(edge).toContain("wearable callback compensating revoke failed");
    expect(edge).toContain("issuedexternaluserid");
  });

  it("quarantines legacy devices for reauthorization without reading plaintext tokens", () => {
    expect(sql).toContain("connection_status = 'reauthorization_required'");
    expect(sql).toContain("not exists (\n  select 1 from public.wearable_credentials");
    expect(edge).toContain('"reauthorization_required"');
    expect(edge).not.toContain(".select(\"access_token");
    expect(ui).toContain('state === "reauthorization_required"');
    expect(ui).toContain("const hashistory =");
    expect(ui).toContain("{hashistory && (");
  });

  it("derives stale only from persisted connected state", () => {
    expect(edge).toContain('device.connection_status === "connected"');
  });
});
