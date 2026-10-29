import { handleAutomationRequest } from "../supabase/functions/process-automation-sessions/index.ts";

for (const name of ["SUPABASE_URL", "EVOLUTION_API_URL"]) {
  const url = new URL(Deno.env.get(name) || "");
  if (url.hostname !== "127.0.0.1" || url.protocol !== "http:" || url.username || url.password) {
    throw new Error("Loopback QA service required");
  }
}
const port = Number(Deno.args[0]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
let requests = 0;
const server = Deno.serve({ hostname: "127.0.0.1", port, onListen: () => console.log("recovery-ready") }, async request => {
  if (++requests !== 1) return new Response(null, { status: 409 });
  try { return await handleAutomationRequest(request); }
  finally { setTimeout(() => void server.shutdown(), 20); }
});
await server.finished;
