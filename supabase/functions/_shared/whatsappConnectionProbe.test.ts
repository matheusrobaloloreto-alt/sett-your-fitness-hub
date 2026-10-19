// Run with --allow-read; no network or environment permissions are needed.
// Add --allow-run=git and -- --source-ref=cec7459 to reproduce the old failures.
type Row = Record<string, unknown>;
type Handler = (request: Request) => Promise<Response>;
type Reply = () => Response | Promise<Response>;
const STATE = "/instance/connectionState/qa-instance";
const LIST = "/instance/fetchInstances";
const CONNECT = "/instance/connect/qa-instance";
const CREATE = "/instance/create";
const COMPANY = "tenant-qa";
const CREATED_QR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4j8AAAAASUVORK5CYII=";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const sourceUrl = new URL("../whatsapp-manager/index.ts", import.meta.url);
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
    }).output();
    if (!result.success) throw new Error("Cannot load baseline handler");
    return new TextDecoder().decode(result.stdout);
  })()
  : await Deno.readTextFile(sourceUrl);

let activeClient: Fixture["client"] | undefined;
const globals = globalThis as typeof globalThis & {
  __connectionQaClient?: () => unknown;
};
globals.__connectionQaClient = () => activeClient!;
const sdkImport =
  'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";';
if (!source.includes(sdkImport)) throw new Error("Handler SDK import changed");
const sdkUrl = `data:application/javascript,${
  encodeURIComponent(
    "export function createClient() { return globalThis.__connectionQaClient(); }",
  )
}`;
source = source.replace(
  sdkImport,
  `import { createClient } from ${JSON.stringify(sdkUrl)};`,
)
  .replace(
    /from "(\.\.\/[^"]+)"/g,
    (_, path: string) =>
      `from ${JSON.stringify(new URL(path, sourceUrl).href)}`,
  );
let handler: Handler;
const serveDescriptor = Object.getOwnPropertyDescriptor(Deno, "serve")!;
try {
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    value: (fn: Handler) => {
      handler = fn;
    },
  });
  await import(`data:application/typescript,${encodeURIComponent(source)}`);
} finally {
  Object.defineProperty(Deno, "serve", serveDescriptor);
}

class Query {
  patch?: Row;
  constructor(private fixture: Fixture, private table: string) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  limit() {
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  insert(patch: Row) {
    this.patch = patch;
    return this;
  }
  single() {
    return this.maybeSingle();
  }
  maybeSingle() {
    if (this.patch) {
      this.fixture.writes.push(this.patch);
      return Promise.resolve({ data: { id: "instance-qa" }, error: null });
    }
    if (this.table !== "whatsapp_instances") {
      throw new Error("Unexpected database read");
    }
    return Promise.resolve({
      data: {
        id: "instance-qa",
        instance_name: "qa-instance",
        status: "connected",
        phone_number: "synthetic-phone",
      },
      error: null,
    });
  }
}

class Fixture {
  writes: Row[] = [];
  calls: string[] = [];
  replies: Record<string, Reply> = {};
  client = {
    auth: {
      getClaims: () =>
        Promise.resolve({ data: { claims: { sub: "user-qa" } }, error: null }),
    },
    rpc: (name: string, args: Row) =>
      Promise.resolve({
        data: name === "get_user_company_id" ? COMPANY : args._role === "admin",
        error: null,
      }),
    from: (table: string) => new Query(this, table),
  };
  fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    equal(url.origin, "https://evolution.invalid");
    this.calls.push(`${init?.method || "GET"} ${url.pathname}${url.search}`);
    const reply = this.replies[url.pathname];
    if (!reply) throw new Error("Unexpected provider call");
    return await reply();
  };
  async request(action: string) {
    const originalFetch = globalThis.fetch;
    const envDescriptor = Object.getOwnPropertyDescriptor(Deno.env, "get")!;
    activeClient = this.client;
    try {
      Object.defineProperty(Deno.env, "get", {
        configurable: true,
        value: (key: string) =>
          ({
            SUPABASE_URL: "https://database.invalid",
            SUPABASE_ANON_KEY: "synthetic",
            SUPABASE_SERVICE_ROLE_KEY: "synthetic",
            EVOLUTION_API_URL: "https://evolution.invalid",
            EVOLUTION_API_KEY: "synthetic",
            WHATSAPP_WEBHOOK_SECRET: "synthetic",
          })[key],
      });
      globalThis.fetch = this.fetch;
      const response = await handler!(
        new Request("https://handler.invalid", {
          method: "POST",
          headers: { Authorization: "Bearer synthetic" },
          body: JSON.stringify({
            action,
            companyId: COMPANY,
            content: "synthetic",
            remoteJid: "12025550123@s.whatsapp.net",
          }),
        }),
      );
      return { status: response.status, body: await response.json() as Row };
    } finally {
      activeClient = undefined;
      globalThis.fetch = originalFetch;
      Object.defineProperty(Deno.env, "get", envDescriptor);
    }
  }
}

const unavailable: Record<string, Reply> = {
  ...Object.fromEntries(
    [401, 403, 404, 408, 429, 500, 503].map((
      status,
    ) => [
      String(status),
      () =>
        new Response("instance not found synthetic-private-body", { status }),
    ]),
  ),
  network: () => {
    throw new TypeError("synthetic-private-network");
  },
  timeout: () => {
    throw new DOMException("synthetic-private-timeout", "TimeoutError");
  },
  malformed: () => new Response("not json synthetic-private-body"),
  unknown: () =>
    Response.json({
      instance: { state: "unrecognized", owner: "synthetic-private-body" },
    }),
};

for (
  const action of [
    "check-status",
    "init-connection",
    "refresh-qr",
    "send-message",
  ]
) {
  for (
    const [label, reply] of Object.entries(unavailable).filter(([label]) =>
      label !== "404"
    )
  ) {
    Deno.test(`handler ${action}: ${label} preserves saved connection and makes no recovery/send calls`, async () => {
      const f = new Fixture();
      f.replies[STATE] = reply;
      f.replies[CONNECT] = reply;
      const result = await f.request(action);
      equal(result.status === 502 || result.status === 503, true);
      if (action !== "send-message") equal(result.body.status, "unknown");
      equal(f.writes, []);
      equal(f.calls, [`GET ${STATE}`]);
      equal(JSON.stringify(result.body).includes("synthetic-private"), false);
    });
  }
}

for (
  const action of [
    "check-status",
    "init-connection",
    "refresh-qr",
    "send-message",
  ]
) {
  Deno.test(`handler ${action}: blanket 404 is provider error, never missing`, async () => {
    const f = new Fixture();
    f.replies[STATE] = f.replies[LIST] = () =>
      new Response("Not Found", { status: 404 });
    const result = await f.request(action);
    equal(result.status, 502);
    equal(result.body.code, "whatsapp_provider_failure");
    equal(f.writes, []);
    equal(f.calls, [`GET ${STATE}`, `GET ${LIST}`]);
  });
}

for (const action of ["init-connection", "refresh-qr"]) {
  for (
    const payload of [{}, null, [], { instance: { state: null } }, {
      base64: 0,
    }, { unexpected: true }]
  ) {
    Deno.test(`handler ${action}: malformed connect object ${JSON.stringify(payload)} is unknown without recovery`, async () => {
      const f = new Fixture();
      f.replies[STATE] = () =>
        Response.json({ instance: { state: "connecting" } });
      f.replies[CONNECT] = () => Response.json(payload);
      const result = await f.request(action);
      equal(result.status, 502);
      equal(result.body.status, "unknown");
      equal(f.writes, []);
      equal(f.calls, [`GET ${STATE}`, `GET ${CONNECT}`]);
    });
  }
  for (const [label, reply] of Object.entries(unavailable)) {
    Deno.test(`handler ${action}: existing connect ${label} does not delete, create or persist`, async () => {
      const f = new Fixture();
      f.replies[STATE] = () => Response.json({ instance: { state: "close" } });
      f.replies[CONNECT] = reply;
      const result = await f.request(action);
      equal(result.status === 502 || result.status === 503, true);
      equal(result.body.status, "unknown");
      equal(f.writes, []);
      equal(f.calls, [`GET ${STATE}`, `GET ${CONNECT}`]);
    });
  }
  Deno.test(`handler ${action}: valid response without QR waits without destroying saved QR`, async () => {
    const f = new Fixture();
    f.replies[STATE] = () =>
      Response.json({ instance: { state: "connecting" } });
    f.replies[CONNECT] = () => Response.json({ count: 0 });
    const result = await f.request(action);
    equal(result.status, 200);
    equal(result.body.status, "waiting_qr");
    equal(f.calls, [`GET ${STATE}`, `GET ${CONNECT}`]);
    equal(f.writes, []);
  });
}

for (const [label, reply] of Object.entries(unavailable)) {
  Deno.test(`handler verified missing init: create ${label} returns redacted provider error without persistence`, async () => {
    const f = new Fixture();
    f.replies[STATE] = () => new Response("Not Found", { status: 404 });
    f.replies[LIST] = () => Response.json([]);
    f.replies[CREATE] = reply;
    const result = await f.request("init-connection");
    equal(result.status === 502 || result.status === 503, true);
    equal(result.body.status, "unknown");
    equal(JSON.stringify(result.body).includes("synthetic-private"), false);
    equal(f.writes, []);
    equal(f.calls, [`GET ${STATE}`, `GET ${LIST}`, `POST ${CREATE}`]);
  });
}

for (
  const payload of [
    {},
    { unexpected: true },
    null,
    [],
    { instance: { status: "close" } },
    { instance: { instanceId: "synthetic-provider-id", status: "close" } },
    { instance: { instanceName: "qa-instance" } },
    { instance: { instanceName: "other-instance", status: "close" } },
    { instance: { instanceName: "qa-instance", status: "unrecognized" } },
    {
      instance: {
        instanceName: "qa-instance",
        instanceId: 42,
        status: "close",
      },
    },
    { qrcode: { base64: "" } },
    { qrcode: { base64: "  " } },
    { qrcode: { base64: "not-an-image" } },
    { qrcode: { base64: 42 } },
    {
      instance: { instanceName: "other-instance", status: "connecting" },
      qrcode: { base64: CREATED_QR },
    },
  ]
) {
  Deno.test(`handler rejects unproven creation ${JSON.stringify(payload)} without persistence or recovery`, async () => {
    const f = new Fixture();
    f.replies[STATE] = () => new Response("Not Found", { status: 404 });
    f.replies[LIST] = () => Response.json([]);
    f.replies[CREATE] = () => Response.json(payload);
    const result = await f.request("init-connection");
    equal(result.status, 502);
    equal(result.body.status, "unknown");
    equal(result.body.code, "whatsapp_provider_failure");
    equal(f.writes, []);
    equal(f.calls, [`GET ${STATE}`, `GET ${LIST}`, `POST ${CREATE}`]);
    equal(JSON.stringify(result.body).includes("other-instance"), false);
  });
}

for (const status of ["close", "connecting", "open", "created"]) {
  Deno.test(`handler accepts owned v2 creation status ${status} without QR`, async () => {
    const f = new Fixture();
    f.replies[STATE] = () => new Response("Not Found", { status: 404 });
    f.replies[LIST] = () => Response.json([]);
    f.replies[CREATE] = () =>
      Response.json({
        instance: {
          instanceName: "qa-instance",
          instanceId: "synthetic-provider-id",
          status,
        },
        hash: "synthetic-private-key",
      });
    const result = await f.request("init-connection");
    equal(result.status, 200);
    equal(result.body.status, status === "open" ? "connected" : "waiting_qr");
    equal(f.writes.length, 1);
    equal(f.writes[0].status, result.body.status);
    equal(f.writes[0].qr_code, null);
    equal(f.calls, [`GET ${STATE}`, `GET ${LIST}`, `POST ${CREATE}`]);
    equal(JSON.stringify(result.body).includes("synthetic-private"), false);
  });
}

for (const action of ["init-connection", "refresh-qr"]) {
  Deno.test(`handler ${action} already connected skips connect/create/delete`, async () => {
    const f = new Fixture();
    f.replies[STATE] = () => Response.json({ instance: { state: "open" } });
    const result = await f.request(action);
    equal(result.status, 200);
    equal(result.body.status, "connected");
    equal(f.calls, [`GET ${STATE}`]);
    equal(f.writes.length, 1);
    equal(f.writes[0].status, "connected");
  });
  for (const nested of [true, false]) {
    Deno.test(`handler ${action} saves ${nested ? "nested" : "top-level"} QR without other provider calls`, async () => {
      const f = new Fixture();
      f.replies[STATE] = () =>
        Response.json({ instance: { state: "connecting" } });
      f.replies[CONNECT] = () =>
        Response.json(
          nested
            ? { qrcode: { base64: "synthetic-qr" } }
            : { base64: "synthetic-qr" },
        );
      const result = await f.request(action);
      equal(result.status, 200);
      equal(result.body, { status: "waiting_qr", qrcode: "synthetic-qr" });
      equal(f.writes.length, 1);
      equal(f.writes[0].qr_code, "synthetic-qr");
      equal(f.calls, [`GET ${STATE}`, `GET ${CONNECT}`]);
    });
  }
}

Deno.test("handler connected check-status preserves saved phone when details lookup fails", async () => {
  const f = new Fixture();
  f.replies[STATE] = () => Response.json({ instance: { state: "open" } });
  f.replies[LIST] = () => new Response(null, { status: 503 });
  f.replies["/webhook/set/qa-instance"] = () =>
    Response.json({ success: true });
  const result = await f.request("check-status");
  equal(result.status, 200);
  equal(result.body.status, "connected");
  equal(f.writes.length, 1);
  equal(Object.hasOwn(f.writes[0], "phone_number"), false);
  equal(f.calls, [
    `GET ${STATE}`,
    `GET ${LIST}?instanceName=qa-instance`,
    "POST /webhook/set/qa-instance",
  ]);
});

// Pure probes use synthetic fetch only; assert all methods, routes and deadlines.
async function pureProbe(replies: Reply[], instanceName = "qa-instance") {
  const { probeWhatsAppConnection } = await import(
    "./whatsappConnectionProbe.ts"
  );
  const calls: string[] = [];
  const timeoutDescriptor = Object.getOwnPropertyDescriptor(
    AbortSignal,
    "timeout",
  )!;
  const deadlines: number[] = [];
  const timeout = AbortSignal.timeout;
  try {
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: (ms: number) => {
        deadlines.push(ms);
        return timeout(ms);
      },
    });
    const result = await probeWhatsAppConnection({
      baseUrl: "https://evolution.invalid/",
      instanceName,
      headers: { apikey: "synthetic-private-key" },
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        equal(url.origin, "https://evolution.invalid");
        equal(init?.method, "GET");
        equal(init?.signal instanceof AbortSignal, true);
        calls.push(url.pathname + url.search);
        const reply = replies.shift();
        if (!reply) throw new Error("Unexpected extra request");
        return await reply();
      },
    });
    equal(deadlines, calls.map(() => 8_000));
    equal(JSON.stringify(result).includes("synthetic-private"), false);
    return { result, calls };
  } finally {
    Object.defineProperty(AbortSignal, "timeout", timeoutDescriptor);
  }
}

for (
  const [state, status] of Object.entries({
    open: "connected",
    connected: "connected",
    connecting: "waiting_qr",
    waiting_qr: "waiting_qr",
    close: "disconnected",
    closed: "disconnected",
    disconnected: "disconnected",
  })
) {
  Deno.test(`pure probe recognizes ${state}, encodes exact instance path`, async () => {
    const { result, calls } = await pureProbe([
      () => Response.json({ instance: { state } }),
    ], "qa/name");
    equal(result, { kind: "existing", status });
    equal(calls, ["/instance/connectionState/qa%2Fname"]);
  });
}

for (
  const payload of [
    null,
    [],
    {},
    { instance: {} },
    { state: "mystery" },
    { state: 1 },
    { instance: { state: "" } },
    { state: "open", error: "synthetic-private" },
  ]
) {
  Deno.test(`pure probe rejects unknown state ${JSON.stringify(payload)}`, async () => {
    const { result, calls } = await pureProbe([() => Response.json(payload)]);
    equal(result.kind, "provider_error");
    equal(calls, [STATE]);
  });
}

for (const [label, reply] of Object.entries(unavailable)) {
  Deno.test(`pure probe list ${label} cannot confirm absence`, async () => {
    const { result, calls } = await pureProbe([
      () => new Response(null, { status: 404 }),
      reply,
    ]);
    equal(result.kind, "provider_error");
    equal(calls, [STATE, LIST]);
  });
}

for (
  const payload of [{}, null, { instances: [] }, [null], [{}], [{ name: 4 }], [{
    name: "",
  }], [{ name: "other" }, {}]]
) {
  Deno.test(`pure probe rejects invalid list ${JSON.stringify(payload)}`, async () => {
    const { result, calls } = await pureProbe([
      () => new Response(null, { status: 404 }),
      () => Response.json(payload),
    ]);
    equal(result.kind, "provider_error");
    equal(calls, [STATE, LIST]);
  });
}

for (const nested of [true, false]) {
  for (const present of [true, false]) {
    Deno.test(`pure probe validates ${nested ? "wrapped" : "v2"} records, target present=${present}`, async () => {
      const name = present ? "qa-instance" : "other-instance";
      const { result, calls } = await pureProbe([
        () => new Response(null, { status: 404 }),
        () =>
          Response.json([
            nested
              ? {
                instance: {
                  instanceName: name,
                  owner: "synthetic-private-phone",
                },
              }
              : {
                name,
                ownerJid: "synthetic-private-phone",
                token: "synthetic-private-key",
              },
          ]),
      ]);
      equal(result.kind, present ? "provider_error" : "missing");
      equal(calls, [STATE, LIST]);
    });
  }
}

Deno.test("pure probe empty healthy list confirms absence", async () => {
  const { result, calls } = await pureProbe([
    () => new Response(null, { status: 404 }),
    () => Response.json([]),
  ]);
  equal(result, { kind: "missing" });
  equal(calls, [STATE, LIST]);
});

Deno.test("handler verified missing check-status clears stale phone/QR", async () => {
  const f = new Fixture();
  f.replies[STATE] = () => new Response("Not Found", { status: 404 });
  f.replies[LIST] = () => Response.json([{ name: "other-instance" }]);
  const result = await f.request("check-status");
  equal(result.status, 200);
  equal(result.body, {
    status: "disconnected",
    code: "whatsapp_instance_missing",
  });
  equal(f.writes.length, 1);
  equal(f.writes[0].phone_number, null);
  equal(f.writes[0].qr_code, null);
  equal(f.calls, [`GET ${STATE}`, `GET ${LIST}`]);
});

Deno.test("handler verified missing init alone can create", async () => {
  const f = new Fixture();
  f.replies[STATE] = () => new Response("Not Found", { status: 404 });
  f.replies[LIST] = () => Response.json([]);
  f.replies[CREATE] = () => Response.json({ qrcode: { base64: CREATED_QR } });
  const result = await f.request("init-connection");
  equal(result.status, 200);
  equal(result.body.status, "waiting_qr");
  equal(result.body.qrcode, CREATED_QR);
  equal(f.calls, [`GET ${STATE}`, `GET ${LIST}`, `POST ${CREATE}`]);
});

Deno.test("handler verified missing refresh never creates during automatic polling", async () => {
  const f = new Fixture();
  f.replies[STATE] = () => new Response("Not Found", { status: 404 });
  f.replies[LIST] = () => Response.json([]);
  const result = await f.request("refresh-qr");
  equal(result.status, 409);
  equal(result.body.code, "whatsapp_instance_missing");
  equal(f.writes, []);
  equal(f.calls, [`GET ${STATE}`, `GET ${LIST}`]);
});

for (const state of ["close", "closed", "disconnected"]) {
  Deno.test(`handler real ${state} check-status persists disconnection and clears phone/QR`, async () => {
    const f = new Fixture();
    f.replies[STATE] = () => Response.json({ instance: { state } });
    const result = await f.request("check-status");
    equal(result.status, 200);
    equal(result.body.status, "disconnected");
    equal(f.writes.length, 1);
    equal(f.writes[0].status, "disconnected");
    equal(f.writes[0].phone_number, null);
    equal(f.writes[0].qr_code, null);
    equal(f.calls, [`GET ${STATE}`]);
  });
}
