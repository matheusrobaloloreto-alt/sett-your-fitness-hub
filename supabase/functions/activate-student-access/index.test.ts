import { handleActivateStudentAccess } from "./index.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const callerId = "10000000-0000-4000-8000-000000000001";
const studentId = "20000000-0000-4000-8000-000000000001";
const companyId = "30000000-0000-4000-8000-000000000001";
const jwtPart = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = `${jwtPart({ alg: "HS256", typ: "JWT" })}.${jwtPart({ sub: callerId, exp: 4102444800 })}.fixture`;

async function runFixture(opts: {
  role?: string; staff?: unknown; staffError?: boolean;
  company?: string | null; existingUser?: string | null; authorization?: string | null;
} = {}) {
  const originalFetch = globalThis.fetch;
  const envKeys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const previous = envKeys.map((key) => Deno.env.get(key));
  Deno.env.set("SUPABASE_URL", "https://fixture.supabase.invalid");
  Deno.env.set("SUPABASE_ANON_KEY", "fixture-anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture-service");
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ path: url.pathname, method, body });
    if (url.pathname === "/auth/v1/user") return json({ id: callerId, aud: "authenticated" });
    if (url.pathname === "/rest/v1/user_roles" && method === "GET") {
      return json(url.searchParams.get("user_id") === `eq.${callerId}` ? [{ role: opts.role || "trainer" }] : []);
    }
    if (url.pathname === "/rest/v1/company_members" && method === "GET") return json([]);
    if (url.pathname === "/rest/v1/students" && method === "GET") return json(url.searchParams.has("id") ? {
      id: studentId, company_id: opts.company === undefined ? companyId : opts.company,
      user_id: opts.existingUser || null, full_name: "Fixture", email: "fixture@example.invalid",
    } : []);
    if (url.pathname === "/rest/v1/rpc/is_company_staff") {
      return opts.staffError ? json({ message: "fixture RPC unavailable", code: "XX000" }, 500)
        : json(opts.staff === undefined ? true : opts.staff);
    }
    if (url.pathname === "/auth/v1/admin/users" && method === "POST") return json({
      id: "40000000-0000-4000-8000-000000000001", email: "fixture@example.invalid",
    });
    if (url.pathname === "/rest/v1/students" && method === "PATCH") return json({
      id: studentId, user_id: "40000000-0000-4000-8000-000000000001",
    });
    if (url.pathname.startsWith("/rest/v1/") && method !== "GET") return json(body);
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  }) as typeof fetch;
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    const authorization = opts.authorization === undefined ? `Bearer ${token}` : opts.authorization;
    if (authorization) headers.set("Authorization", authorization);
    const response = await handleActivateStudentAccess(new Request("https://edge.invalid", {
      method: "POST", headers, body: JSON.stringify({ student_id: studentId }),
    }));
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
    envKeys.forEach((key, index) => {
      if (previous[index] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[index]!);
    });
  }
}

for (const role of ["trainer", "coordinator", "admin", "master"]) {
  Deno.test(`${role} activates only after exact student-company staff validation`, async () => {
    const result = await runFixture({ role });
    assert(result.status === 200 && result.body.success === true, `unexpected status ${result.status}`);
    const check = result.calls.findIndex((call) => call.path === "/rest/v1/rpc/is_company_staff");
    assert(JSON.stringify(result.calls[check]?.body) === JSON.stringify({ _user_id: callerId, _company_id: companyId }), "wrong staff identity or company");
    assert(result.calls.findIndex((call) => call.path === "/auth/v1/admin/users") > check, "account effect preceded tenant check");
  });
}

for (const opts of [
  { staff: false }, { staff: null }, { staff: "true" }, { company: null },
  { staff: false, existingUser: "private-linked-user" },
  { staffError: true }, { staffError: true, existingUser: "private-linked-user" },
]) {
  Deno.test(`denies tenant mismatch or unavailable validation before effects: ${JSON.stringify(opts)}`, async () => {
    const result = await runFixture(opts);
    assert(result.status === (opts.staffError ? 503 : 403), `unexpected status ${result.status}`);
    assert(!("user_id" in result.body), "existing account identity leaked");
    assert(result.calls.every((call) => !call.path.startsWith("/auth/v1/admin/") &&
      !(call.path.startsWith("/rest/v1/") && call.path !== "/rest/v1/rpc/is_company_staff" && call.method !== "GET")), "account effect reached after denial");
  });
}

Deno.test("student role and missing bearer remain denied before tenant or account effects", async () => {
  const student = await runFixture({ role: "student" });
  assert(student.status === 403, "student gained staff permission");
  assert(!student.calls.some((call) => call.path === "/rest/v1/students"), "student reached target lookup");
  const anonymous = await runFixture({ authorization: null });
  assert(anonymous.status === 401 && anonymous.calls.length === 0, "missing bearer reached backend");
});
