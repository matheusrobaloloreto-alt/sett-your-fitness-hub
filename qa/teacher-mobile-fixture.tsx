// Install the network barrier BEFORE dynamically importing any application/Supabase module.
// Vite assets may load from this origin; HTTP mutations and external fetches never leave the fixture.
const nativeFetch = window.fetch.bind(window);
const blockedRequests: Array<{ method: string; origin: string }> = [];
(window as unknown as { __settVisualNetwork: unknown }).__settVisualNetwork = { blockedRequests };
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input), window.location.href);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  if (url.origin === window.location.origin && ["GET", "HEAD"].includes(method)) return nativeFetch(input, init);
  blockedRequests.push({ method, origin: url.origin });
  return Promise.resolve(new Response(JSON.stringify({ error: "qa_network_blocked" }), {
    status: 503, headers: { "Content-Type": "application/json" },
  }));
}) as typeof fetch;
XMLHttpRequest.prototype.send = function () {
  throw new DOMException("XHR is disabled in the isolated QA fixture", "NetworkError");
};
Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: () => false });
void import("./professional-visual-runtime").catch(error => {
  console.error("Visual fixture initialization failed", error);
  const root = document.getElementById("root");
  if (root) root.textContent = "Falha ao inicializar fixture. Confira o console local.";
});
