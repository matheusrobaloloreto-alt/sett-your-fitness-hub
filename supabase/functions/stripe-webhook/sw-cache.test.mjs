import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
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
  let putFailure = false;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (key) => stores.delete(key),
    open: async (key) => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return {
        match: async (req) =>
          store.get(typeof req === "string" ? req : req.url)?.clone(),
        put: async (req, res) => {
          if (putFailure) throw Error("disk full");
          store.set(typeof req === "string" ? req : req.url, res.clone());
        },
      };
    },
  };
  vm.runInNewContext(
    readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8"),
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
      fetch: (...args) => network(...args),
    },
  );
  return {
    stores,
    caches,
    setNetwork(fn) {
      network = fn;
    },
    failPut() {
      putFailure = true;
    },
    async navigate(path = "/", headers = { accept: "text/html" }) {
      let pending, result;
      listeners.fetch({
        request: {
          url: "https://synthetic.test" + path,
          method: "GET",
          mode: headers.accept === "application/javascript"
            ? "cors"
            : "navigate",
          headers: new Headers(headers),
        },
        respondWith(p) {
          result = p;
        },
        waitUntil(p) {
          pending = p;
        },
      });
      const res = await result;
      if (pending) await pending;
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
    new Response("/* old valid asset */"),
  );
  await w.activate();
  w.setNetwork(async () => {
    throw Error("offline");
  });
  const result = await w.navigate("/assets/index-synthetic123.js", {
    accept: "application/javascript",
  });
  assert.equal(await result.text(), "/* old valid asset */");
});
