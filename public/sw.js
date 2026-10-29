// SETT service worker — NETWORK-FIRST (instalável + offline, sem bundle velho).
// Estratégia:
//   - Navegação / HTML  → network-first: sempre tenta a rede (versão mais nova); cache só como
//     fallback offline. Isso evita o bug de "bundle/dados velhos" que motivou o kill-switch antigo.
//   - Assets do Vite (JS/CSS com hash no nome) → cache-first: o nome muda a cada build, então o
//     cache NUNCA serve algo desatualizado; ganhamos velocidade e offline.
// Bump CACHE a cada mudança estrutural; manter gerações antigas para fallback seguro.
const CACHE = "sett-cache-v14";
// A shell replacement is a single Cache.put; failed writes preserve the previous entry.
// Serialize commits so a slower, older request cannot overwrite a newer healthy response.
let shellRequest = 0;
let committedShellRequest = 0;
let shellCommit = Promise.resolve();

async function healthyShell(response) {
  if (!response || response.status !== 200 || response.redirected ||
      !["basic", "default"].includes(response.type) ||
      !/^text\/html(?:;|$)/i.test(response.headers.get("content-type") || "") ||
      /(?:private|no-store)/i.test(response.headers.get("cache-control") || "") ||
      /(?:cookie|authorization|\*)/i.test(response.headers.get("vary") || "") ||
      response.headers.has("set-cookie")) return false;
  let html;
  try { html = await response.clone().text(); } catch { return false; }
  return /<title>Set Training App(?: —[^<]*)?<\/title>/.test(html) &&
    /<div\s+id=["']root["']\s*><\/div>/.test(html) &&
    /<script\b[^>]*type=["']module["'][^>]*src=["']\/assets\/[^"']+-[A-Za-z0-9_-]{6,}\.js["'][^>]*>/.test(html);
}

async function lastHealthyShell() {
  const keys = await caches.keys();
  const candidates = [CACHE, ...keys.filter(k => k !== CACHE && /^sett-cache-v\d+$/.test(k)).reverse()];
  for (const key of candidates) {
    const cached = await (await caches.open(key)).match("/");
    if (await healthyShell(cached)) return cached;
  }
  return null;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Retain previous generations, including their hashed chunks, until a healthy
      // replacement has actually been stored. Activation alone proves no shell exists.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // só same-origin

  // APIs and authenticated requests must never populate or read the public shell cache.
  const privateRequest = req.headers.has("authorization") || req.headers.has("cookie") ||
    /^\/(?:api|auth|rest|functions|storage)(?:\/|$)/.test(url.pathname) ||
    url.pathname.startsWith("/.netlify/");
  if (privateRequest) { event.respondWith(fetch(req)); return; }

  const isHTML =
    req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    const sequence = ++shellRequest;
    const work = (async () => {
      let fresh;
      try { fresh = await fetch(req); } catch { /* offline fallback below */ }
      // Only the canonical, query-free public shell may replace the offline entry.
      if (fresh && ["/", "/index.html"].includes(url.pathname) && !url.search &&
          await healthyShell(fresh)) {
        const snapshot = fresh.clone();
        shellCommit = shellCommit.catch(() => {}).then(async () => {
          if (sequence <= committedShellRequest) return;
          await (await caches.open(CACHE)).put("/", snapshot);
          committedShellRequest = sequence;
        });
        try { await shellCommit; } catch { /* quota failure: keep last valid shell */ }
      }
      if (fresh && fresh.status < 500) return fresh;
      try { return (await lastHealthyShell()) || fresh || Response.error(); }
      catch { return fresh || Response.error(); }
    })();
    event.respondWith(work);
    event.waitUntil(work.then(() => {}));
    return;
  }

  // Preview/dev Vite usa módulos sem hash estável. Nunca cachear isso, senão o browser pode
  // misturar chunks de React de compilações diferentes e quebrar hooks como useState.
  const isViteDevModule =
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/node_modules/.vite/") ||
    url.pathname === "/vite.svg";

  if (isViteDevModule) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  const isHashedBuildAsset = /\/assets\/.*-[A-Za-z0-9_-]{6,}\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/.test(url.pathname);
  const isStaticPwaAsset = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"].includes(url.pathname);

  if (url.search || (!isHashedBuildAsset && !isStaticPwaAsset)) {
    event.respondWith(fetch(req));
    return;
  }

  // Assets hasheados de build → cache-first (seguros porque o nome muda por build).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      let cached = await cache.match(req);
      if (!cached && isHashedBuildAsset) {
        // A valid older HTML shell references its own immutable asset generation.
        for (const key of (await caches.keys()).filter(k => k !== CACHE && /^sett-cache-v\d+$/.test(k)).reverse()) {
          cached = await (await caches.open(key)).match(req);
          if (cached) break;
        }
      }
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200 && fresh.type === "basic" &&
            !/(?:private|no-store)/i.test(fresh.headers.get("cache-control") || "") &&
            !/text\/html/i.test(fresh.headers.get("content-type") || "") &&
            !/(?:cookie|authorization|\*)/i.test(fresh.headers.get("vary") || "") &&
            !fresh.headers.has("set-cookie")) {
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});

// ── Web Push (VAPID) ─────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "SETT";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/aluno" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/aluno";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
      return clients.openWindow(url);
    }),
  );
});
