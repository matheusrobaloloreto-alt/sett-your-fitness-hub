// No network/env permissions: load the real handler, replacing only its SDK
// import and server registration. All local production helpers stay real.
// Red proof: append -- --source-ref=457da98 and grant --allow-run=git.
type Row = Record<string, unknown>;
type DbResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};
type Call = { path: string; body: Row };
type Handler = (req: Request) => Promise<Response>;
type Failure = "http" | "network" | "json" | "db-error" | "db-throw";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, label = "value") {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    }
    return value;
  };
  const got = JSON.stringify(canonical(actual));
  const want = JSON.stringify(canonical(expected));
  assert(got === want, `${label}: expected ${want}, got ${got}`);
}

const COMPANY = "tenant-qa";
const USER = "user-qa";
const CHAT = "chat-qa";
const JID = "12025550123@s.whatsapp.net"; // Synthetic reserved example number.
const NUMBER = "12025550123";
const SIGNED_URL = "https://storage.invalid/synthetic-object";
const SOURCE = new URL("./index.ts", import.meta.url);
const sourceRef = Deno.args.find((arg) => arg.startsWith("--source-ref="))
  ?.slice(13);
let source = sourceRef
  ? await (async () => {
    const result = await new Deno.Command("git", {
      args: [
        "show",
        `${sourceRef}:supabase/functions/whatsapp-manager/index.ts`,
      ],
      cwd: new URL("../../../", import.meta.url),
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert(result.success, "Cannot read requested baseline handler");
    return new TextDecoder().decode(result.stdout);
  })()
  : await Deno.readTextFile(SOURCE);

const globals = globalThis as typeof globalThis & {
  __signatureQaClient?: () => unknown;
};
let activeClient: Fixture["client"] | undefined;
globals.__signatureQaClient = () => {
  assert(activeClient, "SDK called outside isolated request");
  return activeClient;
};
const sdkImport =
  'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";';
assert(
  source.includes(sdkImport),
  "SDK import changed; update the test loader explicitly",
);
const sdkUrl = `data:application/javascript,${
  encodeURIComponent(
    "export function createClient() { return globalThis.__signatureQaClient(); }",
  )
}`;
source = source.replace(
  sdkImport,
  `import { createClient } from ${JSON.stringify(sdkUrl)};`,
)
  .replace(
    /from "(\.\.\/[^"]+)"/g,
    (_, path: string) => `from ${JSON.stringify(new URL(path, SOURCE).href)}`,
  );

let handler: Handler | undefined;
const originalServe = Object.getOwnPropertyDescriptor(Deno, "serve")!;
try {
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    value: (callback: Handler) => {
      handler = callback;
    },
  });
  await import(`data:application/typescript,${encodeURIComponent(source)}`);
} finally {
  Object.defineProperty(Deno, "serve", originalServe);
}
assert(handler, "Real handler was not registered");

class Query implements PromiseLike<DbResult> {
  filters: Row = {};
  operation = "select";
  payload: Row = {};
  constructor(private fixture: Fixture, private table: string) {}
  select(_columns: string) {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters[key] = value;
    return this;
  }
  limit(_count: number) {
    return this;
  }
  insert(payload: Row) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }
  maybeSingle() {
    return this.resolve();
  }
  single() {
    return this.resolve();
  }
  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled, onrejected);
  }
  private async resolve(): Promise<DbResult> {
    const f = this.fixture;
    f.queries.push({
      table: this.table,
      operation: this.operation,
      filters: { ...this.filters },
    });
    const result = (data: unknown): DbResult => ({ data, error: null });
    if (this.operation === "insert") {
      assert(this.table === "whatsapp_messages", "Unexpected database insert");
      if (this.payload.message_id_external === "signature-id") {
        if (f.failure === "db-throw") {
          throw new Error("Synthetic persistence exception");
        }
        if (f.failure === "db-error") {
          return {
            data: null,
            error: { code: "23505", message: "Synthetic duplicate" },
          };
        }
      }
      const row = { id: `db-${f.writes.length}`, ...this.payload };
      f.writes.push(row);
      return result(row);
    }
    if (this.operation === "update") {
      f.writes.push({ table: this.table, ...this.payload });
      return result(null);
    }
    if (this.table === "profiles") {
      if (f.profileError) {
        return { data: null, error: { message: "Synthetic profile error" } };
      }
      return result(
        this.filters.user_id === USER ? { full_name: f.name } : null,
      );
    }
    if (this.table === "whatsapp_chats") {
      return result(
        this.filters.id === CHAT && this.filters.company_id === COMPANY
          ? {
            id: CHAT,
            remote_jid: JID,
            student_id: null,
            contact_name: "Synthetic contact",
            instance_id: "instance-qa",
          }
          : null,
      );
    }
    if (this.table === "whatsapp_instances") {
      return result(
        f.connected && this.filters.company_id === COMPANY &&
          this.filters.id === "instance-qa"
          ? {
            id: "instance-qa",
            instance_name: "qa-instance",
            status: "connected",
            phone_number: NUMBER,
          }
          : null,
      );
    }
    throw new Error(`Unexpected database read: ${this.table}`);
  }
}

class Fixture {
  name: string | null = "QA Operator";
  profileError = false;
  authenticated = true;
  permitted = true;
  connected = true;
  failure?: Failure;
  audioFallback = false;
  primaryFails = false;
  mimeType = "image/png";
  calls: Call[] = [];
  writes: Row[] = [];
  queries: { table: string; operation: string; filters: Row }[] = [];
  client = {
    auth: {
      getClaims: (_token: string) =>
        Promise.resolve({
          data: this.authenticated ? { claims: { sub: USER } } : null,
          error: this.authenticated
            ? null
            : { message: "Synthetic invalid JWT" },
        }),
    },
    rpc: (name: string, args: Row) => {
      equal(args._user_id, USER, "authenticated RPC identity");
      if (name === "has_role") {
        return Promise.resolve({
          data: this.permitted && args._role === "trainer",
          error: null,
        });
      }
      if (name === "get_user_company_id") {
        return Promise.resolve({ data: COMPANY, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from: (table: string) => new Query(this, table),
    storage: {
      from: (bucket: string) => {
        equal(bucket, "whatsapp-media", "storage bucket");
        return {
          list: (_directory: string, options: { search: string }) =>
            Promise.resolve({
              data: [{
                name: options.search,
                metadata: { mimetype: this.mimeType, size: 128 },
              }],
              error: null,
            }),
          createSignedUrl: (_path: string, _duration: number) =>
            Promise.resolve({ data: { signedUrl: SIGNED_URL }, error: null }),
        };
      },
    },
  };
  fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    equal(url.origin, "https://evolution.invalid", "provider origin");
    const body: Row = typeof init?.body === "string"
      ? JSON.parse(init.body)
      : {};
    this.calls.push({ path: url.pathname, body });
    if (url.pathname === "/instance/connectionState/qa-instance") {
      return Response.json({ instance: { state: "open" } });
    }
    assert(url.pathname.startsWith("/message/"), "Unexpected provider route");
    equal(init?.method, "POST", "provider send method");
    equal(body.number, NUMBER, "verified provider recipient");
    const followup = url.pathname === "/message/sendText/qa-instance" &&
      this.calls.some((call) =>
        /sendWhatsAppAudio|sendSticker|sendMedia/.test(call.path)
      );
    if (followup) {
      if (this.failure === "network") {
        throw new TypeError("Synthetic fetch failure");
      }
      if (this.failure === "http") {
        return Response.json({ error: "Synthetic rejection" }, { status: 503 });
      }
      if (this.failure === "json") return new Response("invalid json");
      return Response.json({ key: { id: "signature-id" } });
    }
    if (
      this.primaryFails ||
      (this.audioFallback && url.pathname.includes("sendWhatsAppAudio"))
    ) {
      return Response.json({ error: "Synthetic primary failure" }, {
        status: 404,
      });
    }
    return Response.json({ key: { id: "primary-id" } });
  };
  get sends() {
    return this.calls.filter((call) => call.path.startsWith("/message/"));
  }
  get profileReads() {
    return this.queries.filter((query) => query.table === "profiles");
  }
  async request(overrides: Row = {}, auth = true) {
    const envDescriptor = Object.getOwnPropertyDescriptor(Deno.env, "get")!;
    const originalFetch = globalThis.fetch;
    assert(!activeClient, "Concurrent fixtures are unsupported");
    activeClient = this.client;
    try {
      Object.defineProperty(Deno.env, "get", {
        configurable: true,
        value: (key: string) => {
          const values: Record<string, string> = {
            SUPABASE_URL: "https://database.invalid",
            SUPABASE_ANON_KEY: "synthetic-anon",
            SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
            EVOLUTION_API_URL: "https://evolution.invalid",
            EVOLUTION_API_KEY: "synthetic-provider",
            WHATSAPP_WEBHOOK_SECRET: "synthetic-webhook",
          };
          return values[key];
        },
      });
      globalThis.fetch = this.fetch;
      const response = await handler!(
        new Request("https://handler.invalid", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(auth ? { Authorization: "Bearer synthetic-jwt" } : {}),
          },
          body: JSON.stringify({
            action: "send-message",
            companyId: COMPANY,
            chatId: CHAT,
            remoteJid: JID,
            content: "Hello",
            ...overrides,
          }),
        }),
      );
      return { status: response.status, body: await response.json() as Row };
    } finally {
      Object.defineProperty(Deno.env, "get", envDescriptor);
      globalThis.fetch = originalFetch;
      activeClient = undefined;
    }
  }
}

function media(type: string, caption: string | undefined = "Caption"): Row {
  return {
    action: "send-media",
    mediatype: type,
    caption,
    fileName: "qa.pdf",
    mediaSource: "chat-upload",
    mediaStorageBucket: "whatsapp-media",
    mediaStoragePath: `${COMPANY}/${CHAT}/synthetic-object`,
    mediaUrl: "https://untrusted.invalid/ignored",
  };
}
const MIME: Record<string, string> = {
  image: "image/png",
  video: "video/mp4",
  document: "application/pdf",
  audio: "audio/ogg",
  sticker: "image/webp",
};

for (
  const [type, expected] of [["audio", "\u{1f3a4} \u00c1udio"], [
    "sticker",
    "Figurinha",
  ]]
) {
  Deno.test(`handler ${type} failed signature does not fabricate a delivered caption in history`, async () => {
    const f = new Fixture();
    f.mimeType = MIME[type];
    f.failure = "http";
    const response = await f.request({
      ...media(type, ""),
      signMessages: true,
    });
    equal(response.status, 200);
    equal(response.body.success, true);
    equal(response.body.signatureWarning, true);
    equal(
      (response.body.message as Row).content,
      expected,
      "primary media content",
    );
    const preview = f.writes.find((row) => row.table === "whatsapp_chats");
    equal(
      preview?.last_message,
      expected,
      "chat preview without undelivered signature",
    );
    equal(f.sends.length, 2);
  });
}

Deno.test("handler ON uses JWT user's profile, ignoring all spoofed name fields", async () => {
  const f = new Fixture();
  const response = await f.request({
    signMessages: true,
    userId: "forged-user",
    senderId: "forged-user",
    signatureName: "Forged User",
    full_name: "Forged User",
  });
  equal(response.status, 200);
  equal(f.sends, [{
    path: "/message/sendText/qa-instance",
    body: { number: NUMBER, text: "*QA Operator*\nHello" },
  }]);
  equal(f.profileReads.length, 1);
  equal(f.profileReads[0].filters, { user_id: USER });
  equal((response.body.message as Row).sender_id, USER);
  equal((response.body.message as Row).content, "*QA Operator*\nHello");
});

for (const signMessages of [false, undefined, "true"]) {
  Deno.test(`handler OFF/non-boolean ${String(signMessages)} preserves original text and skips profile`, async () => {
    const f = new Fixture();
    f.name = null;
    const text = "  Hello\n\n  ";
    const response = await f.request({ signMessages, content: text });
    equal(response.status, 200);
    equal(f.sends[0].body.text, text);
    equal(f.profileReads.length, 0);
    equal((response.body.message as Row).content, text);
  });
}

Deno.test("handler ON preserves already signed prefix exactly once", async () => {
  const f = new Fixture();
  await f.request({ signMessages: true, content: "*QA Operator*\nHello" });
  equal(f.sends[0].body.text, "*QA Operator*\nHello");
});

for (const mode of ["missing", "blank", "markdown-only", "error"]) {
  Deno.test(`handler ON rejects ${mode} profile before provider or database writes`, async () => {
    const f = new Fixture();
    f.name = mode === "blank"
      ? " \n "
      : mode === "markdown-only"
      ? "*_~`"
      : null;
    f.profileError = mode === "error";
    const response = await f.request({ signMessages: true });
    equal(response.status, 400);
    equal(response.body.code, "whatsapp_signature_name_missing");
    equal(f.calls.length, 0);
    equal(f.writes.length, 0);
  });
}

for (
  const [label, overrides, status] of [
    ["cross-tenant", { companyId: "other-tenant" }, 403],
    ["cross-tenant chat", { chatId: "other-chat" }, 403],
    ["unconfirmed recipient", { remoteJid: "12025550124@s.whatsapp.net" }, 409],
  ] as const
) {
  Deno.test(`handler ON denies ${label} without outbound delivery`, async () => {
    const f = new Fixture();
    const response = await f.request({ signMessages: true, ...overrides });
    equal(response.status, status);
    equal(f.sends.length, 0);
    equal(f.writes.length, 0);
    if (status === 403) equal(f.profileReads.length, 0);
  });
}

for (const mode of ["no-header", "invalid-jwt", "no-role"]) {
  Deno.test(`handler ON denies ${mode} before profile/provider access`, async () => {
    const f = new Fixture();
    f.authenticated = mode !== "invalid-jwt";
    f.permitted = mode !== "no-role";
    const response = await f.request(
      { signMessages: true },
      mode !== "no-header",
    );
    equal(response.status, mode === "no-role" ? 403 : 401);
    equal(f.calls.length, 0);
    equal(f.writes.length, 0);
    equal(f.profileReads.length, 0);
  });
}

Deno.test("handler signing cannot bypass disconnected stored instance", async () => {
  const f = new Fixture();
  f.connected = false;
  const response = await f.request({ signMessages: true });
  equal(response.status, 409);
  equal(f.calls.length, 0);
  equal(f.writes.length, 0);
});

Deno.test("edit-message remains outside signature lookup even when signing is requested", async () => {
  const f = new Fixture();
  f.name = null;
  const response = await f.request({
    action: "edit-message",
    signMessages: true,
  });
  equal(response.status, 400);
  equal(response.body.code, "whatsapp_edit_invalid_request");
  equal(f.profileReads.length, 0);
  equal(f.sends.length, 0);
});

for (const type of ["image", "video", "document"]) {
  for (const on of [true, false]) {
    Deno.test(`handler ${type} caption ${on ? "ON" : "OFF"} matches Evolution and persisted row`, async () => {
      const f = new Fixture();
      f.mimeType = MIME[type];
      const response = await f.request({
        ...media(type, "  Caption\n  "),
        signMessages: on,
      });
      equal(response.status, 200);
      equal(response.body.success, true);
      const caption = on ? "*QA Operator*\nCaption" : "  Caption\n  ";
      equal(f.sends, [{
        path: "/message/sendMedia/qa-instance",
        body: {
          number: NUMBER,
          media: SIGNED_URL,
          mediatype: type,
          caption,
          ...(type === "document" ? { fileName: "qa.pdf" } : {}),
        },
      }]);
      equal((response.body.message as Row).content, caption);
      equal(f.profileReads.length, on ? 1 : 0);
    });
  }
}

Deno.test("handler signed media without caption includes authenticated name", async () => {
  const f = new Fixture();
  const response = await f.request({
    ...media("image", undefined),
    caption: undefined,
    signMessages: true,
  });
  equal(response.status, 200);
  equal(f.sends[0].body.caption, "*QA Operator*");
});

for (const type of ["audio", "sticker"]) {
  for (const on of [true, false]) {
    Deno.test(`handler ${type} ${on ? "ON" : "OFF"} sends media once and only ON sends signature`, async () => {
      const f = new Fixture();
      f.mimeType = MIME[type];
      const response = await f.request({ ...media(type), signMessages: on });
      equal(response.status, 200);
      equal(response.body.success, true);
      equal(response.body.messageId, "primary-id");
      const primary: Call = type === "audio"
        ? {
          path: "/message/sendWhatsAppAudio/qa-instance",
          body: { number: NUMBER, audio: SIGNED_URL, encoding: true },
        }
        : {
          path: "/message/sendSticker/qa-instance",
          body: { number: NUMBER, sticker: SIGNED_URL },
        };
      equal(f.sends, [
        primary,
        ...(on
          ? [{
            path: "/message/sendText/qa-instance",
            body: { number: NUMBER, text: "*QA Operator*\nCaption" },
          }]
          : []),
      ]);
      if (on) {
        equal(
          (response.body.signatureMessage as Row).message_id_external,
          "signature-id",
        );
        equal((response.body.signatureMessage as Row).sender_id, USER);
        equal((response.body.signatureMessage as Row).company_id, COMPANY);
      }
    });
  }
  for (
    const failure of [
      "http",
      "network",
      "json",
      "db-error",
      "db-throw",
    ] as const
  ) {
    Deno.test(`handler ${type} signature ${failure} failure preserves successful delivery without duplicate media`, async () => {
      const f = new Fixture();
      f.mimeType = MIME[type];
      f.failure = failure;
      const response = await f.request({ ...media(type), signMessages: true });
      equal(response.status, 200);
      equal(response.body.success, true);
      equal(response.body.messageId, "primary-id");
      equal(f.sends.length, 2);
      equal(
        f.sends.filter((call) => !call.path.includes("sendText")).length,
        1,
      );
      equal(f.sends[1].body.text, "*QA Operator*\nCaption");
      equal((response.body.message as Row).message_id_external, "primary-id");
      equal(response.body.signatureMessage, null);
      if (failure === "db-error") equal(response.body.persistenceWarning, true);
      else equal(response.body.signatureWarning, true);
    });
  }
}

Deno.test("audio fallback followed by failed signature never retries delivered fallback media", async () => {
  const f = new Fixture();
  f.mimeType = MIME.audio;
  f.audioFallback = true;
  f.failure = "http";
  const response = await f.request({ ...media("audio"), signMessages: true });
  equal(response.status, 200);
  equal(response.body.success, true);
  equal(response.body.signatureWarning, true);
  equal(f.sends.map((call) => call.path), [
    "/message/sendWhatsAppAudio/qa-instance",
    "/message/sendMedia/qa-instance",
    "/message/sendText/qa-instance",
  ]);
  equal(f.sends[1].body, {
    number: NUMBER,
    media: SIGNED_URL,
    mediatype: "audio",
    caption: "",
  });
});

Deno.test("primary sticker failure sends no accompanying signature and writes no message", async () => {
  const f = new Fixture();
  f.mimeType = MIME.sticker;
  f.primaryFails = true;
  const response = await f.request({ ...media("sticker"), signMessages: true });
  assert(response.status >= 400, "Failed primary incorrectly reported success");
  equal(f.sends.length, 1);
  equal(f.writes.length, 0);
});

Deno.test("signing cannot bypass media tenant path validation", async () => {
  const f = new Fixture();
  const response = await f.request({
    ...media("image"),
    signMessages: true,
    mediaStoragePath: "other-tenant/chat-qa/object",
  });
  equal(response.status, 400);
  equal(response.body.code, "whatsapp_media_scope_mismatch");
  equal(f.sends.length, 0);
  equal(f.writes.length, 0);
});
