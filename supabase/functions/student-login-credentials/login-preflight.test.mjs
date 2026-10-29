import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";
const COMPANY = "10000000-0000-4000-8000-000000000001",
  STUDENT = "20000000-0000-4000-8000-000000000001",
  ACTOR = "30000000-0000-4000-8000-000000000001",
  CHAT = "40000000-0000-4000-8000-000000000001";
function setup(
  {
    ambiguous = false,
    changed = false,
    replay = false,
    dbError = false,
    providerConfigured = false,
    duplicateOwner = false,
    lateDuplicate = false,
    claimUnavailable = false,
    completionUnavailable = false,
  } = {},
) {
  const effects = [];
  let served;
  const student = {
    id: STUDENT,
    company_id: COMPANY,
    phone: "2025550123",
    whatsapp: ambiguous ? "2025550199" : "2025550123",
    country_code: "US",
    updated_at: "2026-10-29T10:00:00Z",
    user_id: "50000000-0000-4000-8000-000000000001",
    email: "synthetic@example.invalid",
    full_name: "Synthetic",
  };
  const chat = {
    id: CHAT,
    company_id: COMPANY,
    student_id: STUDENT,
    remote_jid: "12025550123@s.whatsapp.net",
    instance_id: "60000000-0000-4000-8000-000000000001",
  };
  student.phone = ambiguous ? "+12025550199" : "+12025550123";
  student.whatsapp = "+12025550123";
  let reads = 0;
  const query = (table) => {
    let offset = 0;
    const q = {
      select: () => q,
      eq: () => q,
      limit: () => q,
      order: () => q,
      range: (start) => {
        offset = start;
        return q;
      },
      maybeSingle: async () => ({
        data: table === "students"
          ? {
            ...student,
            updated_at: changed && ++reads > 1
              ? "2026-10-29T11:00:00Z"
              : student.updated_at,
          }
          : table === "whatsapp_chats"
          ? chat
          : table === "whatsapp_instances"
          ? {
            id: chat.instance_id,
            company_id: COMPANY,
            status: "connected",
            instance_name: "synthetic",
          }
          : null,
        error: dbError ? {} : null,
      }),
      single: async () => ({ data: student, error: null }),
      then: (resolve) =>
        Promise.resolve({
          data: table === "whatsapp_chats"
            ? [chat]
            : table === "students"
            ? lateDuplicate
              ? offset === 0
                ? [
                  student,
                  ...Array.from(
                    { length: 499 },
                    (_, i) => ({
                      ...student,
                      id: `filler-${i}`,
                      phone: "+12025550199",
                      whatsapp: "+12025550199",
                    }),
                  ),
                ]
                : [{ ...student, id: ACTOR }]
              : duplicateOwner
              ? [student, { ...student, id: ACTOR }]
              : [student]
            : table === "user_roles"
            ? [{ role: "admin" }]
            : [],
          error: null,
        }).then(resolve),
    };
    return q;
  };
  const client = {
    from: query,
    rpc: async (name) => {
      effects.push(name);
      if (name === "has_role") return { data: true, error: null };
      if (name === "get_user_company_id") return { data: COMPANY, error: null };
      if (
        name === "claim_student_login_generation_v1" ||
        name === "claim_student_login_send_v1"
      ) return { data: !replay, error: claimUnavailable ? {} : null };
      if (name === "complete_student_login_claim_v1") {
        return { data: true, error: completionUnavailable ? {} : null };
      }
      return { data: null, error: null };
    },
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: ACTOR } },
        error: null,
      }),
      admin: {
        updateUserById: async () => {
          effects.push("reset-password");
          return { data: { user: { id: student.user_id } }, error: null };
        },
      },
    },
  };
  class HttpError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  const account = {
    getLinkedStudentAccount: async () => ({ userId: student.user_id }),
    ensureStudentAccountMembership: async () => {
      effects.push("membership");
    },
    createStudentAccount: async () => {
      effects.push("create-account");
      return student.user_id;
    },
  };
  const modules = new Map();
  function load(url) {
    const key = String(url);
    if (modules.has(key)) return modules.get(key);
    const source = fs.readFileSync(url, "utf8").replace(
      "if (import.meta.main)",
      "if (false)",
    );
    const javascript = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    const exports = {};
    modules.set(key, exports);
    vm.runInNewContext(javascript, {
      exports,
      require: (specifier) =>
        specifier.includes("tenant-auth")
          ? {
            HttpError,
            isUuid: (x) => typeof x === "string" && /^[a-f\d-]{36}$/.test(x),
            assertTenantAccess: async () => ({ companyId: COMPANY }),
          }
          : specifier.includes("student-account-access")
          ? account
          : specifier.includes("company-feature-entitlements")
          ? { requireCompanyFeature: async () => {} }
          : specifier.startsWith(".")
          ? load(new URL(specifier, url))
          : { createClient: () => client },
      crypto: webcrypto,
      Response,
      Request,
      AbortSignal,
      URL,
      Date,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      btoa,
      atob,
      console: { log() {}, error() {} },
      Deno: {
        env: {
          get: (name) =>
            !providerConfigured &&
              [
                "EVOLUTION_API_URL",
                "EVOLUTION_API_KEY",
                "WHATSAPP_WEBHOOK_SECRET",
              ].includes(name)
              ? ""
              : name === "SUPABASE_SERVICE_ROLE_KEY"
              ? "synthetic-signing-only"
              : name === "EVOLUTION_API_URL"
              ? "https://provider.invalid"
              : "synthetic",
        },
        serve: (handler) => served = handler,
      },
      fetch: (url, options) => {
        if (
          String(url).includes("/instance/connectionState/") &&
          options?.method === "GET"
        ) return Promise.resolve(Response.json({ state: "open" }));
        effects.push("forbidden-send");
        throw Error("provider send forbidden");
      },
    });
    return exports;
  }
  const helper = load(
    new URL("../_shared/student-login-credentials.ts", import.meta.url),
  );
  const credentials = load(new URL("./index.ts", import.meta.url));
  const request = (body) =>
    new Request("http://localhost/synthetic", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic" },
      body: JSON.stringify(body),
    });
  return {
    helper,
    client,
    student,
    chat,
    effects,
    async token() {
      const snapshot = await helper.loadStudentLoginSnapshot(client, {
        companyId: COMPANY,
        studentId: STUDENT,
        chatId: CHAT,
      });
      return (await helper.issueStudentLoginToken(
        snapshot,
        ACTOR,
        "synthetic-signing-only",
      )).token;
    },
    async generate(token, extra = {}) {
      return credentials.handleStudentLoginCredentials(
        request({
          action: "generate-login-credentials",
          student_id: STUDENT,
          company_id: COMPANY,
          chat_id: CHAT,
          remote_jid: chat.remote_jid,
          preflight_token: token,
          ...extra,
        }),
      );
    },
    async manager(body) {
      load(new URL("../whatsapp-manager/index.ts", import.meta.url));
      return served(request(body));
    },
  };
}
test("opening/legacy request cannot reset password without explicit action/token", async () => {
  const f = setup();
  const response = await f.generate(null, { action: undefined });
  assert.equal(response.status, 400);
  assert.ok(!f.effects.includes("reset-password"));
  assert.ok(!f.effects.includes("membership"));
});
test("read-only manager preflight is available without provider config and has no auth effects", async () => {
  const f = setup();
  const res = await f.manager({
    action: "preflight-student-login",
    companyId: COMPANY,
    studentId: STUDENT,
    chatId: CHAT,
  });
  assert.equal(res.status, 200);
  const dto = await res.json();
  assert.equal(dto.ready, true);
  assert.equal(dto.studentId, STUDENT);
  assert.equal(typeof dto.preflightToken, "string");
  assert.equal(typeof dto.stateFingerprint, "string");
  assert.ok(!f.effects.includes("reset-password"));
  assert.ok(!f.effects.includes("claim_student_login_generation_v1"));
});
test("ambiguous contact fails preflight before credential helper", async () => {
  const f = setup({ ambiguous: true });
  const res = await f.manager({
    action: "preflight-student-login",
    companyId: COMPANY,
    studentId: STUDENT,
    chatId: CHAT,
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "whatsapp_student_phone_ambiguous");
  assert.ok(!f.effects.includes("reset-password"));
});
test("explicit generation consumes nonce and returns destination-bound send token", async () => {
  const f = setup();
  const res = await f.generate(await f.token());
  assert.equal(res.status, 200);
  const dto = await res.json();
  assert.equal(typeof dto.loginSendToken, "string");
  assert.equal(dto.companyId, COMPANY);
  assert.ok(
    f.effects.indexOf("claim_student_login_generation_v1") <
      f.effects.indexOf("reset-password"),
  );
});
test("stale snapshot, replay or forged token cannot mutate credentials", async () => {
  for (const mode of ["changed", "replay", "forged"]) {
    const f = setup({ changed: mode === "changed", replay: mode === "replay" });
    const token = await f.token();
    const res = await f.generate(mode === "forged" ? token + "x" : token);
    assert.equal(res.status, 409);
    assert.ok(!f.effects.includes("reset-password"));
    assert.ok(!f.effects.includes("membership"));
  }
});

test("tampered, expired, cross actor and cross purpose token fail without auth/provider effects", async () => {
  const f = setup();
  const snapshot = await f.helper.loadStudentLoginSnapshot(f.client, {
    companyId: COMPANY,
    studentId: STUDENT,
    chatId: CHAT,
  });
  const token = await f.token();
  for (const [actor, purpose] of [[STUDENT, "generate"], [ACTOR, "send"]]) {
    await assert.rejects(() =>
      f.helper.verifyStudentLoginToken(
        token,
        snapshot,
        actor,
        "synthetic-signing-only",
        purpose,
      )
    );
  }
  const now = Date.now;
  try {
    Date.now = () => now() + 121000;
    await assert.rejects(() =>
      f.helper.verifyStudentLoginToken(
        token,
        snapshot,
        ACTOR,
        "synthetic-signing-only",
      )
    );
  } finally {
    Date.now = now;
  }
  assert.ok(!f.effects.includes("reset-password"));
});
test("snapshot detects changed email, chat student and stored destination, not only updated_at", async () => {
  for (const change of ["email", "chat", "jid"]) {
    const f = setup();
    const token = await f.token();
    if (change === "email") f.student.email = "changed@example.invalid";
    if (change === "chat") f.chat.student_id = ACTOR;
    if (change === "jid") f.chat.remote_jid = "12025550199@s.whatsapp.net";
    const res = await f.generate(token);
    assert.equal(res.status, 409);
    assert.ok(!f.effects.includes("reset-password"));
  }
});
test("send checks fresh snapshot and durable nonce immediately before provider POST", async () => {
  for (const mode of ["stale", "replay"]) {
    const f = setup({ replay: mode === "replay", providerConfigured: true });
    const snapshot = await f.helper.loadStudentLoginSnapshot(f.client, {
      companyId: COMPANY,
      studentId: STUDENT,
      chatId: CHAT,
    });
    const issued = await f.helper.issueStudentLoginToken(
      snapshot,
      ACTOR,
      "synthetic-signing-only",
      "send",
    );
    if (mode === "stale") f.student.updated_at = "2026-10-29T12:00:00Z";
    const res = await f.manager({
      action: "send-message",
      companyId: COMPANY,
      studentId: STUDENT,
      chatId: CHAT,
      remoteJid: f.chat.remote_jid,
      content: "synthetic login",
      loginAccess: { studentId: STUDENT, preflightToken: issued.token },
    });
    assert.equal(res.status, 409);
    assert.ok(!f.effects.includes("forbidden-send"));
  }
});

test("tenant-local duplicate canonical owner and read errors prevent access preflight", async () => {
  for (const options of [{ duplicateOwner: true }, { dbError: true }]) {
    const f = setup(options);
    const res = await f.manager({
      action: "preflight-student-login",
      companyId: COMPANY,
      studentId: STUDENT,
      chatId: CHAT,
    });
    assert.equal(res.status, options.dbError ? 503 : 409);
    assert.ok(!f.effects.includes("reset-password"));
    assert.ok(!f.effects.includes("claim_student_login_generation_v1"));
  }
});
test("claim database outage prevents all credential mutations", async () => {
  const f = setup({ claimUnavailable: true });
  const res = await f.generate(await f.token());
  assert.equal(res.status, 503);
  assert.ok(!f.effects.includes("reset-password"));
  assert.ok(!f.effects.includes("membership"));
});
test("uncertain completion never returns or retries a generated password", async () => {
  const f = setup({ completionUnavailable: true });
  const res = await f.generate(await f.token());
  assert.equal(res.status, 503);
  assert.ok(!Object.hasOwn(await res.json(), "password"));
  assert.equal(f.effects.filter((x) => x === "reset-password").length, 1);
});

test("access preflight checks later tenant pages before claiming unique phone ownership", async () => {
  const f = setup({ lateDuplicate: true });
  const res = await f.manager({
    action: "preflight-student-login",
    companyId: COMPANY,
    studentId: STUDENT,
    chatId: CHAT,
  });
  assert.equal(res.status, 409);
  assert.ok(!f.effects.includes("reset-password"));
});
