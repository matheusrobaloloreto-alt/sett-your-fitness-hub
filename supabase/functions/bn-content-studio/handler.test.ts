import assert from "node:assert/strict";
import {
  BN_CONTENT_DEFAULT_SPEC,
  BN_CONTENT_LIMITS,
  validateBnContentSpec,
} from "../_shared/bnContent.ts";
import type { BnContentSpec, BnStudioPost } from "../_shared/bnContent.ts";
import {
  createBnContentHandler,
  StudioError,
  studioOriginAllowed,
} from "./handler.ts";
import type { StudioDependencies, StudioStore } from "./handler.ts";
import { BN_STUDIO_SETTINGS } from "./prompts.ts";
import { createRuntimeHandler } from "./index.ts";
import brain from "../_shared/bnContentBrain.json" with { type: "json" };

const actor = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000002";
const imageId = "00000000-0000-4000-8000-000000000003";
const timestamp = "2026-10-12T00:00:00Z";
const validSpec = (): BnContentSpec => ({
  ...structuredClone(BN_CONTENT_DEFAULT_SPEC),
  caption: "Treino individualizado comeca na avaliacao.",
  hashtags: ["#BN"],
});
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
const generateInput = {
  action: "generate",
  brief: "Criterios para ajustar carga",
  format: "carrossel",
  aesthetic: "l1_educativo",
  audience: "misto",
};
const saveInput = () => ({
  action: "save",
  brief: "Criterios para ajustar carga",
  spec: validSpec(),
  status: "draft",
});

Deno.test("brand snapshot contains only approved doctrine sections without review/history/PII", () => {
  assert.deepEqual(
    Object.keys(brain).sort(),
    [
      "brand_voice",
      "visual_system",
      "layout_rules",
      "content_pillars",
      "guardrails",
      "vocabulary_preferences",
      "aesthetics",
      "objectives",
      "formats_library",
    ].sort(),
  );
  function inspect(value: unknown) {
    if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        assert.equal(
          /edit_history|_review|learned_from|email|telefone|phone|cpf|cnpj|address|user_id|student_id/i
            .test(key),
          false,
        );
        inspect(child);
      }
    } else if (typeof value === "string") {
      assert.equal(
        /\b(Mat(h)?eus( Loreto)?|Bruna)\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(
          value,
        ),
        false,
      );
    }
  }
  inspect(brain);
});

function fixture(
  overrides: Partial<StudioDependencies> = {},
  storeOverrides: Partial<StudioStore> = {},
) {
  const state = {
    auth: 0,
    stores: 0,
    text: 0,
    image: 0,
    quota: 0,
    saves: 0,
    uploads: 0,
    calendars: 0,
    prompt: "",
    uploadedPath: "",
    post: null as BnStudioPost | null,
  };
  const store: StudioStore = {
    posts: async () => state.post ? [structuredClone(state.post)] : [],
    calendars: async () => [],
    approvedExamples: async () => [],
    post: async () => state.post,
    async save(_actor, input) {
      state.saves++;
      if (input.id && input.expected_version !== state.post?.version) {
        throw new StudioError(409, "version_conflict");
      }
      state.post = {
        id: input.id ?? postId,
        brief: input.brief,
        spec: input.spec,
        status: input.status,
        version: input.id ? input.expected_version! + 1 : 1,
        created_at: timestamp,
        updated_at: timestamp,
      };
      return structuredClone(state.post);
    },
    async calendar(_actor, calendar) {
      state.calendars++;
      return { id: imageId, calendar, created_at: timestamp };
    },
    async quota() {
      state.quota++;
      return true;
    },
    signedAssets: async (paths) =>
      Object.fromEntries(
        paths.map((p) => [p, `https://storage.test/signed/${p}`]),
      ),
    async upload(path) {
      state.uploads++;
      state.uploadedPath = path;
    },
    ...storeOverrides,
  };
  const deps: StudioDependencies = {
    async authenticate() {
      state.auth++;
      return { id: actor, master: true };
    },
    store() {
      state.stores++;
      return store;
    },
    capabilities: () => ({ text: true, images: true }),
    async text(prompt) {
      state.text++;
      state.prompt = prompt;
      return validSpec();
    },
    async image(prompt) {
      state.image++;
      state.prompt = prompt;
      return { bytes: png, mime: "image/png" };
    },
    uuid: () => imageId,
    ...overrides,
  };
  const handler = createBnContentHandler(deps);
  return {
    state,
    store,
    handler,
    async call(input: unknown, headers: Record<string, string> = {}) {
      return await handler(
        new Request("https://edge.test/bn-content-studio", {
          method: "POST",
          headers: {
            authorization: "Bearer synthetic-token",
            "content-type": "application/json",
            ...headers,
          },
          body: JSON.stringify(input),
        }),
      );
    },
  };
}

Deno.test("pure contract rejects unknown fields, wrong types, paths, oversized and empty slides", () => {
  assert.ok(validateBnContentSpec(validSpec()));
  for (
    const broken of [
      null,
      [],
      {},
      { ...validSpec(), slides: [] },
      { ...validSpec(), slides: Array(21).fill(validSpec().slides[0]) },
      { ...validSpec(), author: actor },
      { ...validSpec(), caption: "x".repeat(6001) },
      { ...validSpec(), hashtags: ["#bad tag"] },
      {
        ...validSpec(),
        slides: [{
          role: "capa",
          title: "x",
          background_path: "https://foreign.test/private.png",
        }],
      },
      { ...validSpec(), slides: [{ role: "capa", title: "x", bullets: [42] }] },
    ]
  ) assert.equal(validateBnContentSpec(broken), false);
});

for (
  const [name, auth] of [
    ["invalid JWT", async () => null],
    ["non-master JWT", async () => ({ id: actor, master: false })],
  ] as const
) {
  Deno.test(`${name} is rejected before body read, service client or cost`, async () => {
    const f = fixture({ authenticate: auth });
    const req = new Request("https://edge.test", {
      method: "POST",
      headers: {
        authorization: "Bearer synthetic",
        "content-type": "application/json",
      },
      body: "malformed{",
    });
    const response = await f.handler(req);
    assert.equal(response.status, name === "invalid JWT" ? 401 : 403);
    assert.equal(req.bodyUsed, false);
    assert.equal(
      f.state.stores + f.state.text + f.state.image + f.state.quota,
      0,
    );
  });
}

Deno.test("missing auth rejects before authentication and data", async () => {
  const f = fixture();
  const response = await f.handler(
    new Request("https://edge.test", { method: "POST", body: "{}" }),
  );
  assert.equal(response.status, 401);
  assert.equal(f.state.auth + f.state.stores, 0);
});

Deno.test("runtime getUser then has_role, with service key unread until master success", async () => {
  for (const master of [false, true]) {
    const calls: { url: string; auth: string | null; body: unknown }[] = [];
    const envReads: string[] = [];
    const handler = createRuntimeHandler((name) => {
      envReads.push(name);
      return ({
        SUPABASE_URL: "https://project.test",
        SUPABASE_ANON_KEY: "synthetic-anon",
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
      } as Record<string, string>)[name];
    }, async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        auth: new Headers(init?.headers).get("authorization"),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.includes("/auth/v1/user")) {
        return Response.json({
          id: actor,
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: timestamp,
        });
      }
      if (url.includes("/rpc/has_role")) return Response.json(master);
      return Response.json([]);
    });
    const response = await handler(
      new Request("https://edge.test", {
        method: "POST",
        headers: {
          authorization: "Bearer real-identity-token",
          "content-type": "application/json",
        },
        body: '{"action":"bootstrap"}',
      }),
    );
    assert.equal(response.status, master ? 200 : 403);
    assert.ok(calls[0].url.endsWith("/auth/v1/user"));
    assert.ok(calls[1].url.endsWith("/rpc/has_role"));
    assert.deepEqual(calls[1].body, { _user_id: actor, _role: "master" });
    assert.equal(calls[0].auth, "Bearer real-identity-token");
    assert.equal(calls[1].auth, "Bearer real-identity-token");
    assert.equal(envReads.includes("SUPABASE_SERVICE_ROLE_KEY"), master);
    if (master) {
      assert.ok(
        calls.slice(2).every((call) =>
          call.auth === "Bearer synthetic-service"
        ),
      );
    }
  }
});

Deno.test("getUser or role failure fails closed without data or costs", async () => {
  for (const failedAt of ["auth", "role"]) {
    let serviceRead = false;
    const handler = createRuntimeHandler((name) => {
      if (name === "SUPABASE_SERVICE_ROLE_KEY") serviceRead = true;
      return ({
        SUPABASE_URL: "https://project.test",
        SUPABASE_ANON_KEY: "synthetic-anon",
      } as Record<string, string>)[name];
    }, async (input) => {
      if (failedAt === "auth" || String(input).includes("/rpc/")) {
        return Response.json({ message: "PRIVATE failure" }, { status: 500 });
      }
      return Response.json({
        id: actor,
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: timestamp,
      });
    });
    const response = await handler(
      new Request("https://edge.test", {
        method: "POST",
        headers: {
          authorization: "Bearer synthetic",
          "content-type": "application/json",
        },
        body: '{"action":"bootstrap"}',
      }),
    );
    assert.notEqual(response.status, 200);
    assert.equal(serviceRead, false);
    assert.equal((await response.text()).includes("PRIVATE"), false);
  }
});

Deno.test("CORS accepts only exact production, site previews, localhost and authenticated no-origin", async () => {
  for (
    const origin of [
      "https://www.settapp.com.br",
      "https://settapp.com.br",
      "http://localhost:8080",
      "https://deploy-preview-123--bn-performance-webapp-matheus.netlify.app",
      "https://6ac926a677f56442466e1e2f--bn-performance-webapp-matheus.netlify.app",
    ]
  ) {
    assert.ok(studioOriginAllowed(origin));
    const response = await fixture().call({ action: "bootstrap" }, { origin });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
  for (
    const origin of [
      "https://www.settapp.com.br.evil.test",
      "https://evil.netlify.app",
      "https://evil--bn-performance-webapp-matheus.netlify.app",
      "https://deploy-preview-1--bn-performance-webapp-matheus.netlify.app.evil.test",
      "null",
      "http://localhost:9999",
    ]
  ) {
    const f = fixture();
    assert.equal(
      (await f.call({ action: "bootstrap" }, { origin })).status,
      403,
    );
    assert.equal(f.state.auth + f.state.stores, 0);
  }
  const f = fixture();
  assert.equal(
    (await f.handler(
      new Request("https://edge.test", {
        method: "OPTIONS",
        headers: { origin: "https://www.settapp.com.br" },
      }),
    )).status,
    204,
  );
  assert.equal(f.state.auth, 0);
});

Deno.test("request stream limit applies without and with forged Content-Length", async () => {
  for (
    const length of [undefined, "1", String(BN_CONTENT_LIMITS.requestBytes + 1)]
  ) {
    const f = fixture();
    const headers: Record<string, string> = {
      authorization: "Bearer synthetic",
      "content-type": "application/json",
    };
    if (length) headers["content-length"] = length;
    const response = await f.handler(
      new Request("https://edge.test", {
        method: "POST",
        headers,
        body: "x".repeat(BN_CONTENT_LIMITS.requestBytes + 1),
      }),
    );
    assert.equal(response.status, 413);
    assert.equal(f.state.stores + f.state.quota, 0);
  }
});

Deno.test("invalid JSON/content type/unknown actions are rejected without cost", async () => {
  const f = fixture();
  assert.equal(
    (await f.handler(
      new Request("https://edge.test", {
        method: "POST",
        headers: {
          authorization: "Bearer synthetic",
          "content-type": "application/json",
        },
        body: "{",
      }),
    )).status,
    400,
  );
  assert.equal(
    (await f.call({ action: "generate" }, { "content-type": "text/plain" }))
      .status,
    415,
  );
  assert.equal((await f.call({ action: "deploy" })).status, 400);
  assert.equal(
    f.state.quota + f.state.text + f.state.image + f.state.stores,
    0,
  );
});

for (
  const bad of [
    { ...generateInput, brief: "" },
    { ...generateInput, aesthetic: "unknown" },
    { ...generateInput, format: "story" },
    { ...generateInput, audience: "x".repeat(201) },
    { ...generateInput, objective: "unknown" },
    { ...generateInput, format_key: "unknown" },
    { ...generateInput, pillar: "unknown" },
    { ...generateInput, model: "forged-model" },
    { action: "revise", spec: {}, instruction: "Change" },
    { action: "calendar", weeks: 7, posts_per_week: 7, focus: "" },
    {
      action: "image",
      post_id: postId,
      slide_index: -1,
      scene: "x",
      aspect: "4:5",
    },
  ]
) {
  Deno.test(`invalid shape before cost: ${JSON.stringify(bad).slice(0, 90)}`, async () => {
    const f = fixture();
    assert.equal((await f.call(bad)).status, 400);
    assert.equal(
      f.state.quota + f.state.text + f.state.image + f.state.stores,
      0,
    );
  });
}

Deno.test("manual bootstrap/save/approval works with provider disabled and explicit ACK", async () => {
  const f = fixture({ capabilities: () => ({ text: false, images: false }) });
  const initial = await (await f.call({ action: "bootstrap" })).json();
  assert.deepEqual(initial.capabilities, { text: false, images: false });
  assert.ok(initial.settings.aesthetics.length >= 5);
  assert.equal((await f.call(saveInput())).status, 200);
  assert.equal(f.state.post?.version, 1);
  const approval = {
    ...saveInput(),
    id: postId,
    expected_version: 1,
    status: "approved",
  };
  assert.equal((await f.call(approval)).status, 200);
  assert.equal(f.state.post?.version, 2);
  const reopened = await (await f.call({ action: "bootstrap" })).json();
  assert.equal(reopened.posts[0].id, postId);
  assert.equal(reopened.posts[0].status, "approved");
  assert.equal(f.state.text + f.state.image + f.state.quota, 0);
});

Deno.test("save requires valid approval and server-only authors, timestamps and versions", async () => {
  for (
    const broken of [
      { ...saveInput(), created_by: actor },
      { ...saveInput(), version: 1 },
      { ...saveInput(), updated_at: timestamp },
      { ...saveInput(), id: postId },
      { ...saveInput(), expected_version: 1 },
      {
        ...saveInput(),
        status: "approved",
        spec: { ...validSpec(), caption: "" },
      },
      {
        ...saveInput(),
        spec: {
          ...validSpec(),
          slides: [{
            role: "capa",
            title: "x",
            background_path: `studio/${postId}/assets/${imageId}.png`,
          }],
        },
      },
    ]
  ) {
    const f = fixture();
    assert.equal((await f.call(broken)).status, 400);
    assert.equal(f.state.saves, 0);
  }
});

Deno.test("save CAS stale version gives 409 and preserves stored post", async () => {
  const f = fixture();
  await f.call(saveInput());
  await f.call({
    ...saveInput(),
    id: postId,
    expected_version: 1,
    brief: "Winner",
  });
  const response = await f.call({
    ...saveInput(),
    id: postId,
    expected_version: 1,
    brief: "Loser",
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "version_conflict" });
  assert.equal(f.state.post?.brief, "Winner");
  assert.equal(f.state.post?.version, 2);
});

Deno.test("save verifies positive ACK independent of JSONB key ordering", async () => {
  const f = fixture({}, {
    save: async (_actor, input) => ({
      id: postId,
      brief: input.brief,
      spec: Object.fromEntries(
        Object.entries(input.spec).reverse(),
      ) as unknown as BnContentSpec,
      status: input.status,
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    }),
  });
  assert.equal((await f.call(saveInput())).status, 200);
  const failed = fixture({}, {
    save: async () => null as unknown as BnStudioPost,
  });
  assert.equal((await failed.call(saveInput())).status, 500);
  const wrong = fixture({}, {
    save: async (_actor, input) => ({
      id: postId,
      brief: "not saved",
      spec: input.spec,
      status: input.status,
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    }),
  });
  assert.equal((await wrong.call(saveInput())).status, 500);
});

Deno.test("generate uses approved examples and returns spec without persisting", async () => {
  const f = fixture({}, {
    approvedExamples:
      async () => [{ ...validSpec(), topic: "APPROVED_REFERENCE" }],
  });
  assert.equal((await f.call(generateInput)).status, 200);
  assert.equal(f.state.text, 1);
  assert.equal(f.state.quota, 1);
  assert.equal(f.state.saves, 0);
  assert.ok(f.state.prompt.includes("APPROVED_REFERENCE"));
  assert.ok(f.state.prompt.includes("nao representam treinamento automatico"));
});

Deno.test("quota blocks provider and provider failures cannot disclose exception text", async () => {
  const limited = fixture({}, { quota: async () => false });
  assert.equal((await limited.call(generateInput)).status, 429);
  assert.equal(limited.state.text, 0);
  const failed = fixture({
    text: async () => {
      throw new Error("private provider key and brief");
    },
  });
  const response = await failed.call(generateInput);
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes("private"), false);
  assert.equal(failed.state.saves, 0);
});

Deno.test("invalid generated/revised shape or changed identity never returns spec", async () => {
  for (
    const value of [{}, { ...validSpec(), format: "post" }, {
      ...validSpec(),
      aesthetic: "navy",
    }, {
      ...validSpec(),
      slides: [{
        role: "capa",
        title: "x",
        background_path: `studio/${postId}/assets/${imageId}.png`,
      }],
    }]
  ) {
    for (
      const action of [generateInput, {
        action: "revise",
        spec: validSpec(),
        instruction: "Deixe mais claro",
      }]
    ) {
      const f = fixture({ text: async () => value });
      assert.equal((await f.call(action)).status, 502);
      assert.equal(f.state.saves, 0);
    }
  }
});

Deno.test("revise preserves format/aesthetic and may retain existing private image", async () => {
  const original = validSpec();
  original.slides[0].background_path = `studio/${postId}/assets/${imageId}.png`;
  const f = fixture({
    text: async () => ({ ...original, caption: "Legenda revisada" }),
  });
  const response = await f.call({
    action: "revise",
    spec: original,
    instruction: "Encurte a legenda",
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).spec.slides[0].background_path,
    original.slides[0].background_path,
  );
});

Deno.test("images require existing saved post and valid slide before quota", async () => {
  const f = fixture();
  const input = {
    action: "image",
    post_id: postId,
    slide_index: 0,
    scene: "Neutral gym",
    aspect: "4:5",
  };
  assert.equal((await f.call(input)).status, 404);
  assert.equal(f.state.quota + f.state.image, 0);
  await f.call(saveInput());
  assert.equal((await f.call({ ...input, slide_index: 10 })).status, 400);
  assert.equal(f.state.quota + f.state.image, 0);
  const response = await f.call(input);
  assert.equal(response.status, 200);
  const image = await response.json();
  assert.equal(image.path, `studio/${postId}/assets/${imageId}.png`);
  assert.ok(image.signedUrl.startsWith("https://storage.test/"));
  assert.equal(f.state.uploads, 1);
  assert.equal(f.state.post?.version, 1);
});

Deno.test("image MIME/signature/size/signing/upload failures produce no positive ACK", async () => {
  for (
    const image of [{ bytes: png, mime: "image/webp" }, {
      bytes: new Uint8Array(100),
      mime: "image/png",
    }, {
      bytes: new Uint8Array(BN_CONTENT_LIMITS.imageBytes + 1),
      mime: "image/png",
    }]
  ) {
    const f = fixture({ image: async () => image });
    await f.call(saveInput());
    assert.equal(
      (await f.call({
        action: "image",
        post_id: postId,
        slide_index: 0,
        scene: "Gym",
        aspect: "4:5",
      })).status,
      502,
    );
    assert.equal(f.state.uploads, 0);
  }
  for (
    const override of [{
      upload: async () => {
        throw new Error("private storage failure");
      },
    }, { signedAssets: async () => ({}) }]
  ) {
    const f = fixture({}, override);
    await f.call(saveInput());
    const response = await f.call({
      action: "image",
      post_id: postId,
      slide_index: 0,
      scene: "Gym",
      aspect: "9:16",
    });
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes("private"), false);
  }
});

Deno.test("calendar validates generated weeks and persists only valid provider output", async () => {
  const calendar = {
    weeks: [{
      week: 1,
      items: [{
        day: "Seg",
        bucket: "atracao",
        objetivo: "autoridade",
        format_key: "mito-vs-verdade",
        format_name: "Mito vs. Verdade",
        aesthetic: "l1_educativo",
        layout_id: "L1",
        pillar: BN_STUDIO_SETTINGS.pillars[0],
        topic: "Carga",
        hook: "Ajuste a carga",
      }],
    }],
  };
  const f = fixture({ text: async () => calendar });
  const response = await f.call({
    action: "calendar",
    weeks: 1,
    posts_per_week: 1,
    focus: "Avaliacao",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).calendar.id, imageId);
  assert.equal(f.state.calendars, 1);
  const invalid = fixture({ text: async () => ({ weeks: [] }) });
  assert.equal(
    (await invalid.call({
      action: "calendar",
      weeks: 1,
      posts_per_week: 1,
      focus: "",
    })).status,
    502,
  );
  assert.equal(invalid.state.calendars, 0);
});
