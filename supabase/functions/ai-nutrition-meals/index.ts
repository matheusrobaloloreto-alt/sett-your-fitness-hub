// ai-nutrition-meals — gera o PLANO DE REFEIÇÕES prático (coluna nutrition_plans.meals) a partir do
// plano nutricional já existente (macros/objetivo/restrições) + anamnese (nº de refeições, horários,
// horário de treino). Função NOVA e ISOLADA: NÃO toca a ai-nutrition-plan (que está num estado de
// schema inconsistente). Idempotente: se o plano já tem meals, devolve o que existe.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("ANTHROPIC_MODEL_FAST") || "claude-haiku-4-5-20251001";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (s: string) => (s || "").replace(/[^\x20-\x7EÀ-ſ\n]/g, "").slice(0, 4000);

async function getClaims(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data, error } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
  if (error || !data?.claims) return null;
  return data.claims;
}

// Fallback determinístico (sem IA) — garante que o aluno sempre veja refeições coerentes.
function fallbackMeals(opts: { mealsPerDay: number; veg: boolean; goal: string }) {
  const { veg } = opts;
  const protein = veg ? ["tofu", "ovos", "leguminosas (feijão, lentilha, grão-de-bico)", "iogurte/queijo"] : ["frango", "peixe", "carne magra", "ovos"];
  const base = [
    { meal: "Café da manhã", time: "07:00", focus: "Energia + proteína para começar o dia", eat: ["fruta", "aveia ou pão", veg ? "ovos/iogurte" : "ovos"], go_easy: ["açúcar refinado"] },
    { meal: "Almoço", time: "12:30", focus: "Proteína + vegetais + carbo", eat: [protein[0], "vegetais variados", "arroz/batata", "feijão"], go_easy: ["frituras"] },
    { meal: "Pré-treino", time: "16:00", focus: "Carboidrato para render no treino", eat: ["arroz branco", "batata", "banana"], go_easy: ["muita gordura", "muita fibra", "excesso de proteína"] },
    { meal: "Pós-treino", time: "18:30", focus: "Recuperação: proteína + carbo", eat: [protein[1] || protein[0], "arroz/batata", "fruta"], go_easy: ["pular a refeição"] },
    { meal: "Jantar", time: "21:00", focus: "Proteína + vegetais (carbo leve)", eat: [protein[2] || protein[0], "legumes/salada", "porção menor de carbo"], go_easy: ["refeição muito pesada perto de dormir"] },
    { meal: "Ceia", time: "22:30", focus: "Algo leve com proteína", eat: [veg ? "iogurte/queijo" : "iogurte", "castanhas"], go_easy: ["doces", "cafeína"] },
  ];
  return base.slice(0, Math.min(Math.max(opts.mealsPerDay || 5, 3), 6));
}

const mealHeaderRe = /^(café|cafe|desjejum|colação|colacao|lanche|almoço|almoco|jantar|ceia|pré[\s-]?treino|pre[\s-]?treino|pós[\s-]?treino|pos[\s-]?treino|refei[cç][aã]o\s*\d+|\d+[ªa]?\s*refei[cç][aã]o)\b[:\-\s]*/i;
const timeRe = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/;

function normalizeTime(value: string) {
  const match = value.match(timeRe);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeMealLabel(value: string, index: number) {
  const text = value
    .replace(/cafe/i, "Café")
    .replace(/almoco/i, "Almoço")
    .replace(/pre[\s-]?treino/i, "Pré-treino")
    .replace(/pos[\s-]?treino/i, "Pós-treino")
    .trim();
  if (!text) return `Refeição ${index + 1}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseExternalDietText(rawText: string, expectedMeals: number) {
  const lines = clean(rawText)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-•*]+/, "").trim())
    .filter(Boolean);
  const meals: any[] = [];
  let current: { meal: string; time: string | null; items: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const items = current.items
      .map((item) => item.replace(mealHeaderRe, "").replace(timeRe, "").replace(/^[\s:–—-]+/, "").trim())
      .filter(Boolean);
    meals.push({
      meal: current.meal,
      time: current.time,
      focus: "Cardápio informado pelo nutricionista",
      eat: items.length ? items : ["seguir o cardápio prescrito"],
      go_easy: [],
      note: "Siga as quantidades e substituições combinadas com seu nutricionista.",
    });
  };

  for (const line of lines) {
    const header = line.match(mealHeaderRe);
    if (header) {
      pushCurrent();
      current = {
        meal: normalizeMealLabel(header[1], meals.length),
        time: normalizeTime(line),
        items: [line.replace(header[0], "").trim()].filter(Boolean),
      };
    } else if (current) {
      current.items.push(line);
      if (!current.time) current.time = normalizeTime(line);
    } else {
      current = {
        meal: `Refeição ${meals.length + 1}`,
        time: normalizeTime(line),
        items: [line],
      };
    }
  }
  pushCurrent();

  if (meals.length <= 1 && lines.length > 1) {
    const target = Math.min(Math.max(Number(expectedMeals) || 3, 1), 8);
    const chunkSize = Math.max(1, Math.ceil(lines.length / target));
    return Array.from({ length: Math.min(target, Math.ceil(lines.length / chunkSize)) }).map((_, index) => {
      const chunk = lines.slice(index * chunkSize, index * chunkSize + chunkSize);
      return {
        meal: `Refeição ${index + 1}`,
        time: normalizeTime(chunk.join(" ")),
        focus: "Cardápio informado pelo nutricionista",
        eat: chunk.map((item) => item.replace(timeRe, "").trim()).filter(Boolean),
        go_easy: [],
        note: "Siga as quantidades e substituições combinadas com seu nutricionista.",
      };
    });
  }

  return meals;
}

function sanitizeMeals(meals: any[]) {
  return meals.slice(0, 8).map((m: any, index) => ({
    meal: typeof m?.meal === "string" ? m.meal.slice(0, 60) : `Refeição ${index + 1}`,
    time: typeof m?.time === "string" ? m.time.slice(0, 12) : null,
    focus: typeof m?.focus === "string" ? m.focus.slice(0, 160) : null,
    eat: Array.isArray(m?.eat) ? m.eat.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 10).map((x: string) => x.slice(0, 110)) : [],
    go_easy: Array.isArray(m?.go_easy) ? m.go_easy.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 6).map((x: string) => x.slice(0, 80)) : [],
    note: typeof m?.note === "string" ? m.note.slice(0, 200) : null,
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const claims = await getClaims(req);
  if (!claims?.sub) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json();
    const { student_id } = body;
    const action = String(body?.action || "generate");
    if (!student_id) return json({ error: "student_id obrigatório" }, 400);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Autorização: o próprio aluno (students.user_id = sub), master, ou staff da mesma empresa.
    const { data: student } = await db.from("students").select("id, company_id, user_id").eq("id", student_id).maybeSingle();
    if (!student) return json({ error: "Aluno não encontrado" }, 404);
    const isOwner = student.user_id === claims.sub;
    let allowed = isOwner;
    if (!allowed) {
      const [{ data: isMaster }, { data: userCompany }] = await Promise.all([
        db.rpc("has_role", { _user_id: claims.sub, _role: "master" }),
        db.rpc("get_user_company_id", { _user_id: claims.sub }),
      ]);
      allowed = !!isMaster || (!!userCompany && userCompany === student.company_id);
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // Plano nutricional mais recente do aluno.
    const { data: plan } = await db
      .from("nutrition_plans")
      .select("id, name, plan_name, goal, target_calories, target_protein_g, target_carbs_g, target_fat_g, target_water_ml, context_dietary_restrictions, ai_rationale, meals, start_date, end_date")
      .eq("student_id", student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Anamnese (nº de refeições, horários, treino).
    const { data: anamnese } = await (db as any)
      .from("student_anamneses")
      .select("meals_per_day, food_restrictions, nutrition_context, has_nutritionist")
      .eq("student_id", student_id)
      .maybeSingle();

    const mealsPerDay = Number(anamnese?.meals_per_day) || 5;

    if (action === "save_external_plan") {
      const rawText = String(body?.raw_text || "").trim();
      if (rawText.length < 10) return json({ error: "Cole o cardápio do nutricionista antes de salvar." }, 400);

      const safeMeals = sanitizeMeals(parseExternalDietText(rawText, mealsPerDay));
      if (!safeMeals.length) return json({ error: "Não foi possível identificar refeições no cardápio informado." }, 422);

      const planId = (plan as any)?.id || crypto.randomUUID();
      const persistencePayload = {
        id: planId,
        company_id: student.company_id,
        student_id,
        name: "Cardápio do nutricionista",
        plan_name: "Cardápio do nutricionista",
        goal: (plan as any)?.goal || "acompanhamento_nutricionista",
        target_calories: (plan as any)?.target_calories ?? null,
        target_protein_g: (plan as any)?.target_protein_g ?? null,
        target_carbs_g: (plan as any)?.target_carbs_g ?? null,
        target_fat_g: (plan as any)?.target_fat_g ?? null,
        target_water_ml: (plan as any)?.target_water_ml ?? null,
        total_calories: (plan as any)?.target_calories ?? null,
        protein_g: (plan as any)?.target_protein_g ?? null,
        carbs_g: (plan as any)?.target_carbs_g ?? null,
        fat_g: (plan as any)?.target_fat_g ?? null,
        context_dietary_restrictions: anamnese?.food_restrictions ?? (plan as any)?.context_dietary_restrictions ?? null,
        meals: safeMeals,
        ai_rationale: "Cardápio informado pelo aluno a partir do acompanhamento com nutricionista.",
        observations: "Material organizado pelo app sem alterar a prescrição do nutricionista.",
        start_date: (plan as any)?.start_date ?? new Date().toISOString().slice(0, 10),
        end_date: (plan as any)?.end_date ?? null,
        status: "active",
      };

      const write = (plan as any)?.id
        ? await db.from("nutrition_plans").update(persistencePayload).eq("id", (plan as any).id).select("*").maybeSingle()
        : await db.from("nutrition_plans").insert(persistencePayload).select("*").maybeSingle();
      if (write.error) throw write.error;
      return json({ meals: safeMeals, cached: false, source: "nutritionist_upload", plan: write.data ?? persistencePayload });
    }

    if (!plan) return json({ error: "Nenhum plano nutricional encontrado" }, 404);

    // Idempotente: já tem refeições → devolve.
    if (Array.isArray((plan as any).meals) && (plan as any).meals.length > 0) {
      return json({ meals: (plan as any).meals, cached: true });
    }

    const restrictions = `${(plan as any).context_dietary_restrictions || ""} ${anamnese?.food_restrictions || ""}`.toLowerCase();
    const veg = /(vegetarian|vegan|vegano|vegetarian)/.test(restrictions);

    const userPrompt = `
Gere o PLANO DE REFEIÇÕES PRÁTICO do aluno. Individualize pela rotina.

METAS DO DIA: ${(plan as any).target_calories || "?"} kcal | Proteína ${(plan as any).target_protein_g || "?"}g | Carbo ${(plan as any).target_carbs_g || "?"}g | Gordura ${(plan as any).target_fat_g || "?"}g
OBJETIVO: ${(plan as any).goal || "manutenção"}
RESTRIÇÕES ALIMENTARES: ${clean((plan as any).context_dietary_restrictions || anamnese?.food_restrictions || "nenhuma")}
Nº DE REFEIÇÕES POR DIA: ${mealsPerDay}
ROTINA (horários das refeições, horário de treino, jejum, gostos/aversões):
${clean(anamnese?.nutrition_context || "Sem detalhes — use horários comuns (café ~7h, almoço ~12h30, pré-treino ~1h antes do treino, pós-treino logo após, jantar ~21h).")}

REGRAS:
- Crie exatamente ${mealsPerDay} refeições (use os horários da rotina; se não houver, distribua de forma realista).
- Posicione "Pré-treino" e "Pós-treino" em torno do horário de treino informado.
- Pré-treino: ENFATIZAR CARBOIDRATO (arroz branco, batata, fruta, pão branco) e POUCA gordura/fibra/proteína.
- Pós-treino: proteína + carboidrato. Almoço/Jantar: proteína + vegetais + carboidrato.
- Exemplos de alimentos PRÁTICOS do dia a dia brasileiro.
- RESPEITE as restrições: ${veg ? "VEGETARIANO/VEGANO — NÃO use carne, frango nem peixe; use tofu, leguminosas, ovos/laticínios (se permitido)." : "sem restrição declarada de carne."}
- Ajuste o tamanho das porções ao objetivo (hipertrofia = mais; emagrecimento = moderado). Sem gramas exatas.

Retorne APENAS JSON válido, sem texto extra:
{ "meals": [ { "meal": "Almoço", "time": "12:30", "focus": "Proteína + vegetais", "eat": ["...","..."], "go_easy": ["..."], "note": "opcional" } ] }
`.trim();

    let meals: any[] | null = null;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 45000);
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system: "Você é um nutricionista esportivo. Gere orientações práticas por refeição (não cardápio fechado, sem gramas exatas). Responda só JSON válido.",
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      clearTimeout(t);
      if (resp.ok) {
        const data = await resp.json();
        const raw = data.content?.[0]?.text ?? "";
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        if (Array.isArray(parsed?.meals)) meals = parsed.meals;
      } else {
        console.warn("ai-nutrition-meals: anthropic non-2xx", resp.status, (await resp.text().catch(() => "")).slice(0, 200));
      }
    } catch (e) {
      console.warn("ai-nutrition-meals: anthropic error", e instanceof Error ? e.message : String(e));
    }

    if (!meals || meals.length === 0) {
      meals = fallbackMeals({ mealsPerDay, veg, goal: (plan as any).goal || "" });
    }

    // Sanitiza e grava.
    const safeMeals = sanitizeMeals(meals);

    await db.from("nutrition_plans").update({ meals: safeMeals }).eq("id", (plan as any).id);
    return json({ meals: safeMeals, cached: false });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
