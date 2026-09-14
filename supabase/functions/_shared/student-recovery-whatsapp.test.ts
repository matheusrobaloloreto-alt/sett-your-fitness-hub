import {
  handleStudentRecoveryWhatsApp,
  RECOVERY_NEUTRAL_RESPONSE,
} from "./student-recovery-whatsapp.ts";

const HASH_SECRET = "0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-09-14T12:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type FakeRows = {
  students?: any[];
  whatsapp_chats?: any[];
  whatsapp_instances?: any[];
  attempts?: any[];
};

function fakeAdmin(rows: FakeRows = {}) {
  const attempts = rows.attempts || [];
  const generateCalls: any[] = [];
  const authUsers = new Map<string, any>([
    ["user-a", { id: "user-a", email: "student@example.test" }],
  ]);

  const applyFilters = (
    table: string,
    filters: Array<{ op: string; column: string; value: unknown }>,
  ) => {
    let data = table === "student_recovery_whatsapp_attempts"
      ? attempts
      : ((rows as Record<string, any[]>)[table] || []);
    for (const filter of filters) {
      if (filter.op === "eq") {
        data = data.filter((row) => row[filter.column] === filter.value);
      }
      if (filter.op === "not_null") {
        data = data.filter((row) => row[filter.column] != null);
      }
      if (filter.op === "like") {
        const regex = new RegExp(
          `^${
            String(filter.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(
              /%/g,
              ".*",
            )
          }$`,
        );
        data = data.filter((row) =>
          regex.test(String(row[filter.column] || ""))
        );
      }
      if (filter.op === "gte") {
        data = data.filter((row) =>
          new Date(row[filter.column]).getTime() >=
            new Date(String(filter.value)).getTime()
        );
      }
    }
    return data;
  };

  const admin = {
    attempts,
    generateCalls,
    rpc(name: string, params: Record<string, unknown>) {
      if (name === "reserve_student_recovery_whatsapp_attempt") {
        const recentEmail = attempts.filter((attempt) =>
          attempt.requested_email_hash === params.p_requested_email_hash
        ).length;
        const recentIp = params.p_request_ip_hash
          ? attempts.filter((attempt) =>
            attempt.request_ip_hash === params.p_request_ip_hash
          ).length
          : 0;
        if (recentEmail >= 3 || recentIp >= 10) {
          return Promise.resolve({
            data: [{ attempt_id: null, allowed: false }],
            error: null,
          });
        }
        const attempt = {
          id: `attempt-${attempts.length + 1}`,
          requested_email_hash: params.p_requested_email_hash,
          request_ip_hash: params.p_request_ip_hash,
          user_agent_hash: params.p_user_agent_hash,
          result: "reserved",
          created_at: NOW.toISOString(),
        };
        attempts.push(attempt);
        return Promise.resolve({
          data: [{ attempt_id: attempt.id, allowed: true }],
          error: null,
        });
      }
      if (name === "bind_student_recovery_whatsapp_attempt") {
        const current = attempts.find((attempt) =>
          attempt.id === params.p_attempt_id
        );
        const recentStudent = attempts.filter((attempt) =>
          attempt.id !== params.p_attempt_id &&
          attempt.student_id === params.p_student_id
        ).length;
        if (!current || current.result !== "reserved" || recentStudent >= 3) {
          return Promise.resolve({ data: false, error: null });
        }
        current.company_id = params.p_company_id;
        current.student_id = params.p_student_id;
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
    },
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({
            data: { user: authUsers.get(id) || null },
            error: null,
          }),
        generateLink: (params: any) => {
          generateCalls.push(params);
          return Promise.resolve({
            data: {
              properties: {
                action_link:
                  "https://zshrcgbyhzxpnlccssyz.supabase.co/auth/v1/verify?token=secret-recovery-token&type=recovery",
              },
            },
            error: null,
          });
        },
      },
    },
    from(table: string) {
      const filters: Array<{ op: string; column: string; value: unknown }> = [];
      let headCount = false;
      let updateValues: Record<string, unknown> | null = null;
      const query: any = {
        select: (
          _columns?: string,
          options?: { count?: string; head?: boolean },
        ) => {
          headCount = Boolean(options?.head && options?.count === "exact");
          return query;
        },
        eq: (column: string, value: unknown) => {
          filters.push({ op: "eq", column, value });
          return query;
        },
        not: (column: string, operator: string, value: unknown) => {
          if (operator === "is" && value === null) {
            filters.push({ op: "not_null", column, value });
          }
          return query;
        },
        like: (column: string, value: unknown) => {
          filters.push({ op: "like", column, value });
          return query;
        },
        order: () => query,
        gte: (column: string, value: unknown) => {
          filters.push({ op: "gte", column, value });
          const data = applyFilters(table, filters);
          return Promise.resolve(
            headCount
              ? { count: data.length, error: null }
              : { data, error: null },
          );
        },
        limit: (count: number) => {
          const data = applyFilters(table, filters).slice(0, count);
          return Promise.resolve({ data, error: null });
        },
        maybeSingle: () => {
          const data = applyFilters(table, filters);
          return Promise.resolve({ data: data[0] || null, error: null });
        },
        insert: (row: any) => {
          attempts.push({ ...row, created_at: NOW.toISOString() });
          return Promise.resolve({ error: null });
        },
        update: (values: Record<string, unknown>) => {
          updateValues = values;
          return query;
        },
        then: (resolve: (value: unknown) => void) => {
          if (updateValues) {
            for (const row of applyFilters(table, filters)) {
              Object.assign(row, updateValues);
            }
          }
          resolve({ error: null });
        },
      };
      return query;
    },
  };
  return admin;
}

function baseRows(): FakeRows {
  return {
    students: [{
      id: "student-a",
      company_id: "company-a",
      user_id: "user-a",
      email: "student@example.test",
      phone: "+55 (48) 99143-2057",
      whatsapp: null,
      country_code: "BR",
      status: "active",
    }],
    whatsapp_chats: [{
      id: "chat-a",
      company_id: "company-a",
      instance_id: "instance-a",
      remote_jid: "5548991432057@s.whatsapp.net",
      student_id: "student-a",
      last_message_at: NOW.toISOString(),
    }],
    whatsapp_instances: [{
      id: "instance-a",
      company_id: "company-a",
      instance_name: "bn-prod",
      status: "connected",
    }],
  };
}

function baseConfig(fetchImpl: typeof fetch) {
  return {
    enabled: true,
    hashSecret: HASH_SECRET,
    redirectTo: "https://www.settapp.com.br/auth/reset-password",
    provider: { url: "https://evolution.example.test", key: "provider-key" },
    now: () => NOW,
    fetch: fetchImpl,
  };
}

Deno.test("student recovery sends only on a unique auth student and trusted WhatsApp chat", async () => {
  const admin = fakeAdmin(baseRows());
  const fetchBodies: string[] = [];
  const fetchImpl = ((_: string, init?: RequestInit) => {
    fetchBodies.push(String(init?.body || ""));
    return Promise.resolve(
      new Response(JSON.stringify({ key: { id: "provider-id" } }), {
        status: 201,
      }),
    );
  }) as typeof fetch;

  const response = await handleStudentRecoveryWhatsApp(
    admin,
    baseConfig(fetchImpl),
    {
      email: " Student@Example.Test ",
      requestIp: "203.0.113.10",
      userAgent: "Deno test",
    },
  );

  assert(
    JSON.stringify(response.body) === JSON.stringify(RECOVERY_NEUTRAL_RESPONSE),
    "public response is not neutral",
  );
  assert(
    admin.generateCalls.length === 1,
    "recovery link was not generated once",
  );
  assert(
    admin.generateCalls[0].type === "recovery",
    "generateLink did not use recovery type",
  );
  assert(
    admin.generateCalls[0].options.redirectTo.endsWith("/auth/reset-password"),
    "redirectTo missing",
  );
  assert(fetchBodies.length === 1, "provider was not called once");
  assert(
    fetchBodies[0].includes("secret-recovery-token"),
    "provider payload did not receive the in-memory action link",
  );
  const ledger = JSON.stringify(admin.attempts);
  assert(
    admin.attempts.at(-1).result === "accepted",
    "accepted attempt not recorded",
  );
  assert(
    !ledger.includes("secret-recovery-token"),
    "action link leaked to attempt ledger",
  );
  assert(
    !ledger.includes("5548991432057"),
    "phone/JID leaked to attempt ledger",
  );
});

Deno.test("student recovery stays neutral and does not generate a link for unknown accounts", async () => {
  const admin = fakeAdmin({ ...baseRows(), students: [] });
  let fetches = 0;
  const fetchImpl = (() => {
    fetches += 1;
    return Promise.resolve(new Response("{}", { status: 201 }));
  }) as typeof fetch;

  const response = await handleStudentRecoveryWhatsApp(
    admin,
    baseConfig(fetchImpl),
    {
      email: "missing@example.test",
      requestIp: "203.0.113.11",
    },
  );

  assert(response.status === 200, "neutral status changed");
  assert(
    JSON.stringify(response.body) === JSON.stringify(RECOVERY_NEUTRAL_RESPONSE),
    "unknown response is not neutral",
  );
  assert(
    admin.generateCalls.length === 0,
    "generated link for an unknown account",
  );
  assert(fetches === 0, "provider called for an unknown account");
  assert(
    admin.attempts.at(-1).result === "identity_not_found",
    "sanitized unknown result not recorded",
  );
});

Deno.test("student recovery audits invalid input without generating a link", async () => {
  const admin = fakeAdmin(baseRows());
  let fetches = 0;
  const fetchImpl = (() => {
    fetches += 1;
    return Promise.resolve(new Response("{}", { status: 201 }));
  }) as typeof fetch;

  const response = await handleStudentRecoveryWhatsApp(
    admin,
    baseConfig(fetchImpl),
    {
      email: "not-an-email",
      requestIp: "203.0.113.15",
    },
  );

  assert(response.status === 200, "invalid input response was not neutral");
  assert(admin.generateCalls.length === 0, "generated link for invalid input");
  assert(fetches === 0, "provider called for invalid input");
  assert(
    admin.attempts.at(-1).result === "invalid_request",
    "invalid input was not sanitized",
  );
});

Deno.test("student recovery rate-limits by hashed email before generating more links", async () => {
  const admin = fakeAdmin(baseRows());
  let fetches = 0;
  const fetchImpl = (() => {
    fetches += 1;
    return Promise.resolve(new Response("{}", { status: 201 }));
  }) as typeof fetch;

  for (let index = 0; index < 4; index += 1) {
    await handleStudentRecoveryWhatsApp(admin, baseConfig(fetchImpl), {
      email: "student@example.test",
      requestIp: "203.0.113.12",
    });
  }

  assert(
    admin.generateCalls.length === 3,
    `expected 3 generated links, got ${admin.generateCalls.length}`,
  );
  assert(fetches === 3, `expected 3 provider sends, got ${fetches}`);
  assert(
    admin.attempts.length === 3 &&
      admin.attempts.every((attempt) => attempt.result === "accepted"),
    "blocked request must not create an unbounded ledger row",
  );
});

Deno.test("student recovery atomically reserves at most three parallel sends", async () => {
  const admin = fakeAdmin(baseRows());
  let fetches = 0;
  const fetchImpl = (() => {
    fetches += 1;
    return Promise.resolve(new Response("{}", { status: 201 }));
  }) as typeof fetch;

  await Promise.all(
    Array.from(
      { length: 10 },
      () =>
        handleStudentRecoveryWhatsApp(admin, baseConfig(fetchImpl), {
          email: "student@example.test",
          requestIp: "203.0.113.16",
        }),
    ),
  );

  assert(
    admin.generateCalls.length === 3,
    `parallel requests generated ${admin.generateCalls.length} links`,
  );
  assert(fetches === 3, `parallel requests sent ${fetches} messages`);
  assert(
    admin.attempts.length === 3,
    `parallel requests reserved ${admin.attempts.length} ledger rows`,
  );
  assert(
    admin.attempts.every((attempt) => attempt.result === "accepted"),
    "reservation was not finalized",
  );
});

Deno.test("student recovery fails closed when the linked WhatsApp chat no longer matches the student phone", async () => {
  const rows = baseRows();
  rows.whatsapp_chats![0].remote_jid = "5511999999999@s.whatsapp.net";
  const admin = fakeAdmin(rows);
  let fetches = 0;
  const fetchImpl = (() => {
    fetches += 1;
    return Promise.resolve(new Response("{}", { status: 201 }));
  }) as typeof fetch;

  await handleStudentRecoveryWhatsApp(admin, baseConfig(fetchImpl), {
    email: "student@example.test",
    requestIp: "203.0.113.13",
  });

  assert(
    admin.generateCalls.length === 0,
    "generated link before trusted recipient verification",
  );
  assert(
    fetches === 0,
    "provider called before trusted recipient verification",
  );
  assert(
    admin.attempts.at(-1).result === "trusted_whatsapp_missing",
    "recipient mismatch was not sanitized",
  );
});

Deno.test("student recovery sanitizes provider errors and never records provider bodies", async () => {
  const admin = fakeAdmin(baseRows());
  const unsafeBody =
    "raw provider failure for 5548991432057@s.whatsapp.net token=secret-recovery-token api_key=provider-key";
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(unsafeBody, { status: 502 }),
    )) as typeof fetch;

  await handleStudentRecoveryWhatsApp(admin, baseConfig(fetchImpl), {
    email: "student@example.test",
    requestIp: "203.0.113.14",
  });

  const last = admin.attempts.at(-1);
  assert(last.result === "provider_error", "provider error not recorded");
  assert(last.provider_status === 502, "provider status missing");
  const ledger = JSON.stringify(admin.attempts);
  assert(
    !ledger.includes("secret-recovery-token"),
    "provider body token leaked to ledger",
  );
  assert(!ledger.includes("provider-key"), "provider key leaked to ledger");
  assert(!ledger.includes("5548991432057"), "recipient leaked to ledger");
});
