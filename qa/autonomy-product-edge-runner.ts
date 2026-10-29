// Real source handlers, loopback-only Deno runtime; not a hosted deployment.
const handlers={
 'public-anamnesis':57641,'intercycle-anamnesis':57642,
 'public-registration':57643,'ai-prescribe-workout':57644,
} as const;
const name=Deno.args[0] as keyof typeof handlers,port=handlers[name];
if(!port)throw new Error('Unsupported local handler');
const listen=Deno.listen,serve=Deno.serve;
Deno.listen=((options:Deno.ListenOptions)=>listen({...options,hostname:'127.0.0.1',port})) as typeof Deno.listen;
Deno.serve=((handler:Deno.ServeHandler)=>serve({hostname:'127.0.0.1',port},handler)) as typeof Deno.serve;
await import(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url).href);
