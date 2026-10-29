// Native Deno harness: executes the unmodified Edge handler with real local Auth/REST.
// This is explicitly not the hosted Supabase Edge Runtime deployment.
const handlers = {
  'public-anamnesis': { port: 57441, source: '../supabase/functions/public-anamnesis/index.ts' },
  'intercycle-anamnesis': { port: 57442, source: '../supabase/functions/intercycle-anamnesis/index.ts' },
  'public-registration': { port: 57443, source: '../supabase/functions/public-registration/index.ts' },
} as const;
const key = Deno.args[0] as keyof typeof handlers;
const selected = handlers[key];
if (!selected) throw new Error('Only local form handlers are allowed');
const serve = Deno.serve;
Deno.serve = ((handler: Deno.ServeHandler) => serve({ hostname: '127.0.0.1', port: selected.port }, handler)) as typeof Deno.serve;
await import(new URL(selected.source, import.meta.url).href);
