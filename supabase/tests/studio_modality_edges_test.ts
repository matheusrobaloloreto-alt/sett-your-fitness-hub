// Run with deno test --allow-env supabase/tests/studio_modality_edges_test.ts.
// The real handlers and Supabase SDK run against a synthetic fetch adapter.
const companyId = "00000000-0000-4000-8000-000000000001";
const studentId = "00000000-0000-4000-8000-000000000002";
const actorId = "00000000-0000-4000-8000-000000000003";
const cycleId = "00000000-0000-4000-8000-000000000004";
const bundleId = "00000000-0000-4000-8000-000000000005";
const planId = "00000000-0000-4000-8000-000000000006";
const date = "2026-11-01T00:00:00+00:00";

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("Studio modality edges stage all sports and nutrition, edit drafts, and preserve legacy callers", async () => {
  const env = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"] as const;
  const originalEnv = env.map(key => Deno.env.get(key));
  Deno.env.set("SUPABASE_URL", "http://synthetic.invalid");
  Deno.env.set("SUPABASE_ANON_KEY", "synthetic-anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
  Deno.env.delete("ANTHROPIC_API_KEY");

  const serve = Deno.serve;
  const fetch = globalThis.fetch;
  let handler: (request: Request) => Response | Promise<Response>;
  const staged: Record<string, unknown>[] = [];
  const live: string[] = [];
  let staff = true;
  let stale = false;
  let marked = true;
  let dated = true;
  let lookupDraft: Record<string, unknown> | null = null;

  Deno.serve = ((fn: typeof handler) => { handler = fn; }) as typeof Deno.serve;
  globalThis.fetch = (async (request: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(request instanceof Request ? request.url : request);
    check(url.hostname === "synthetic.invalid", "unexpected external request");
    const relation = url.pathname.split("/").at(-1);
    const method = options?.method ?? "GET";
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    switch (relation) {
      case "user": return Response.json({ id: actorId, aud: "authenticated" });
      case "has_role": return Response.json(false);
      case "get_user_company_id": return Response.json(companyId);
      case "is_company_staff": return Response.json(staff);
      case "service_company_feature_allowed": return Response.json(true);
      case "students": return Response.json(url.searchParams.has("user_id") ? [] : [{ id: studentId, company_id: companyId }]);
      case "company_ai_config": return Response.json([]);
      case "training_cycles": return Response.json([{
        id: cycleId, student_id: studentId, company_id: companyId, cycle_number: 1,
        start_date: "2026-11-01", end_date: "2026-12-12",
      }]);
      case "prescription_bundles": return Response.json([{
        id: bundleId, training_cycle_id: dated ? cycleId : null, status: "generating", studio_modalities_draft: marked,
        modalities: ["corrida", "ciclismo", "natacao", "nutricao"],
      }]);
      case "studio_modality_drafts": return Response.json(lookupDraft ? [lookupDraft] : []);
      case "write_studio_modality_draft":
        staged.push(body);
        return stale
          ? Response.json({ message: "studio_bundle_changed" }, { status: 400 })
          : Response.json({ id: planId, updated_at: date, plan: body.p_plan, draft_only: true });
      case "running_plans":
      case "nutrition_plans":
        live.push(`${relation}:${method}`);
        if (method === "GET") return Response.json([{
          id: planId, student_id: studentId, company_id: companyId, sport: "corrida", updated_at: date,
        }]);
        if (method === "PATCH") return Response.json([{ id: planId, updated_at: date }]);
        return Response.json({ id: body.id, updated_at: date });
      default: throw new Error(`Unexpected local endpoint: ${url.pathname}`);
    }
  }) as typeof globalThis.fetch;

  const input = {
    student_id: studentId, company_id: companyId, bundle_id: bundleId, training_cycle_id: cycleId,
    draft_only: true, age: 32, gender: "M", weight_kg: 75, height_cm: 178, duration_weeks: 6,
    days_per_week: 3, session_duration: 40, objective: "manutenção", goal: "Melhorar condicionamento",
  };
  const invoke = (body: object, authorized = true) => handler(new Request("http://synthetic.invalid/edge", {
    method: "POST", body: JSON.stringify(body), headers: authorized ? { Authorization: "Bearer synthetic" } : {},
  }));

  try {
    await import("../functions/ai-running-plan/index.ts");
    for (const sport of ["corrida", "ciclismo", "natacao"]) {
      const response = await invoke({ ...input, sport });
      const result = await response.json();
      check(response.ok && result.draft_only && result.plan.weeks.length === 6,
        `${sport} failed to generate a complete draft: ${JSON.stringify(result)}`);
      check(staged.at(-1)?.p_modality === sport, `${sport} used the wrong draft slot`);
    }
    check(live.length === 0, "Studio cardio accessed live plan tables during generation");
    const rejected = await invoke({ ...input, training_cycle_id: null, sport: "corrida" });
    check(rejected.status === 409, "draft generation accepted a missing cycle");
    const cached = { ...input, draft_only: undefined };
    const cachedRunning = await invoke({ ...cached, sport: "corrida" });
    check(cachedRunning.ok && (await cachedRunning.json()).draft_only, "cached caller bypassed a marked bundle");
    marked = false;
    check((await invoke({ ...cached, sport: "corrida" })).status === 409 && live.length === 0,
      "cached caller wrote live running to a pre-migration dated bundle");
    dated = false;
    const legacy = await invoke({ ...cached, sport: "corrida", training_cycle_id: null });
    check(legacy.ok && live.join() === "running_plans:POST", "legacy undated running caller lost its live contract");

    await import("../functions/ai-nutrition-plan/index.ts");
    dated = true;
    check((await invoke(cached)).status === 409 && live.length === 1,
      "cached caller wrote live nutrition to a pre-migration dated bundle");
    marked = true;
    const nutrition = await invoke(cached);
    const nutritionDraft = await nutrition.json();
    check(nutrition.ok && nutritionDraft.draft_only && nutritionDraft.plan.meals.length > 0,
      `nutrition failed to stage a complete draft: ${JSON.stringify(nutritionDraft)}`);
    check(staged.at(-1)?.p_modality === "nutricao" && live.length === 1, "nutrition accessed live data during generation");
    check((await invoke(input, false)).status === 401, "nutrition accepted an unauthenticated request");
    staff = false;
    check((await invoke(input)).status === 403 && live.length === 1, "nutrition accepted an unauthorized tenant request");
    staff = true;

    await import("../functions/update-running-plan-draft/index.ts");
    const running = staged.find(item => item.p_modality === "corrida")!;
    const runningPlan = running.p_plan as object;
    const edit = { plan_id: planId, expected_updated_at: date, plan: runningPlan };
    lookupDraft = {
      id: planId, updated_at: date, modality: "corrida", plan: runningPlan, payload: running.p_payload,
      prescription_bundles: { id: bundleId, student_id: studentId, company_id: companyId, training_cycle_id: cycleId },
    };
    const save = await invoke(edit);
    check(save.ok && staged.at(-1)?.p_draft_id === planId && live.length === 1,
      `staged editor did not use the draft CAS: ${await save.text()}`);
    stale = true;
    check((await invoke(edit)).status === 409 && live.length === 1, "stale editor fell back to a live update");
    lookupDraft = null;
    check((await invoke(edit)).ok && live.slice(1).join() === "running_plans:GET,running_plans:PATCH",
      "legacy editor lost its existing live update path");
  } finally {
    Deno.serve = serve;
    globalThis.fetch = fetch;
    env.forEach((key, index) => {
      const original = originalEnv[index];
      if (original === undefined) Deno.env.delete(key);
      else Deno.env.set(key, original);
    });
  }
});
