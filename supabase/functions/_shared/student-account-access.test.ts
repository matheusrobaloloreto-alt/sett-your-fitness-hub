import { handleStudentLoginCredentials } from "../student-login-credentials/index.ts";
import { handleActivateStudentAccess } from "../activate-student-access/index.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const callerId = "10000000-0000-4000-8000-000000000001";
const studentId = "20000000-0000-4000-8000-000000000001";
const companyId = "30000000-0000-4000-8000-000000000001";
const accountId = "40000000-0000-4000-8000-000000000001";
const newAccountId = "40000000-0000-4000-8000-000000000002";
const email = "student@example.invalid";
const jwtPart = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(
    /\//g,
    "_",
  );
const token = `${jwtPart({ alg: "HS256", typ: "JWT" })}.${
  jwtPart({ sub: callerId, exp: 4102444800 })
}.fixture`;
type Call = { url: URL; method: string; body: unknown; headers: Headers };
type Fixture = {
  linked?: boolean;
  roles?: Array<{ role: string }> | null;
  links?: Array<{ id: string; company_id: string; user_id: string }> | null;
  memberships?: Array<{ company_id: string }> | null;
  lookupStatus?: number;
  lookupCode?: string;
  missingAuthUser?: boolean;
  authEmail?: string;
  collision?: string;
  validationError?: "roles" | "links" | "membership" | "callerRoles";
  writeError?: "role" | "membership" | "link" | "password";
  emptyLink?: boolean;
  emptyInsert?: "role" | "membership";
  callerRole?: string;
  anonymousSession?: boolean;
  staff?: unknown;
  anonymous?: boolean;
};

async function runFixture(
  handler: (req: Request) => Promise<Response>,
  opts: Fixture = {},
) {
  const originalFetch = globalThis.fetch;
  const envKeys = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const previous = envKeys.map((key) => Deno.env.get(key));
  Deno.env.set("SUPABASE_URL", "https://fixture.supabase.invalid");
  Deno.env.set("SUPABASE_ANON_KEY", "fixture-anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture-service");
  const calls: Call[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Supabase-Api-Version": "2024-01-01",
      },
    });
  const failed = () => json({ message: "fixture failure", code: "XX000" }, 500);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert(
      url.hostname === "fixture.supabase.invalid",
      "fixture attempted a real backend call",
    );
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    if (url.pathname === "/auth/v1/user") {
      return json({ id: callerId, aud: "authenticated" });
    }
    if (url.pathname === "/rest/v1/rpc/has_role") {
      return json(opts.callerRole === "master");
    }
    if (url.pathname === "/rest/v1/rpc/get_user_company_id") {
      return json(companyId);
    }
    if (url.pathname === "/rest/v1/rpc/is_company_staff") {
      return json(opts.staff ?? true);
    }
    if (url.pathname === "/rest/v1/user_roles" && method === "GET") {
      const caller = url.searchParams.get("user_id") === `eq.${callerId}`;
      if (opts.validationError === (caller ? "callerRoles" : "roles")) {
        return failed();
      }
      const existing = url.searchParams.get("user_id") === `eq.${accountId}`;
      return json(
        caller
          ? [{ role: opts.callerRole || "trainer" }]
          : opts.roles === undefined
          ? (existing ? [{ role: "student" }] : [])
          : opts.roles,
      );
    }
    if (url.pathname === "/rest/v1/students" && method === "GET") {
      if (url.searchParams.has("id")) {
        return json({
          id: studentId,
          company_id: companyId,
          user_id: opts.linked === false ? null : accountId,
          full_name: "Fixture Student",
          email,
        });
      }
      if (url.searchParams.get("user_id") === `eq.${callerId}`) {
        return json(null);
      }
      if (opts.validationError === "links") return failed();
      const existing = url.searchParams.get("user_id") === `eq.${accountId}`;
      return json(
        opts.links === null
          ? null
          : opts.links === undefined
          ? (existing && opts.linked !== false
            ? [{ id: studentId, company_id: companyId, user_id: accountId }]
            : [])
          : opts.links.filter((link) =>
            url.searchParams.get("user_id") === `eq.${link.user_id}`
          ),
      );
    }
    if (url.pathname === "/rest/v1/company_members" && method === "GET") {
      if (opts.validationError === "membership") return failed();
      return json(
        opts.memberships === undefined
          ? (url.searchParams.get("user_id") === `eq.${accountId}`
            ? [{ company_id: companyId }]
            : [])
          : opts.memberships,
      );
    }
    if (
      url.pathname === `/auth/v1/admin/users/${accountId}` && method === "GET"
    ) {
      if (opts.lookupStatus) {
        return json({
          code: opts.lookupCode || "unexpected_failure",
          message: "fixture lookup failure",
        }, opts.lookupStatus);
      }
      return json(
        opts.missingAuthUser
          ? {}
          : { id: accountId, email: opts.authEmail || email },
      );
    }
    if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
      if (opts.collision) {
        return json({
          code: "email_exists",
          message: "A user with this email address has already been registered",
        }, 422);
      }
      return json({ id: newAccountId, email });
    }
    // Expose the old vulnerable fallback using a fixture account, never a real identity.
    if (url.pathname === "/auth/v1/admin/users" && method === "GET") {
      return json({
        users: [{
          id: accountId,
          email,
          app_metadata: { role: opts.collision },
        }],
      });
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/") && method === "PUT") {
      return opts.writeError === "password"
        ? failed()
        : json({ id: accountId, email });
    }
    if (url.pathname === "/rest/v1/user_roles" && method === "POST") {
      return opts.writeError === "role"
        ? failed()
        : json(opts.emptyInsert === "role" ? null : body);
    }
    if (url.pathname === "/rest/v1/company_members" && method === "POST") {
      return opts.writeError === "membership"
        ? failed()
        : json(opts.emptyInsert === "membership" ? null : body);
    }
    if (url.pathname === "/rest/v1/students" && method === "PATCH") {
      if (opts.writeError === "link") return failed();
      return json(
        opts.emptyLink ? [] : { id: studentId, user_id: newAccountId },
      );
    }
    throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
  }) as typeof fetch;
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    const callerToken = opts.anonymousSession
      ? `${jwtPart({ alg: "HS256", typ: "JWT" })}.${
        jwtPart({ sub: callerId, exp: 4102444800, is_anonymous: true })
      }.fixture`
      : token;
    if (!opts.anonymous) headers.set("Authorization", `Bearer ${callerToken}`);
    const response = await handler(
      new Request("https://edge.invalid", {
        method: "POST",
        headers,
        body: JSON.stringify({ student_id: studentId }),
      }),
    );
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
    envKeys.forEach((key, index) => {
      if (previous[index] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[index]!);
    });
  }
}

function effects(calls: Call[]) {
  return calls.filter((call) =>
    call.method !== "GET" && !call.url.pathname.startsWith("/rest/v1/rpc/")
  );
}

for (
  const [name, handler] of [
    ["credentials", handleStudentLoginCredentials],
    ["activation", handleActivateStudentAccess],
  ] as const
) {
  for (const role of ["trainer", "coordinator", "admin", "master", "unknown"]) {
    Deno.test(`${name}: linked ${role} account is rejected before all effects`, async () => {
      const result = await runFixture(handler, {
        roles: [{ role: "student" }, { role }],
      });
      assert(result.status === 409, `unexpected status ${result.status}`);
      assert(
        effects(result.calls).length === 0,
        "identity collision reached an effect",
      );
    });
  }
  for (
    const collision of ["trainer", "master", "foreign", "unlinked-student"]
  ) {
    Deno.test(`${name}: unlinked email collision (${collision}) never reuses the account`, async () => {
      const result = await runFixture(handler, { linked: false, collision });
      assert(result.status === 409, `unexpected status ${result.status}`);
      assert(
        !result.calls.some((call) =>
          call.url.pathname === "/auth/v1/admin/users" && call.method === "GET"
        ),
        "global account lookup reached",
      );
      assert(
        effects(result.calls).every((call) =>
          call.url.pathname === "/auth/v1/admin/users" && call.method === "POST"
        ),
        "collision reset or relinked an account",
      );
      assert(
        !result.body.password && !result.body.temp_password &&
          !result.body.user_id,
        "collision leaked credentials or identity",
      );
    });
  }
  for (
    const [label, opts] of [
      ["foreign membership", {
        memberships: [{ company_id: "foreign-company" }],
      }],
      ["multiple memberships", {
        memberships: [{ company_id: companyId }, {
          company_id: "foreign-company",
        }],
      }],
      ["other student", {
        links: [{
          id: "other-student",
          company_id: companyId,
          user_id: accountId,
        }],
      }],
      ["multiple student links", {
        links: [{ id: studentId, company_id: companyId, user_id: accountId }, {
          id: "other-student",
          company_id: companyId,
          user_id: accountId,
        }],
      }],
      ["foreign student link", {
        links: [{
          id: studentId,
          company_id: "foreign-company",
          user_id: accountId,
        }],
      }],
      ["missing exact student link", { links: [] }],
      ["different auth email", { authEmail: "other@example.invalid" }],
    ] as Array<[string, Fixture]>
  ) {
    Deno.test(`${name}: ${label} fails closed with no effects`, async () => {
      const result = await runFixture(handler, opts);
      assert(result.status === 409, `unexpected status ${result.status}`);
      assert(
        effects(result.calls).length === 0,
        "invalid account reached an effect",
      );
    });
  }
  for (
    const validationError of [
      "roles",
      "links",
      "membership",
      "callerRoles",
    ] as const
  ) {
    Deno.test(`${name}: ${validationError} lookup failure has zero effects`, async () => {
      const result = await runFixture(handler, { validationError });
      assert(result.status === 503, `unexpected status ${result.status}`);
      assert(
        effects(result.calls).length === 0,
        "failed validation reached an effect",
      );
    });
  }
  for (const key of ["roles", "links", "memberships"] as const) {
    Deno.test(`${name}: malformed ${key} validation has zero effects`, async () => {
      const result = await runFixture(handler, { [key]: null });
      assert(result.status === 503, `unexpected status ${result.status}`);
      assert(
        effects(result.calls).length === 0,
        "malformed validation reached an effect",
      );
    });
  }
  for (
    const opts of [
      { lookupStatus: 500 },
      { lookupStatus: 403 },
      { lookupStatus: 404 },
      { missingAuthUser: true },
    ]
  ) {
    Deno.test(`${name}: ambiguous auth lookup ${JSON.stringify(opts)} has zero effects`, async () => {
      const result = await runFixture(handler, opts);
      assert(result.status === 503, `unexpected status ${result.status}`);
      assert(
        effects(result.calls).length === 0,
        "auth lookup failure reached an effect",
      );
    });
  }
  for (
    const opts of [{ anonymous: true }, { anonymousSession: true }, {
      callerRole: "student",
    }, { staff: false }]
  ) {
    Deno.test(`${name}: preserves caller and tenant denial ${JSON.stringify(opts)}`, async () => {
      const result = await runFixture(handler, opts);
      assert(
        result.status === (opts.anonymous || opts.anonymousSession ? 401 : 403),
        `unexpected status ${result.status}`,
      );
      assert(
        effects(result.calls).length === 0,
        "denied caller reached an effect",
      );
    });
  }
  Deno.test(`${name}: fresh account succeeds with a conditional link and insert-only membership`, async () => {
    const result = await runFixture(handler, {
      linked: false,
      roles: [],
      memberships: [],
    });
    assert(result.status === 200, `unexpected status ${result.status}`);
    assert(result.body.user_id === newAccountId, "wrong new account");
    const link = result.calls.find((call) => call.method === "PATCH");
    assert(
      link?.url.searchParams.get("user_id") === "is.null",
      "student link can overwrite concurrent access",
    );
    assert(
      link?.url.searchParams.get("company_id") === `eq.${companyId}`,
      "student link lost tenant constraint",
    );
    const membership = result.calls.find((call) =>
      call.url.pathname === "/rest/v1/company_members" && call.method === "POST"
    );
    assert(
      membership && !membership.url.searchParams.has("on_conflict") &&
        !membership.headers.get("Prefer")?.includes("merge-duplicates"),
      "membership can replace another company",
    );
    assert(
      !result.calls.some((call) => call.method === "PUT"),
      "new account unnecessarily resets a password",
    );
  });
  for (const writeError of ["role", "membership", "link"] as const) {
    Deno.test(`${name}: ${writeError} write failure cannot report success or credentials`, async () => {
      const result = await runFixture(handler, {
        linked: false,
        roles: [],
        memberships: [],
        writeError,
      });
      assert(result.status >= 400, `unexpected success ${result.status}`);
      assert(
        !result.body.success && !result.body.password &&
          !result.body.temp_password,
        "failed provisioning returned credentials",
      );
    });
  }
  Deno.test(`${name}: a zero-row link is not successful provisioning`, async () => {
    const result = await runFixture(handler, {
      linked: false,
      roles: [],
      memberships: [],
      emptyLink: true,
    });
    assert(
      result.status >= 400 && !result.body.password &&
        !result.body.temp_password,
      "zero-row link reported success",
    );
  });
  for (const emptyInsert of ["role", "membership"] as const) {
    Deno.test(`${name}: missing ${emptyInsert} write evidence is not success`, async () => {
      const result = await runFixture(handler, {
        linked: false,
        roles: [],
        memberships: [],
        emptyInsert,
      });
      assert(
        result.status >= 400 && !result.body.password &&
          !result.body.temp_password,
        "missing write evidence reported success",
      );
    });
  }
}

Deno.test("credentials: existing exact student resets only after complete identity validation", async () => {
  const result = await runFixture(handleStudentLoginCredentials);
  assert(
    result.status === 200 && result.body.password &&
      result.body.user_id === accountId,
    "valid reset failed",
  );
  const writes = effects(result.calls);
  assert(
    writes.length === 1 && writes[0].method === "PUT",
    "valid existing identity was relinked or reclassified",
  );
  for (
    const path of [
      "/rest/v1/user_roles",
      "/rest/v1/students",
      "/rest/v1/company_members",
    ]
  ) {
    assert(
      result.calls.findLastIndex((call) =>
        call.url.pathname === path && call.method === "GET"
      ) < result.calls.indexOf(writes[0]),
      "effect preceded validation",
    );
  }
});

Deno.test("credentials: genuine user_not_found 404 creates a fresh account without email reuse", async () => {
  const result = await runFixture(handleStudentLoginCredentials, {
    lookupStatus: 404,
    lookupCode: "user_not_found",
    links: [{ id: studentId, company_id: companyId, user_id: accountId }],
  });
  assert(
    result.status === 200 && result.body.user_id === newAccountId,
    `genuine orphan could not create access: ${result.status} ${
      JSON.stringify(result.body)
    } ${
      result.calls.map((call) => `${call.method} ${call.url.pathname}`).join(
        ", ",
      )
    }`,
  );
  const link = result.calls.find((call) => call.method === "PATCH");
  assert(
    link?.url.searchParams.get("user_id") === `eq.${accountId}`,
    "orphan replacement can overwrite a new link",
  );
  assert(
    !result.calls.some((call) => call.method === "PUT"),
    "orphan flow reset an existing auth account",
  );
});

Deno.test("credentials: password update failure does not return a generated credential", async () => {
  const result = await runFixture(handleStudentLoginCredentials, {
    writeError: "password",
  });
  assert(
    result.status >= 400 && !result.body.password,
    "failed reset leaked generated password",
  );
});

for (const role of ["trainer", "coordinator", "admin", "master"]) {
  Deno.test(`credentials: ${role} can reset an exact student in the same company`, async () => {
    const result = await runFixture(handleStudentLoginCredentials, {
      callerRole: role,
    });
    assert(
      result.status === 200 && result.body.password,
      "same-company staff could not reset student access",
    );
  });
}

for (const writeError of ["role", "membership"] as const) {
  Deno.test(`credentials: existing student's ${writeError} failure prevents password reset`, async () => {
    const result = await runFixture(handleStudentLoginCredentials, {
      roles: [],
      memberships: [],
      writeError,
    });
    assert(
      result.status === 503 && !result.body.password,
      "failed identity persistence returned password",
    );
    assert(
      !result.calls.some((call) => call.method === "PUT"),
      "password reset preceded identity persistence",
    );
  });
}

Deno.test("activation: existing valid access is reported without changing the account", async () => {
  const result = await runFixture(handleActivateStudentAccess);
  assert(
    result.status === 400 && effects(result.calls).length === 0,
    "activation changed existing valid access",
  );
});
