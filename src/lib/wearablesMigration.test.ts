import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814121000_wearables_secure_foundation.sql"),
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
const watermarkCastFix = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815170922_fix_wearable_sync_watermark_cast.sql"),
  "utf8",
).toLowerCase();
const deterministicWatermarkFix = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815174923_replace_wearable_sync_deterministically.sql"),
  "utf8",
).toLowerCase();
const oauthMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260805150000_wearable_connections.sql"),
  "utf8",
).toLowerCase();

const rpcSource = (name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf("\n$$;", start);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} must have a complete body`).toBeGreaterThan(start);
  return sql.slice(start, end + 4);
};

describe("wearables migration security contract", () => {
  it("casts provider watermark JSON strings before writing timestamptz cursors", () => {
    expect(watermarkCastFix).toContain("nullif(item.value, '''')::timestamptz");
    expect(watermarkCastFix).toContain("refusing an unverified patch");
    expect(watermarkCastFix).toContain("revoke all on function public.commit_wearable_sync");
    expect(deterministicWatermarkFix).toContain("create or replace function public.commit_wearable_sync");
    expect(deterministicWatermarkFix).toContain("nullif(item.value, '')::timestamptz");
    expect(deterministicWatermarkFix).toContain("unexpected commit_wearable_sync overload");
    expect(deterministicWatermarkFix).not.toContain("pg_get_functiondef");
  });

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
    expect(sql.match(/public\.is_student_company_staff\(auth\.uid\(\), student_id\)/g)?.length).toBe(4);
    expect(sql).not.toContain("public.is_company_staff(auth.uid(), company_id)");
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

  it("reconciles every denormalized tenant and blocks stale sync after reassignment", () => {
    expect(sql).toContain("d.company_id is distinct from s.company_id");
    for (const table of ["wearable_data", "wearable_workouts", "wearable_consents"]) {
      expect(sql).toContain(`update public.${table}`);
    }
    expect(sql.match(/company_id is distinct from s\.company_id/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("v_device.company_id is distinct from v_student_company_id");
    expect(sql).toContain("p_expected_company_id uuid");
    expect(sql).toContain("for update of d, s");
    expect(sql).toContain("sync_tenant_changed");
    expect(sql).toContain("student_id = excluded.student_id");
    expect(sql).toContain("company_id = excluded.company_id");
    expect(edge).toContain("p_actor_user_id: student.actor_user_id");
    expect(edge).toContain("p_expected_company_id: data.company_id");
    expect(sql).toMatch(
      /function public\.fail_wearable_sync\([\s\S]*?p_expected_company_id uuid[\s\S]*?for update of d, s/,
    );
  });

  it("simulates reassignment A to B without staff-A visibility or stale-lease commit", () => {
    const leaseSnapshot = { actor: "student-user", company: "company-a" };
    const currentStudent = { actor: "student-user", company: "company-b", status: "active" };
    const canStaffRead = (staffCompany: string) => staffCompany === currentStudent.company;
    const canCommit = leaseSnapshot.actor === currentStudent.actor &&
      leaseSnapshot.company === currentStudent.company &&
      currentStudent.status === "active";

    expect(canStaffRead("company-a")).toBe(false);
    expect(canStaffRead("company-b")).toBe(true);
    expect(canCommit).toBe(false);
  });

  it("simulates an expired lease reclaimed by a new holder", () => {
    const canPersist = (
      lease: { holder: string; purpose: string; lockedUntil: number },
      expectedHolder: string,
      at: number,
    ) => lease.holder === expectedHolder &&
      lease.purpose === "sync" &&
      lease.lockedUntil > at;
    const expiredLease = { holder: "old-holder", purpose: "sync", lockedUntil: 100 };
    const reclaimedLease = { holder: "new-holder", purpose: "sync", lockedUntil: 300 };

    expect(canPersist(expiredLease, "old-holder", 101)).toBe(false);
    expect(canPersist(reclaimedLease, "old-holder", 150)).toBe(false);
    expect(canPersist(reclaimedLease, "new-holder", 150)).toBe(true);
  });

  it("blocks an OAuth callback during sync, maintenance or a reclaimed lease", () => {
    const callbackCanCommit = (
      leases: Array<{ purpose: "sync" | "refresh" | "maintenance"; lockedUntil: number }>,
      at: number,
    ) => !leases.some((lease) => lease.lockedUntil > at);

    expect(callbackCanCommit([{ purpose: "sync", lockedUntil: 200 }], 150)).toBe(false);
    expect(callbackCanCommit([{ purpose: "maintenance", lockedUntil: 200 }], 150)).toBe(false);
    expect(callbackCanCommit([{ purpose: "sync", lockedUntil: 100 }], 150)).toBe(true);
    expect(callbackCanCommit([{ purpose: "sync", lockedUntil: 300 }], 150)).toBe(false);
  });

  it("keeps the tenant-integrity trigger function unavailable to browser roles", () => {
    expect(sql).toContain(
      "revoke all on function public.enforce_wearable_tenant_integrity() from public, anon, authenticated",
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.enforce_wearable_tenant_integrity\(\)[^;]*(authenticated|anon)/,
    );
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
    expect(sql).toContain("locked_until > clock_timestamp()");
    expect(sql).toContain("delete from public.wearable_credentials where device_id = v_device.id");
  });

  it("uses one deadlock-safe lock order and revalidates a reclaimed lease under lock", () => {
    const lifecycleRpcs: Record<string, string> = {
      begin_wearable_sync: "update public.wearable_devices",
      commit_wearable_sync: "insert into public.wearable_data",
      fail_wearable_sync: "update public.wearable_devices",
      complete_wearable_disconnect: "delete from public.wearable_credentials",
      delete_wearable_provider_data: "delete from public.wearable_data",
    };
    for (const [rpc, firstDmlMarker] of Object.entries(lifecycleRpcs)) {
      const body = rpcSource(rpc);
      const advisory = body.indexOf("pg_advisory_xact_lock(hashtextextended(p_device_id::text, 0))");
      const leaseLock = body.indexOf("from public.wearable_leases", advisory);
      const leaseForUpdate = body.indexOf("for update;", leaseLock);
      const entityLock = body.indexOf("for update of d, s", leaseForUpdate);
      const liveLeaseCheck = body.indexOf("v_lease.locked_until <= clock_timestamp()", entityLock);
      const actorCheck = body.indexOf("v_student_user_id is distinct from p_actor_user_id", liveLeaseCheck);
      const statusCheck = body.indexOf("coalesce(v_student_status", actorCheck);
      const companyCheck = body.indexOf("v_student_company_id", statusCheck);
      const firstDml = body.indexOf(firstDmlMarker, companyCheck);
      expect(advisory, `${rpc}: advisory lock`).toBeGreaterThanOrEqual(0);
      expect(leaseLock, `${rpc}: lease row after advisory`).toBeGreaterThan(advisory);
      expect(leaseForUpdate, `${rpc}: lease FOR UPDATE`).toBeGreaterThan(leaseLock);
      expect(entityLock, `${rpc}: device/student after lease`).toBeGreaterThan(leaseForUpdate);
      expect(liveLeaseCheck, `${rpc}: live expiry check after all locks`).toBeGreaterThan(entityLock);
      expect(actorCheck, `${rpc}: current actor check`).toBeGreaterThan(liveLeaseCheck);
      expect(statusCheck, `${rpc}: current student status check`).toBeGreaterThan(actorCheck);
      expect(companyCheck, `${rpc}: current company check`).toBeGreaterThan(statusCheck);
      expect(firstDml, `${rpc}: checks precede DML`).toBeGreaterThan(companyCheck);
      expect(body).toContain("v_lease.holder is distinct from p_holder");
      expect(body).toContain("v_lease.purpose is distinct from");
    }
    for (const rpc of ["acquire_wearable_lease", "release_wearable_lease"]) {
      expect(rpcSource(rpc)).toContain(
        "pg_advisory_xact_lock(hashtextextended(p_device_id::text, 0))",
      );
    }

    const connection = rpcSource("commit_wearable_connection");
    const advisory = connection.indexOf("pg_advisory_xact_lock(hashtextextended(p_device_id::text, 0))");
    const leaseLock = connection.indexOf("from public.wearable_leases", advisory);
    const leaseForUpdate = connection.indexOf("for update;", leaseLock);
    const deviceLock = connection.indexOf("from public.wearable_devices", leaseForUpdate);
    const deviceForUpdate = connection.indexOf("for update;", deviceLock);
    const studentLock = connection.indexOf("from public.students", deviceForUpdate);
    const studentForUpdate = connection.indexOf("for update;", studentLock);
    const busyCheck = connection.indexOf("locked_until > clock_timestamp()", studentForUpdate);
    const actorCheck = connection.indexOf("v_student.user_id is distinct from p_actor_user_id", busyCheck);
    const statusCheck = connection.indexOf("coalesce(v_student.status, '') <> 'active'", actorCheck);
    const companyCheck = connection.indexOf("v_student.company_id is distinct from p_company_id", busyCheck);
    const firstDml = connection.indexOf("insert into public.wearable_devices", statusCheck);
    expect(leaseLock).toBeGreaterThan(advisory);
    expect(leaseForUpdate).toBeGreaterThan(leaseLock);
    expect(deviceLock).toBeGreaterThan(leaseForUpdate);
    expect(deviceForUpdate).toBeGreaterThan(deviceLock);
    expect(studentLock).toBeGreaterThan(deviceForUpdate);
    expect(studentForUpdate).toBeGreaterThan(studentLock);
    expect(busyCheck).toBeGreaterThan(studentForUpdate);
    expect(actorCheck).toBeGreaterThan(busyCheck);
    expect(companyCheck).toBeGreaterThan(busyCheck);
    expect(statusCheck).toBeGreaterThan(actorCheck);
    expect(firstDml).toBeGreaterThan(statusCheck);
    expect(firstDml).toBeGreaterThan(companyCheck);
    expect(connection).toContain("raise exception 'device_busy'");
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
