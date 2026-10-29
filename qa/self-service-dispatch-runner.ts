// One actual dispatcher HTTP request per native Deno process; no injected SDK/DB adapter.
import { handleAutomationRequest } from '../supabase/functions/process-automation-sessions/index.ts';

if (Deno.args[0] === '--check-only') Deno.exit(0);
const port = Number(Deno.args[0]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Loopback port required');
if (Deno.env.get('SUPABASE_URL') !== 'http://127.0.0.1:57421') throw new Error('Local gateway required');
const provider = new URL(Deno.env.get('EVOLUTION_API_URL') || '');
if (provider.hostname !== '127.0.0.1' || provider.protocol !== 'http:' || provider.username || provider.password) {
  throw new Error('Loopback fake provider required');
}
let requests = 0;
const server = Deno.serve({ hostname: '127.0.0.1', port, onListen: () => console.log('dispatch-ready') }, async request => {
  if (++requests !== 1) return Response.json({ error: 'one_request_only' }, { status: 409 });
  try {
    return await handleAutomationRequest(request);
  } finally {
    setTimeout(() => void server.shutdown(), 20);
  }
});
await server.finished;
