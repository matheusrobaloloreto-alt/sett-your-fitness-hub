import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const sw = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const cacheName = sw.match(/const CACHE = "([^"]+)"/)[1];
const assetPath = "/assets/AdminAgenda-synthetic123.js";
const assetUrl = "https://synthetic.test" + assetPath;
const javascript = (body = "export default 'healthy'", status = 200, headers = {}) =>
  new Response(body, { status, headers: { "content-type": "application/javascript", ...headers } });
const brokenJavascript = () => javascript(new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("export default "));
    controller.error(new TypeError("body transport failed after 200 headers"));
  },
}));
const shell =
  '<html><head><title>Set Training App</title></head><body><div id="root"></div><script type="module" crossorigin src="/assets/index-synthetic123.js"></script></body></html>';
const response = (body = shell, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html", ...headers },
  });
function worker() {
  const listeners = {}, stores = new Map();
  let network = async () => response();
  const cacheFailures = new Set();
  const fetches = [];
  const fetchNetwork = (...args) => {
    fetches.push(args);
    return network(...args);
  };
  const caches = {
    keys: async () => {
      if (cacheFailures.has("keys")) throw Error("cache keys unavailable");
      return [...stores.keys()];
    },
    delete: async (key) => stores.delete(key),
    open: async (key) => {
      if (cacheFailures.has("open")) throw Error("cache open unavailable");
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return {
        match: async (req) => {
          if (cacheFailures.has("match")) throw Error("cache match unavailable");
          return store.get(typeof req === "string" ? req : req.url)?.clone();
        },
        put: async (req, res) => {
          if (cacheFailures.has("put")) throw Error("disk full");
          store.set(typeof req === "string" ? req : req.url, res.clone());
        },
      };
    },
  };
  vm.runInNewContext(
    sw,
    {
      self: {
        location: { origin: "https://synthetic.test" },
        addEventListener: (type, fn) => listeners[type] = fn,
        skipWaiting() {},
        clients: { claim: async () => {} },
      },
      caches,
      URL,
      Response,
      fetch: fetchNetwork,
    },
  );
  return {
    stores,
    caches,
    fetches,
    setNetwork(fn) {
      network = fn;
    },
    failPut() {
      cacheFailures.add("put");
    },
    failCache(operation) {
      cacheFailures.add(operation);
    },
    async navigate(path = "/", headers = { accept: "text/html" }, method = "GET") {
      const pending = [];
      let result;
      const request = {
        url: "https://synthetic.test" + path,
        method,
        mode: headers.accept === "text/html" ? "navigate" : "cors",
        headers: new Headers(headers),
      };
      listeners.fetch({
        request,
        respondWith(p) {
          result = p;
        },
        waitUntil(p) {
          pending.push(p);
        },
      });
      const res = await (result || fetchNetwork(request));
      await Promise.all(pending);
      return res;
    },
    async activate() {
      let pending;
      listeners.activate({
        waitUntil(p) {
          pending = p;
        },
      });
      await pending;
    },
  };
}
for (
  const [name, bad] of [["503", () => response("unavailable", 503)], [
    "foreign HTML",
    () => response("<html>Private account</html>"),
  ], [
    "JSON",
    () => response("{}", 200, { "content-type": "application/json" }),
  ], ["private", () => response(shell, 200, { "cache-control": "private" })]]
) {
  test(`last valid shell survives ${name} and offline`, async () => {
    const w = worker();
    await w.navigate();
    w.setNetwork(async () => bad());
    await w.navigate();
    w.setNetwork(async () => {
      throw Error("offline");
    });
    assert.equal(await (await w.navigate()).text(), shell);
  });
}
test("activation preserves last valid cache and unrelated caches without new shell", async () => {
  const w = worker();
  (await w.caches.open("sett-cache-v11")).put("/", response());
  await w.caches.open("unrelated");
  await w.activate();
  assert.ok(w.stores.has("sett-cache-v11"));
  assert.ok(w.stores.has("unrelated"));
  w.setNetwork(async () => {
    throw Error("offline");
  });
  assert.equal(await (await w.navigate()).text(), shell);
});
test("cache write failure still serves fresh response and keeps previous shell", async () => {
  const w = worker();
  await w.navigate();
  w.failPut();
  w.setNetwork(async () =>
    response(shell.replace("synthetic123", "synthetic456"))
  );
  assert.match(await (await w.navigate()).text(), /synthetic456/);
  w.setNetwork(async () => {
    throw Error("offline");
  });
  assert.equal(await (await w.navigate()).text(), shell);
});
test("authorization and API HTML never enter shell cache", async () => {
  const w = worker();
  await w.navigate();
  w.setNetwork(async () =>
    response(shell.replace("synthetic123", "private456"))
  );
  await w.navigate("/api/account");
  await w.navigate("/account", {
    accept: "text/html",
    authorization: "Bearer synthetic",
  });
  w.setNetwork(async () => {
    throw Error("offline");
  });
  assert.equal(await (await w.navigate()).text(), shell);
});
test("slow older navigation cannot overwrite newer healthy shell", async () => {
  const w = worker();
  let unblock;
  w.setNetwork(() => new Promise((resolve) => unblock = resolve));
  const old = w.navigate();
  await Promise.resolve();
  w.setNetwork(async () => response(shell.replace("synthetic123", "newer456")));
  await w.navigate();
  unblock(response());
  await old;
  w.setNetwork(async () => {
    throw Error("offline");
  });
  assert.match(await (await w.navigate()).text(), /newer456/);
});
test("activation never reuses a poisoned old shell", async () => {
  const w = worker();
  await (await w.caches.open("sett-cache-v11")).put(
    "/",
    response("unavailable", 503),
  );
  await w.activate();
  w.setNetwork(async () => {
    throw Error("offline");
  });
  assert.equal((await w.navigate()).type, "error");
});
test("fallback shell still has access to previous generation hashed assets", async () => {
  const w = worker();
  const old = await w.caches.open("sett-cache-v11");
  await old.put("/", response());
  await old.put(
    "https://synthetic.test/assets/index-synthetic123.js",
    javascript("/* old valid asset */"),
  );
  await w.activate();
  w.setNetwork(async () => {
    throw Error("offline");
  });
  const result = await w.navigate("/assets/index-synthetic123.js", {
    accept: "application/javascript",
  });
  assert.equal(await result.text(), "/* old valid asset */");
  assert.equal(w.fetches.length, 0);
});

for (const operation of ["open", "keys", "match"]) {
  test(`asset reaches healthy network when cache ${operation} throws`, async () => {
    const w = worker();
    w.failCache(operation);
    w.setNetwork(async () => javascript());
    const result = await w.navigate(assetPath, { accept: "application/javascript" });
    assert.equal(await result.text(), "export default 'healthy'");
    assert.equal(w.fetches.length, 1);
  });
}

test("healthy asset cache hit performs zero network requests", async () => {
  const w = worker();
  await (await w.caches.open(cacheName)).put(assetUrl, javascript());
  w.failCache("keys");
  w.setNetwork(async () => { throw Error("network must not be needed"); });
  const result = await w.navigate(assetPath, { accept: "application/javascript" });
  assert.equal(await result.text(), "export default 'healthy'");
  assert.equal(w.fetches.length, 0);
});

test("invalid HTML hits in current and older asset caches are bypassed", async () => {
  const w = worker();
  await (await w.caches.open(cacheName)).put(assetUrl, response());
  await (await w.caches.open("sett-cache-v11")).put(assetUrl, response());
  w.setNetwork(async () => javascript());
  const result = await w.navigate(assetPath, { accept: "application/javascript" });
  assert.equal(await result.text(), "export default 'healthy'");
  assert.equal(w.fetches.length, 1);
  assert.equal(await (await w.navigate(assetPath, { accept: "application/javascript" })).text(), "export default 'healthy'");
  assert.equal(w.fetches.length, 1);
});

for (const [name, invalid] of [
  ["HTTP error", () => javascript("unavailable", 503)],
  ["wrong MIME", () => response("{}", 200, { "content-type": "application/json" })],
  ["private", () => javascript("private", 200, { "cache-control": "private" })],
  ["no-store", () => javascript("private", 200, { "cache-control": "no-store" })],
  ["authorization vary", () => javascript("private", 200, { vary: "Authorization" })],
  ["cookie vary", () => javascript("private", 200, { vary: "Cookie" })],
  ["wildcard vary", () => javascript("private", 200, { vary: "*" })],
  ["set-cookie", () => javascript("private", 200, { "set-cookie": "synthetic=value" })],
]) {
  test(`cached asset with ${name} is bypassed and network result replaces it`, async () => {
    const w = worker();
    await (await w.caches.open(cacheName)).put(assetUrl, invalid());
    w.setNetwork(async () => javascript());
    const result = await w.navigate(assetPath, { accept: "application/javascript" });
    assert.equal(await result.text(), "export default 'healthy'");
    assert.equal(w.fetches.length, 1);
  });

  test(`network asset with ${name} is delivered once and never cached`, async () => {
    const w = worker();
    w.setNetwork(async () => invalid());
    await w.navigate(assetPath, { accept: "application/javascript" });
    assert.equal(w.fetches.length, 1);
    assert.equal(await (await w.caches.open(cacheName)).match(assetUrl), undefined);
  });
}

test("network HTML for a JavaScript URL is never cached or retried", async () => {
  const w = worker();
  w.setNetwork(async () => response());
  const result = await w.navigate(assetPath, { accept: "application/javascript" });
  assert.equal(result.headers.get("content-type"), "text/html");
  assert.equal(w.fetches.length, 1);
  assert.equal(await (await w.caches.open(cacheName)).match(assetUrl), undefined);
});

test("a 200 asset stays pending and uncached until its entire body has arrived", async () => {
  const w = worker();
  let finishBody;
  w.setNetwork(async () => javascript(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("export default 'complete'"));
      finishBody = () => controller.close();
    },
  })));
  let delivered = false;
  const pending = w.navigate(assetPath, { accept: "application/javascript" });
  pending.then(() => { delivered = true; });
  await new Promise(setImmediate);
  assert.equal(w.fetches.length, 1);
  assert.equal(delivered, false);
  assert.equal(await (await w.caches.open(cacheName)).match(assetUrl), undefined);
  finishBody();
  assert.equal(await (await pending).text(), "export default 'complete'");
});

for (const kind of ["fetch", "200 body"]) {
  test(`transient ${kind} transport failure retries once with a complete response`, async () => {
    const w = worker();
    w.setNetwork(async () => {
      if (w.fetches.length === 1) {
        if (kind === "fetch") throw new TypeError("fetch transport failed");
        return brokenJavascript();
      }
      return javascript();
    });
    const result = await w.navigate(assetPath, { accept: "application/javascript" });
    assert.equal(await result.text(), "export default 'healthy'");
    assert.equal(w.fetches.length, 2);
    assert.ok(w.fetches.every(([request]) => request.url === assetUrl));
    assert.equal(w.fetches[1][1].cache, "reload");
    const cached = await (await w.caches.open(cacheName)).match(assetUrl);
    assert.equal(await cached.text(), "export default 'healthy'");
  });

  test(`persistent ${kind} transport failure stops after two fetches without caching`, async () => {
    const w = worker();
    w.setNetwork(async () => {
      if (kind === "fetch") throw new TypeError("fetch transport failed");
      return brokenJavascript();
    });
    const result = await w.navigate(assetPath, { accept: "application/javascript" });
    assert.equal(result.type, "error");
    assert.equal(w.fetches.length, 2);
    assert.equal(await (await w.caches.open(cacheName)).match(assetUrl), undefined);
  });
}

test("asset cache write failure preserves the complete network response", async () => {
  const w = worker();
  w.failPut();
  w.setNetwork(async () => javascript());
  assert.equal(await (await w.navigate(assetPath, { accept: "application/javascript" })).text(), "export default 'healthy'");
  assert.equal(w.fetches.length, 1);
});

for (const [path, headers, method] of [
  ["/auth/v1/user", { accept: "application/json" }, "GET"],
  ["/rest/v1/students", { accept: "application/json" }, "GET"],
  ["/functions/v1/example", { accept: "application/json" }, "GET"],
  [assetPath, { accept: "application/javascript", authorization: "Bearer synthetic" }, "GET"],
  [assetPath, { accept: "application/javascript", cookie: "synthetic=value" }, "GET"],
  ["/nonasset", { accept: "application/json" }, "GET"],
  [assetPath + "?version=1", { accept: "application/javascript" }, "GET"],
  ["/src/main.tsx", { accept: "application/javascript" }, "GET"],
  [assetPath, { accept: "application/javascript" }, "POST"],
]) {
  test(`${method} ${path} with ${Object.keys(headers).join(",")} never retries or accesses caches`, async () => {
    const w = worker();
    w.setNetwork(async () => { throw new TypeError("transport failure"); });
    await assert.rejects(w.navigate(path, headers, method), /transport failure/);
    assert.equal(w.fetches.length, 1);
    assert.equal(w.stores.size, 0);
  });
}

test("static PWA asset body failure receives no retry", async () => {
  const w = worker();
  w.setNetwork(async () => brokenJavascript());
  const result = await w.navigate("/icon.svg", { accept: "image/svg+xml" });
  assert.equal(result.type, "error");
  assert.equal(w.fetches.length, 1);
});

test("cache enumeration failure still allows the current healthy offline shell", async () => {
  const w = worker();
  await w.navigate();
  w.failCache("keys");
  w.setNetwork(async () => { throw Error("offline"); });
  assert.equal(await (await w.navigate()).text(), shell);
});
