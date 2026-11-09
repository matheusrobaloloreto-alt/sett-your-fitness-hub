// Real Edge handlers and Supabase SDK, with synthetic HTTP responses only.
import { businessDateYmd } from "../functions/_shared/business-date.ts";

const companyId = "00000000-0000-4000-8000-000000000001";
const studentId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
const today = businessDateYmd();
const future = "2999-01-01";
const expired = "2000-01-01";
const jwtPart = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
const token = `${jwtPart({ alg: "HS256", typ: "JWT" })}.${jwtPart({ sub: userId, exp: 32472144000 })}.c2ln`;

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function runSyntheticHandler(
  load: () => Promise<{ handleNutritionMeals?: (req: Request) => Promise<Response> } | object>,
  body: object,
  adapter: (url: URL, method: string, payload: any) => Response,
  opts: { profileUserId?: string; expectedStatus?: number } = {},
) {
  const env = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"] as const;
  const originalEnv = env.map(key => Deno.env.get(key));
  const values = ["http://synthetic.invalid", "synthetic-anon", "synthetic-service", "synthetic-model-key"];
  env.forEach((key, index) => Deno.env.set(key, values[index]));
  const serve = Deno.serve;
  const fetch = globalThis.fetch;
  let handler!: (req: Request) => Response | Promise<Response>;
  Deno.serve = ((fn: typeof handler) => { handler = fn; }) as typeof Deno.serve;
  globalThis.fetch = (async (req: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(req instanceof Request ? req.url : req);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: userId, aud: "authenticated" });
    if (url.pathname.endsWith("/service_company_feature_allowed")) return Response.json(true);
    if (url.pathname.endsWith("/students")) return Response.json([{
      id: studentId, company_id: companyId, user_id: opts.profileUserId ?? userId, full_name: "Aluno sintético", weight_kg: 75,
    }]);
    return adapter(url, init?.method ?? "GET", init?.body ? JSON.parse(String(init.body)) : null);
  }) as typeof globalThis.fetch;
  try {
    const module = await load();
    if ("handleNutritionMeals" in module && module.handleNutritionMeals) handler = module.handleNutritionMeals;
    const result = await handler(new Request("http://synthetic.invalid/edge", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    }));
    check(result.status === (opts.expectedStatus ?? 200), `handler failed: ${result.status} ${await result.clone().text()}`);
    return await result.json();
  } finally {
    Deno.serve = serve;
    globalThis.fetch = fetch;
    env.forEach((key, index) => {
      const original = originalEnv[index];
      if (original === undefined) Deno.env.delete(key);
      else Deno.env.set(key, original);
    });
  }
}

Deno.test("nutritionist upload retires only the current same-tenant nutrition plan", async () => {
  let retired = false;
  await runSyntheticHandler(
    () => import("../functions/ai-nutrition-meals/index.ts"),
    { action: "save_external_plan", student_id: studentId, raw_text: "ALMOÇO\nArroz, feijão e frango\nJANTAR\nSopa de legumes" },
    (url, method, payload) => {
      check(url.hostname === "synthetic.invalid", "unexpected network request");
      if (url.pathname.endsWith("/student_anamneses")) return Response.json([]);
      check(url.pathname.endsWith("/nutrition_plans"), "unexpected write relation");
      if (method === "POST") return Response.json([payload]);
      check(method === "PATCH" && payload.status === "inactive", "missing supersession update");
      const filters = url.searchParams.getAll("or");
      check(url.searchParams.get("company_id") === `eq.${companyId}`
        && url.searchParams.get("student_id") === `eq.${studentId}`
        && url.searchParams.get("status") === "eq.active"
        && filters.includes(`(start_date.is.null,start_date.lte.${today})`)
        && filters.includes(`(end_date.is.null,end_date.gte.${today})`),
      "supersession can change a future or out-of-scope plan");
      retired = true;
      return new Response(null, { status: 204 });
    },
  );
  check(retired, "the upload skipped prior-plan supersession");
});

Deno.test("nutritionist upload authorizes the owner or company staff before reading or writing meals", async () => {
  const body = { action: "save_external_plan", student_id: studentId, raw_text: "ALMOÇO\nArroz e feijão\nJANTAR\nSopa de legumes" };
  const profileUserId = "00000000-0000-4000-8000-000000000004";
  for (const status of [403, 503, 200]) {
    let writes = 0;
    await runSyntheticHandler(() => import("../functions/ai-nutrition-meals/index.ts"), body, (url, method, payload) => {
      if (url.pathname.endsWith("/is_company_staff")) {
        check(payload._user_id === userId && payload._company_id === companyId, "wrong staff scope");
        if (status === 503) return Response.json({ message: "Synthetic staff lookup failure" }, { status: 500 });
        return Response.json(status === 200);
      }
      if (url.pathname.endsWith("/get_user_company_id")) return Response.json(companyId);
      if (url.pathname.endsWith("/has_role")) return Response.json(false);
      check(status === 200, "unauthorized actor reached nutrition data");
      if (url.pathname.endsWith("/student_anamneses")) return Response.json([]);
      check(url.pathname.endsWith("/nutrition_plans"), "unexpected relation");
      writes++;
      return method === "POST" ? Response.json([payload]) : new Response(null, { status: 204 });
    }, { profileUserId, expectedStatus: status });
    check(writes === (status === 200 ? 2 : 0), "unexpected nutrition writes");
  }
});

Deno.test("student BNITO loads only current cardio and nutrition and omits future-only strength", async () => {
  let prompt = "";
  const filtered = new Set<string>();
  const result = await runSyntheticHandler(
    () => import("../functions/ai-student-bnito/index.ts"),
    { action: "brief" },
    (url, _method, payload) => {
      if (url.hostname === "api.anthropic.com") {
        prompt = payload.messages[0].content;
        return Response.json({ content: [{ type: "text", text: '{"answer":"Resposta sintética","topic":"treino"}' }] });
      }
      check(url.hostname === "synthetic.invalid", "unexpected network request");
      const table = url.pathname.split("/").at(-1)!;
      if (table === "enrollments") return Response.json([{ id: "enrollment", status: "active", start_date: expired }]);
      if (table === "workouts") throw new Error("BNITO fetched workouts for a future-only cycle");
      if (["training_cycles", "running_plans", "nutrition_plans"].includes(table)) {
        const filters = url.searchParams.getAll("or");
        check(filters.includes(`(start_date.is.null,start_date.lte.${today})`)
          && filters.includes(`(end_date.is.null,end_date.gte.${today})`), `${table} omitted the current date window`);
        filtered.add(table);
        if (table === "training_cycles") {
          // Simulate a backend returning an unexpected future record anyway.
          return Response.json([{ id: "future", start_date: future, end_date: "2999-02-01", status: "active" }]);
        }
        check(url.searchParams.get("company_id") === `eq.${companyId}`
          && filters.some(filter => filter.startsWith("(status.")), `${table} omitted tenant/status checks`);
        return Response.json([{ id: table, goal: `CURRENT_${table}`, start_date: today }]);
      }
      return Response.json([]);
    },
  );
  check(filtered.size === 3 && prompt.includes("CURRENT_running_plans") && prompt.includes("CURRENT_nutrition_plans")
    && !prompt.includes(future) && !result.context_loaded.has_todays_workout,
  "BNITO prompt contained future-only data or missed current modalities");
});
