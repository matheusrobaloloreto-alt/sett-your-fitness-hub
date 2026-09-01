import {
  evolutionBaseCandidates,
  probeProviderEndpoint,
  probeZapiFallback,
} from "./whatsappProviderDiagnostics.ts";

Deno.test("Evolution diagnostics test configured base and origin without exposing either URL", () => {
  const candidates = evolutionBaseCandidates(
    "https://provider.example.test/manager/",
  );
  if (candidates.length !== 2) throw new Error("expected two safe candidates");
  if (candidates[0] !== "https://provider.example.test/manager") {
    throw new Error("configured base was not normalized");
  }
  if (candidates[1] !== "https://provider.example.test") {
    throw new Error("origin fallback was not derived");
  }
});

Deno.test("provider endpoint diagnostics expose only status classes", async () => {
  const probe = await probeProviderEndpoint(
    async () => new Response('{"secret":"must-not-leak"}', { status: 404 }),
    "https://provider.example.test/instance/fetchInstances",
    { apikey: "secret" },
  );
  if (probe.reachable !== true || probe.status !== 404) {
    throw new Error("unexpected safe probe status");
  }
  if (probe.classification !== "not_found") {
    throw new Error("provider response was not classified");
  }
  if (JSON.stringify(probe).includes("secret")) {
    throw new Error("provider response body leaked");
  }
});

Deno.test("Z-API fallback requires connected status and a verified phone match", async () => {
  const calls: string[] = [];
  const result = await probeZapiFallback({
    instanceId: "instance",
    token: "token",
    clientToken: "client-token",
    expectedPhone: "+55 (11) 99999-0000",
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/status")) {
        return new Response('{"connected":true}', { status: 200 });
      }
      return new Response('{"phone":"5511999990000","name":"private"}', {
        status: 200,
      });
    },
  });

  if (!result.configured || !result.reachable || !result.connected) {
    throw new Error("connected fallback was not detected");
  }
  if (result.identityMatches !== true || calls.length !== 2) {
    throw new Error("fallback identity was not verified");
  }
  if (
    JSON.stringify(result).includes("private") ||
    JSON.stringify(result).includes("5511")
  ) {
    throw new Error("Z-API device identity leaked");
  }
});

Deno.test("Z-API fallback fails closed when expected identity is unavailable", async () => {
  const result = await probeZapiFallback({
    instanceId: "instance",
    token: "token",
    clientToken: "client-token",
    expectedPhone: null,
    fetcher: async (url) =>
      String(url).endsWith("/status")
        ? new Response('{"connected":true}', { status: 200 })
        : new Response('{"phone":"5511999990000"}', { status: 200 }),
  });

  if (result.identityAvailable !== true || result.identityMatches !== null) {
    throw new Error("fallback must not infer identity without a trusted phone");
  }
});
