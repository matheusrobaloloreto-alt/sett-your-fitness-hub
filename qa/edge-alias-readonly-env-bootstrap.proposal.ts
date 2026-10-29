// TEST alias only: per-isolate nonsecret configuration reads; candidate.ts stays byte-identical.
const env = Deno.env;
const originalGetter = env.get;
const readEnv = originalGetter.bind(env);
const expected = "https://ifymocggowdlqqcxugko.supabase.co";
if (readEnv("SUPABASE_URL") !== expected) throw new Error("TEST backend mismatch");
for (const name of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LOVABLE_API_KEY"]) {
  if (readEnv(name)) throw new Error("Paid provider credential present; TEST alias withheld");
}
// Edge Runtime op_set_env is unsupported. Never set/delete global or isolate secrets.
const descriptor = Object.getOwnPropertyDescriptor(env, "get");
if (!descriptor || descriptor.writable !== true || typeof descriptor.value !== "function") {
  throw new Error("TEST env read overlay unavailable");
}
try {
  env.get = (name) => {
    switch (name) {
      case "APP_URL":
      case "PUBLIC_APP_URL":
        return "http://127.0.0.1:57650";
      case "PRESCRIPTION_AI_FIRST":
      case "PRESCRIPTION_ENGINE_V1":
        return "off";
      default:
        return readEnv(name);
    }
  };
} catch {
  throw new Error("TEST env read overlay unavailable");
}
if (env.get === originalGetter) throw new Error("TEST env read overlay unavailable");
await import("./candidate.ts");
