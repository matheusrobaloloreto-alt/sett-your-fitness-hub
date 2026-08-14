import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("atomic anamnesis invite submission", () => {
  const edge = readFileSync("supabase/functions/public-anamnesis/index.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260814210000_atomic_anamnesis_invite_submit.sql",
    "utf8",
  );
  const app = readFileSync("src/App.tsx", "utf8");

  it("routes both Studio operations through the shared access resolver", () => {
    const resolverOffset = edge.indexOf("await resolvePublicAnamnesisAccess(body");
    expect(resolverOffset).toBeGreaterThan(0);
    expect(edge.indexOf('action === "studio_context"')).toBeGreaterThan(resolverOffset);
    expect(edge.indexOf('action === "studio_submit"')).toBeGreaterThan(resolverOffset);
    expect(edge).toContain("assertInviteStudentTenant(access.invite, student)");
    expect(edge).toContain("companyId: access.invite.company_id");
    expect(edge).toContain("studentId: access.invite.student_id");
  });

  it("uses the same improved form for the real opaque-invite route", () => {
    expect(app).toContain('path="/anamnese-convite/:token"');
    expect(app).toContain('path="/anamnese-convite/:token" element={<RouteTransition><PublicAnamnesis />');
    expect(app).not.toContain("<StudioAnamnese />");
  });

  it("locks, tenant-checks and consumes a pending invite exactly once", () => {
    expect(migration).toContain("where token = _token\n  for update");
    expect(migration).toContain("invite_row.status <> 'pending'");
    expect(migration).toContain("invite_row.expires_at < now()");
    expect(migration).toContain("id = invite_row.student_id\n    and company_id = invite_row.company_id");
    expect(migration).toContain("and status = 'pending'");
    expect(migration).toContain("anamnesis invite already consumed");
  });

  it("keeps the atomic write private to the Edge Function service role", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(edge).toContain('supabase.rpc("submit_anamnesis_invite_atomic"');
  });

  it("validates invite submissions before the atomic consume callback", () => {
    const validationOffset = edge.indexOf("consumeValidatedAnamnesisInvite(");
    const consumeOffset = edge.indexOf("async () => await submitInviteAtomic(", validationOffset);
    expect(validationOffset).toBeGreaterThan(0);
    expect(consumeOffset).toBeGreaterThan(validationOffset);
    expect(edge).toContain("getCustomFields(student.company_id, true)");
  });
});
