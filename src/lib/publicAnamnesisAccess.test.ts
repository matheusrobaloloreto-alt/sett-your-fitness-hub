import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertInviteStudentTenant,
  resolvePublicAnamnesisAccess,
} from "../../supabase/functions/_shared/public-anamnesis-access";

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";

describe("public anamnesis access", () => {
  it("rejects a public student UUID when there is no invite or authenticated owner", async () => {
    const assertStudentAccess = vi.fn();
    await expect(resolvePublicAnamnesisAccess({ accessKey: STUDENT_ID }, {
      findInvite: vi.fn().mockResolvedValue(null),
      getAuthenticatedClaims: vi.fn().mockResolvedValue(null),
      assertStudentAccess,
    })).rejects.toMatchObject({ status: 401 });
    expect(assertStudentAccess).not.toHaveBeenCalled();
  });

  it("accepts an opaque, unexpired invite without exposing the student UUID", async () => {
    await expect(resolvePublicAnamnesisAccess({ accessKey: "opaque-invite-token" }, {
      findInvite: vi.fn().mockResolvedValue({
        id: "invite-1",
        student_id: STUDENT_ID,
        company_id: "22222222-2222-4222-8222-222222222222",
        expires_at: "2099-01-01T00:00:00.000Z",
        status: "pending",
      }),
      getAuthenticatedClaims: vi.fn(),
      assertStudentAccess: vi.fn(),
    })).resolves.toMatchObject({ studentId: STUDENT_ID, source: "invite" });
  });

  it("rejects invite reuse and cross-tenant student targets", async () => {
    await expect(resolvePublicAnamnesisAccess({ token: "used-token" }, {
      findInvite: vi.fn().mockResolvedValue({
        id: "invite-used",
        student_id: STUDENT_ID,
        company_id: "22222222-2222-4222-8222-222222222222",
        status: "completed",
      }),
      getAuthenticatedClaims: vi.fn(),
      assertStudentAccess: vi.fn(),
    })).rejects.toMatchObject({ status: 409 });

    expect(() => assertInviteStudentTenant({
      id: "invite-tenant-a",
      student_id: STUDENT_ID,
      company_id: "22222222-2222-4222-8222-222222222222",
      status: "pending",
    }, {
      id: STUDENT_ID,
      company_id: "33333333-3333-4333-8333-333333333333",
    })).toThrowError(/empresas diferentes/i);
  });

  it("preserves UUID compatibility only for an authenticated owner or staff member", async () => {
    const assertStudentAccess = vi.fn().mockResolvedValue({
      companyId: "22222222-2222-4222-8222-222222222222",
    });
    await expect(resolvePublicAnamnesisAccess({ studentId: STUDENT_ID }, {
      findInvite: vi.fn().mockResolvedValue(null),
      getAuthenticatedClaims: vi.fn().mockResolvedValue({ sub: "user-1" }),
      assertStudentAccess,
    })).resolves.toMatchObject({ studentId: STUDENT_ID, source: "authenticated" });
    expect(assertStudentAccess).toHaveBeenCalledWith({ sub: "user-1" }, STUDENT_ID);
  });

  it("routes the legacy page through accessKey instead of trusting studentId", () => {
    const page = readFileSync("src/pages/PublicAnamnesis.tsx", "utf8");
    const edge = readFileSync("supabase/functions/public-anamnesis/index.ts", "utf8");
    expect(page).toContain('body: { action: "context", accessKey }');
    expect(page).not.toContain('body: { action: "context", studentId }');
    expect(edge).toContain("resolvePublicAnamnesisAccess(body");
    expect(edge).toContain("assertTenantAccess(supabase, claims, { studentId: requestedStudentId })");
  });
});
