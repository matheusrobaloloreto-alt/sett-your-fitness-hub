// SETT service worker — NETWORK-FIRST (instalável + offline, sem bundle velho).
// Estratégia:
//   - Navegação / HTML  → network-first: sempre tenta a rede (versão mais nova); cache só como
//     fallback offline. Isso evita o bug de "bundle/dados velhos" que motivou o kill-switch antigo.
//   - Assets do Vite (JS/CSS com hash no nome) → cache-first: o nome muda a cada build, então o
//     cache NUNCA serve algo desatualizado; ganhamos velocidade e offline.
// Bump CACHE a cada mudança estrutural deste arquivo para forçar limpeza dos caches antigos.
const CACHE = "sett-cache-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
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

  const isHTML =
    req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    // Network-first: versão nova sempre que houver rede; cache offline como rede de segurança.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put("/", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match("/")) || (await cache.match(req)) || Response.error();
        }
      })(),
    );
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

  if (!isHashedBuildAsset && !isStaticPwaAsset) {
    event.respondWith(fetch(req));
    return;
  }

  // Assets hasheados de build → cache-first (seguros porque o nome muda por build).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200 && fresh.type === "basic") {
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
