import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertBundleAccess, assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";
import { requireCompanyFeature } from "../_shared/company-feature-entitlements.ts";
import { buildNutritionProgram, assertNutritionPlanComplete } from "../_shared/nutrition/nutritionEngine.ts";
import { businessDateYmd } from "../_shared/business-date.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("ANTHROPIC_MODEL_FAST") || Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const clean = (s: string) => (s || "").replace(/[^\x20-\x7E\u00C0-\u017F]/g, "");
const textValue = (v: any) => typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
const compactJson = (value: unknown, maxLength = 10000) => JSON.stringify(value ?? {}, null, 2).slice(0, maxLength);

interface CompanyAiConfig {
  assistant_name: string;
  consultancy_name: string | null;
  methodology: string | null;
  plans_payment: string | null;
  tone: string | null;
  onboarding_completed: boolean;
  owner_credentials: string | null;
  niche_audience: string | null;
  exercise_preferences: string | null;
  progression_model: string | null;
  assessment_protocol: string | null;
  red_lines: string | null;
  communication_style: string | null;
  nutrition_scope: string | null;
  ethical_limits: string | null;
}

const BN_AI_CONFIG: CompanyAiConfig = {
  assistant_name: "BNITO",
  consultancy_name: "BN Performance Training",
  methodology: null,
  plans_payment: null,
  tone: null,
  onboarding_completed: false,
  owner_credentials: null,
  niche_audience: null,
  exercise_preferences: null,
  progression_model: null,
  assessment_protocol: null,
  red_lines: null,
  communication_style: null,
  nutrition_scope: null,
  ethical_limits: null,
};

async function loadCompanyAiConfig(supabase: any, companyId: string | null | undefined): Promise<CompanyAiConfig> {
  if (!companyId) return BN_AI_CONFIG;
  const { data } = await supabase
    .from("company_ai_config")
    .select("assistant_name, consultancy_name, methodology, plans_payment, tone, onboarding_completed, owner_credentials, niche_audience, exercise_preferences, progression_model, assessment_protocol, red_lines, communication_style, nutrition_scope, ethical_limits")
    .eq("company_id", companyId)
    .maybeSingle();
  return data ? { ...BN_AI_CONFIG, ...data } : BN_AI_CONFIG;
}

function companyAiSystem(config: CompanyAiConfig) {
  return `
CONFIGURACAO WHITE-LABEL DA EMPRESA:
- Nome da IA: ${clean(config.assistant_name || "BNITO")}
- Consultoria/app: ${clean(config.consultancy_name || "BN Performance Training")}
- Tom: ${clean(config.tone || "tecnico, humano, claro e seguro")}
- Credenciais/voz do dono: ${config.owner_credentials ? clean(config.owner_credentials).slice(0, 2000) : "Nao informado; nao inventar autoridade."}
- Publico/nicho atendido: ${config.niche_audience ? clean(config.niche_audience).slice(0, 2000) : "Nao informado; usar contexto real do aluno."}
- Metodologia proprietaria: ${config.methodology ? clean(config.methodology).slice(0, 4000) : "Usar Metodologia BN como fallback."}
- Preferencias de treino/exercicios: ${config.exercise_preferences ? clean(config.exercise_preferences).slice(0, 1500) : "Usar apenas como contexto de rotina e gasto/recuperacao."}
- Modelo de progressao: ${config.progression_model ? clean(config.progression_model).slice(0, 1500) : "Sincronizar com ciclos BN quando houver treino no contexto."}
- Protocolo de avaliacao: ${config.assessment_protocol ? clean(config.assessment_protocol).slice(0, 1500) : "Usar somente como contexto funcional recebido."}
- Linhas vermelhas da empresa: ${config.red_lines ? clean(config.red_lines).slice(0, 2500) : "Seguir linhas vermelhas BN e limites clinicos."}
- Estilo de comunicacao: ${config.communication_style ? clean(config.communication_style).slice(0, 1500) : "Tecnico, humano, claro e seguro."}
- Escopo nutricional: ${config.nutrition_scope ? clean(config.nutrition_scope).slice(0, 3000) : "Orientacoes gerais; nao prescrever dieta clinica fechada."}
- Limites eticos: ${config.ethical_limits ? clean(config.ethical_limits).slice(0, 2500) : "Nao diagnosticar, nao tratar doenca, nao prometer resultado e nao ultrapassar escopo profissional."}
- Planos/pagamento/contexto comercial: ${config.plans_payment ? clean(config.plans_payment).slice(0, 2500) : "Nao informado; nao inventar."}

Use essa configuracao para nomes, tom, escopo nutricional e contexto. Para nutricao, preserve seguranca, evidencias, restricoes clinicas e limites eticos; nao prometa tratamento nem dieta fechada quando a regra pedir orientacoes.
`.trim();
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supa.auth.getClaims(token);
  if (error || !data?.claims) return null;
  return data.claims;
}

function createUserClient(req: Request) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

function fallbackNutritionPlan(input: any, rawText = "") {
  const weight = Number(input.weight_kg) || 75;
  const obj = String(input.objective || "").toLowerCase();
  // T3 — endurance: por flag explícita ou pela modalidade/objetivo.
  const endurance = input.is_endurance_athlete === true ||
    /endurance|corrida|run|triat|maraton|ciclis|nata[cç]/.test(`${obj} ${String(input.training_modality || "").toLowerCase()}`);
  // T4 — kcal por OBJETIVO; endurance/performance puxam energia e carbo pra cima.
  const targetKcal = obj.includes("emagre")
    ? 2200
    : (endurance || obj.includes("perform") || obj.includes("ganho") || obj.includes("hipert")) ? 3000 : 2800;
  const carbsPerKg = endurance ? 5.5 : 3.5;
  const plan: any = {
    plan_name: "Dicas Nutricionais BN",
    energy_summary: {
      target_kcal: targetKcal,
      protein_total_g: Math.round(weight * (endurance ? 1.8 : 2)),
      carbs_total_g: Math.round(weight * carbsPerKg),
      fat_total_g: Math.round(weight * 0.9),
    },
    nutrition_tips: [
      {
        title: "Pré-treino",
        timing: "60 a 120 minutos antes",
        goal: "Chegar ao treino com energia sem pesar o estômago.",
        how_much: "Uma porção moderada de carboidrato e uma pequena porção de proteína; pouca gordura e pouca fibra se o treino for intenso.",
        examples: ["banana com iogurte", "pão ou tapioca com ovos", "arroz ou batata com frango em porção leve"],
      },
      {
        title: "Pós-treino",
        timing: "Até 2 horas depois",
        goal: "Repor energia, apoiar recuperação muscular e controlar fome.",
        how_much: "Uma refeição completa com proteína em boa quantidade, carboidrato proporcional ao treino e legumes/salada.",
        examples: ["arroz, feijão, frango e salada", "omelete com batata", "iogurte ou whey com fruta quando precisar de algo prático"],
      },
      {
        title: "Antes de dormir",
        timing: "30 a 90 minutos antes",
        goal: "Evitar acordar com fome e favorecer recuperação sem atrapalhar o sono.",
        how_much: "Algo leve, com proteína e pouca gordura; evite refeição grande se deita logo depois.",
        examples: ["iogurte", "ovos", "queijo branco", "whey ou proteína com fruta pequena"],
      },
      {
        title: "Dias de descanso",
        timing: "Ao longo do dia",
        goal: "Manter proteína e reduzir um pouco carboidratos se o gasto for menor.",
        how_much: "Mantenha proteínas nas refeições e ajuste carboidrato para porções menores que nos dias de treino pesado.",
        examples: ["priorizar carnes magras, ovos, legumes, saladas, frutas e carboidratos em porções menores"],
      },
    ],
    carb_cycling: "Aumentar carboidratos nos dias de treino mais intenso e reduzir levemente nos dias de descanso.",
    periodized_blocks: [
      {
        weeks: "1-2",
        training_load: "base",
        nutrition_focus: "regularidade, hidratacao e proteina diaria",
        carb_strategy: "carboidrato moderado nos dias de treino e menor nos descansos",
        recovery_priority: "sono, agua e refeicao pos-treino completa",
      },
      {
        weeks: "3-4",
        training_load: "progressao",
        nutrition_focus: "carb cycling simples acompanhando os dias mais pesados",
        carb_strategy: "mais carboidrato antes/depois de MMII, tiros ou longo",
        recovery_priority: "eletrólitos se houver suor alto e lanches praticos",
      },
      {
        weeks: "5-6",
        training_load: "consolidacao",
        nutrition_focus: "refinar timing e evitar queda de energia no fechamento do ciclo",
        carb_strategy: "manter carboidrato nos dias-chave e reduzir em deload/descanso",
        recovery_priority: "digestao, hidratação e feedback para o proximo ciclo",
      },
    ],
    general_notes: rawText
      ? `A IA retornou resposta parcial. Use este plano base e revise. Prévia: ${clean(rawText).slice(0, 500)}`
      : "Plano base gerado para continuidade. Revisar preferências, restrições e rotina do aluno.",
  };
  // T3 — restrições de endurance: CHO obrigatório, sem déficit agressivo nem jejum longo em volume.
  if (endurance) {
    plan.endurance_constraints =
      "Carboidrato é prioridade (4-7 g/kg/dia, até 8+ em volume alto). NÃO usar déficit agressivo (>15%) nem jejum prolongado (>12h) em fase de volume — comprometem performance e recuperação. Repor CHO e eletrólitos em treinos longos/intensos.";
    plan.nutrition_tips = [
      {
        title: "Durante treinos longos",
        timing: "A cada 45 a 60 minutos",
        goal: "Manter a glicemia e a performance em sessões acima de ~75 min.",
        how_much: "30 a 60 g de carboidrato por hora (bebida, gel ou fruta) + água e eletrólitos.",
        examples: ["bebida de carboidrato", "gel de carboidrato", "banana"],
      },
      ...plan.nutrition_tips,
    ];
  }
  return plan;
}

function normalizeNutritionPlan(plan: any, input: any, rawText = "") {
  if (!plan || typeof plan !== "object") return fallbackNutritionPlan(input, rawText);
  const fallback = fallbackNutritionPlan(input, rawText);
  if (!plan.nutrition_tips) {
    plan.nutrition_tips = plan.tips || plan.orientacoes || fallback.nutrition_tips;
  }
  if (!plan.meals && plan.daily_meals) {
    plan.meals = plan.daily_meals.map((m: any) => ({
      name: m.name || m.meal_name,
      time: m.time,
      foods: m.foods || [],
      macros: m.macros,
    }));
  }
  delete plan.daily_meals;
  if (!plan.energy_summary) plan.energy_summary = fallback.energy_summary;
  if (!plan.carb_cycling) plan.carb_cycling = fallback.carb_cycling;
  if (!plan.periodized_blocks) plan.periodized_blocks = fallback.periodized_blocks;
  return plan;
}

// ─── SYSTEM PROMPT — METODOLOGIA BN NUTRI ────────────────────────────────────
const SYSTEM_PROMPT = `
Você é o Expert de BN Nutri da BN Performance Training.
Seu papel é prescrever planos alimentares e suplementação esportiva em perfeita
sinergia metabólica e fisiológica com o volume de treinos do atleta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILOSOFIA BN NUTRI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sinergia Metabólica: calorias e macros oscilam estrategicamente conforme o gasto
energético de cada dia da periodização (CARB CYCLING baseado na carga de treino).
Adesão Realista: orientações adaptadas à realidade brasileira, acessíveis, com alimentos
práticos e substituições fáceis. Considerar rotina, logística e orçamento do atleta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CÁLCULOS OBRIGATÓRIOS — SEMPRE MOSTRAR OS VALORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. TMB — HARRIS-BENEDICT REVISADA:
   Homens: TMB = 88,362 + (13,397 × peso_kg) + (4,799 × altura_cm) - (5,677 × idade)
   Mulheres: TMB = 447,593 + (9,247 × peso_kg) + (3,098 × altura_cm) - (4,330 × idade)

   SE % gordura corporal disponível — usar KATCH-McARDLE (mais precisa):
   Massa Magra (kg) = peso_total × (1 - %gordura/100)
   TMB = 370 + (21,6 × Massa Magra)

2. GET — GASTO ENERGÉTICO TOTAL:
   GET = TMB × Fator de Atividade + Custo de Treino

   FATORES DE ATIVIDADE:
   Sedentário (< 2x/semana):     × 1,2
   Levemente ativo (2-3x/semana): × 1,375
   Moderadamente ativo (4-5x):   × 1,55
   Muito ativo (6-7x):           × 1,725
   Extremamente ativo (2x/dia):  × 1,9

   CUSTO DE TREINO (kcal/hora estimado por modalidade):
   Musculação intensa: 400-500 kcal/h
   Corrida Z2: 600-800 kcal/h
   Corrida Z4-Z5: 800-1000 kcal/h
   Ciclismo Z2: 500-700 kcal/h
   Natação: 500-700 kcal/h
   Triathlon treino duplo: somar as modalidades

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIS DE MACROS — DISTRIBUIÇÃO POR OBJETIVO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PERFIL EMAGRECIMENTO / ESTÉTICA:
  Déficit calórico: -15 a -25% do GET
  Proteínas:    1,8 a 2,4 g/kg/dia
  Carboidratos: 2,0 a 4,0 g/kg/dia (foco no peri-treino)
  Gorduras:     0,8 a 1,0 g/kg/dia
  Estratégia: concentrar CHO no pré, intra e pós-treino. Reduzir CHO no descanso.

PERFIL PERFORMANCE / HIPERTROFIA:
  Superávit calórico leve: +5 a +15% do GET (ou manutenção)
  Proteínas:    1,6 a 2,2 g/kg/dia
  Carboidratos: 4,0 a 7,0 g/kg/dia (até 8,0+ para alto volume endurance)
  Gorduras:     0,8 a 1,2 g/kg/dia

ATLETA DE ENDURANCE (corrida/triathlon/ciclismo) + FORÇA:
  Semanas de alto volume aeróbico: carboidratos até 8g/kg/dia
  Proteínas: 1,8-2,2g/kg (manter síntese muscular apesar do catabolismo aeróbico)
  Não sacrificar CHO — endurance exige substrato glicídico para performance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CARB CYCLING — PERIODIZAÇÃO DE CARBOIDRATOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dias de volume alto / treino duplo:
→ CHO no limite superior do perfil
→ Suplementação intra-treino se sessão > 75min: 30-90g de CHO/hora

Dias de treino moderado (Z2 ou musculação):
→ CHO na faixa média do perfil

Dias de descanso / deload:
→ CHO reduzido para 2,0-3,0 g/kg/dia
→ Manter proteínas elevadas para regeneração tecidual
→ Gorduras podem subir levemente (saúde hormonal)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HIDRATAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Alvo diário: peso_kg × 35 a 40 ml
Extra por hora de exercício: +500 a 750ml (corrida/bike) ou +400ml (musculação)
Para atletas com suor abundante: adicionar eletrólitos (sódio 500-1000mg/hora)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LINHAS VERMELHAS — INEGOCIÁVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESTRIÇÃO CALÓRICA EXTREMA:
  PROIBIDO prescrever < 1200 kcal/dia para mulheres
  PROIBIDO prescrever < 1500 kcal/dia para homens
  Em qualquer cenário de emagrecimento, respeitar esses pisos absolutos

ENDURANCE + RESTRIÇÃO INCOMPAT ÍVEL:
  PROIBIDO jejum prolongado (> 16h) para atletas de corrida/triathlon em fase acumulativa
  PROIBIDO low-carb extremo ou cetogênica para endurance em volume alto
  CHO é substrato obrigatório para manutenção da performance aeróbica

ESTRESSE / SONO:
  Se estresse ≥ 8/10 OU qualidade do sono < 5/10:
  → Cafeína máxima: 200mg/dia
  → PROIBIDA cafeína após 14:00
  → Priorizar magnésio, ashwagandha, camomila (se relatado pelo atleta)

SEGURANÇA GI PRÉ-CORRIDA:
  Nas 2h antes de corrida de média/alta intensidade ou prova:
  → Evitar alimentos ricos em FODMAPs (feijão, brócolis, couve, leite)
  → Evitar fibras insolúveis (farinha integral, linhaça, aveia grossa)
  → Priorizar: banana, pão branco, arroz branco, whey, maltodextrina

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPLEMENTAÇÃO BASEADA EM EVIDÊNCIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creatina monohidratada: 3-5g/dia (todo dia, horário não crítico)
  → Indicada para: força, hipertrofia, sprint/potência
  → Não indicada para: perda de peso puro (retém água intramuscular)

Whey Protein: 25-35g no pós-treino
  → Quando a meta proteica não for atingida pela dieta
  → Preferir isolada para intolerantes à lactose

Carboidrato intra-treino (maltodextrina/dextrose/isotônico):
  → Sessões > 75 min: 30-60g/hora
  → Sessões > 90 min (corrida/bike): 60-90g/hora
  → Fórmula: 2:1 maltodextrina:frutose para máxima absorção (> 60min)

Cafeína: 3-6 mg/kg, 30-60 min antes do treino
  → Limitada a 14:00 se estresse/insônia
  → Não usar em deload ou dias de descanso (tolerância)

Vitamina D + Ômega-3: base para atletas de alto volume
  → Vit D: 2000-4000 UI/dia (ajustar conforme exame)
  → Ômega-3: 2-4g/dia EPA+DHA (anti-inflamatório, saúde cardiovascular)

Beta-alanina (opcional para endurance):
  → 3,2-6,4g/dia (dividido para reduzir parestesia)
  → Benefício em esforços de 1-4 minutos (Z4-Z5)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÃO DE SAÍDA — APENAS JSON VÁLIDO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "plan_name": "Dicas Nutricionais BN — [objetivo] | [nome]",
  "energy_summary": {
    "tmb_kcal": N,
    "get_kcal": N,
    "target_kcal": N,
    "deficit_surplus_percent": N,
    "protein_g_per_kg": N,
    "protein_total_g": N,
    "carbs_g_per_kg": N,
    "carbs_total_g": N,
    "fat_g_per_kg": N,
    "fat_total_g": N,
    "hydration_ml": N,
    "formula_used": "harris_benedict | katch_mcArdle",
    "calculation_notes": "mostrar os cálculos realizados"
  },
  "carb_cycling": {
    "high_day_kcal": N,
    "high_day_carbs_g": N,
    "moderate_day_kcal": N,
    "moderate_day_carbs_g": N,
    "rest_day_kcal": N,
    "rest_day_carbs_g": N
  },
  "nutrition_tips": [
    {
      "title": "Pré-treino",
      "timing": "60 a 120 minutos antes",
      "goal": "energia para treinar sem desconforto gastrointestinal",
      "how_much": "orientação aproximada, sem gramas exatas, sobre tamanho da porção",
      "examples": ["2 a 4 exemplos de combinações de alimentos brasileiros"],
      "avoid": ["o que evitar nesse momento, se aplicável"]
    }
  ],
  "supplementation": [
    {
      "supplement": "Creatina monohidratada",
      "dose": "5g",
      "timing": "Qualquer horário, diariamente",
      "reason": "Força, hipertrofia, recuperação"
    }
  ],
  "substitutions": [
    {
      "original": "Arroz branco (carboidrato complexo)",
      "alternatives": ["Batata doce", "Macarrão integral", "Mandioca", "Cuscuz"]
    }
  ],
  "pre_race_gi_protocol": "Protocolo pré-prova/corrida longa: o que comer nas 2-4h antes",
  "intra_workout_protocol": "Estratégia de carboidrato e hidratação intra-treino",
  "rest_day_adjustments": "Como ajustar a alimentação nos dias de descanso (carb cycling)",
  "periodized_blocks": [
    {
      "weeks": "1-2",
      "training_load": "base | progressao | consolidacao",
      "nutrition_focus": "foco nutricional do bloco",
      "carb_strategy": "como ajustar carboidratos neste bloco",
      "recovery_priority": "hidratação, sono, proteína, timing ou GI"
    }
  ],
  "general_notes": "Orientações gerais sobre timing de refeições, sono, estresse. Não montar cardápio fechado e não usar quantidades exatas em gramas.",
  "warnings": ["alertas baseados nas linhas vermelhas verificadas"]
}
`.trim();

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Fallback-first: o plano é determinístico e NÃO depende de ANTHROPIC_API_KEY (sem mais 503).
  const claims = await requireUser(req);
  if (!claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const input = await req.json();
    const {
      student_id, student_name, company_id,
      age, gender, weight_kg, height_cm,
      body_fat_percent,      // pode ser null — usa Harris-Benedict se null
      objective,             // "emagrecimento" | "hipertrofia" | "performance"
      activity_level,        // "sedentario" | "leve" | "moderado" | "muito_ativo" | "extremo"
      is_endurance_athlete,  // true/false
      training_hours_per_day, // horas de treino por dia
      training_modality,     // "corrida" | "musculacao" | "triathlon" | etc.
      meals_per_day,         // 4 | 5 | 6
      food_restrictions,     // intolerâncias, alergias, preferências
      stress_score,          // 0-10
      sleep_quality,         // 0-10
      budget,                // "economico" | "moderado" | "premium"
      has_microwave,         // true/false
      running_plan_context,  // JSON do plano de corrida (para calcular gasto cíclico)
      strength_plan_context, // JSON do plano de força (sessões/semana, duração, kcal estimado)
      nutrition_context,     // texto: horários das refeições/treino, jejum, apetite, gostos/aversões
      anamnese_context,      // JSON bruto/resumido da anamnese
      prescription_integration, // resultado integrado anamnese + avaliação
      bnito_orchestration, // contrato do BNITO para sincronizar agentes
      anamnese_id,
      bundle_id,
      training_cycle_id,
      previous_plan_id,
      previous_plan_context,
      program_sequence,
    } = input;

    const authz = await assertTenantAccess(supabase, claims, {
      companyId: company_id,
      studentId: student_id,
      requireStaff: true,
    });
    const authorizedCompanyId = authz.companyId;
    await requireCompanyFeature(supabase, authorizedCompanyId, "hasPrescription");
    const authorizedBundleId = await assertBundleAccess(supabase, bundle_id, authorizedCompanyId, student_id);
    let cycleContext: any = null;
    if (training_cycle_id != null && training_cycle_id !== "") {
      if (!isUuid(training_cycle_id)) throw new HttpError(400, "training_cycle_id inválido.");
      const { data: cycle, error: cycleError } = await supabase.from("training_cycles")
        .select("id, student_id, company_id, cycle_number, start_date, end_date")
        .eq("id", training_cycle_id).maybeSingle();
      if (cycleError) throw new HttpError(500, `Falha ao validar ciclo: ${cycleError.message}`);
      if (!cycle || cycle.student_id !== student_id || cycle.company_id !== authorizedCompanyId) {
        throw new HttpError(403, "Forbidden: training cycle mismatch.");
      }
      cycleContext = cycle;
    }
    let authorizedPreviousPlanId: string | null = null;
    let effectivePreviousPlan = previous_plan_context ?? null;
    if (previous_plan_id != null && previous_plan_id !== "") {
      if (!isUuid(previous_plan_id)) throw new HttpError(400, "previous_plan_id inválido.");
      const { data: previous, error: previousError } = await supabase.from("nutrition_plans")
        .select("id, plan_name, goal, target_calories, target_protein_g, target_carbs_g, target_fat_g, meals")
        .eq("id", previous_plan_id).eq("student_id", student_id).eq("company_id", authorizedCompanyId).maybeSingle();
      if (previousError) throw new HttpError(500, `Falha ao carregar plano anterior: ${previousError.message}`);
      if (!previous) throw new HttpError(403, "Forbidden: previous plan mismatch.");
      authorizedPreviousPlanId = previous.id;
      effectivePreviousPlan = previous;
    }
    input.previous_plan_context = effectivePreviousPlan;
    input.block_number = cycleContext?.cycle_number ?? input.block_number ?? 1;
    input.program_sequence = {
      ...(program_sequence && typeof program_sequence === "object" ? program_sequence : {}),
      sequence_number: cycleContext?.cycle_number ?? program_sequence?.sequence_number ?? input.block_number,
      start_date: cycleContext?.start_date ?? program_sequence?.start_date ?? null,
      end_date: cycleContext?.end_date ?? program_sequence?.end_date ?? null,
    };
    const aiConfig = await loadCompanyAiConfig(supabase, authorizedCompanyId);

    const athleteContext = `
DADOS DO ATLETA:
Nome: ${clean(student_name || "não informado")}
Idade: ${age} anos | Sexo: ${gender} | Peso: ${weight_kg}kg | Altura: ${height_cm}cm
% Gordura corporal: ${body_fat_percent || "não disponível (usar Harris-Benedict)"}
Objetivo: ${clean(objective)}
Nível de atividade: ${clean(activity_level)}
É atleta de endurance: ${is_endurance_athlete ? "SIM" : "NÃO"}
Horas de treino/dia: ${training_hours_per_day || "1-1,5"}
Modalidade principal: ${clean(training_modality || "não informada")}
Refeições por dia desejadas: ${meals_per_day || 5}
Restrições alimentares: ${clean(food_restrictions || "nenhuma")}
Nível de estresse: ${stress_score || "não informado"}/10
Qualidade do sono: ${sleep_quality || "não informado"}/10
Orçamento alimentar: ${clean(budget || "moderado")}
Tem micro-ondas/cozinha: ${has_microwave ? "SIM" : "NÃO — preferir orientações sem preparo complexo"}

RESULTADO INTEGRADO ANAMNESE + AVALIAÇÃO (PRIORIDADE MÁXIMA):
${prescription_integration
  ? compactJson(prescription_integration, 9000)
  : "Sem resultado integrado — usar dados nutricionais e carga de treino separadamente."}

ORQUESTRAÇÃO BNITO — CONTRATO ENTRE AGENTES:
${bnito_orchestration
  ? compactJson(bnito_orchestration, 9000)
  : "Sem orquestracao explicita — ainda assim organizar orientacoes para 6 semanas em 3 blocos de 2 semanas."}

ANAMNESE E CONTEXTO CLÍNICO/ROTINA:
${anamnese_context ? compactJson(anamnese_context, 6000) : "Sem anamnese estruturada adicional."}

CONTEXTO DO PLANO DE CORRIDA (para sincronizar carga):
${running_plan_context ? JSON.stringify(running_plan_context).slice(0, 1000) : "Sem plano de corrida — usar apenas nível de atividade geral"}

CONTEXTO DO PLANO DE FORÇA (somar ao gasto energético total nos dias de treino):
${strength_plan_context ? JSON.stringify(strength_plan_context).slice(0, 600) : "Sem treino de força concomitante."}
→ Some o custo calórico da musculação ao GET nos dias de força e ajuste o carb cycling.

ROTINA ALIMENTAR E DE TREINO (use para dar TIMING específico):
${nutrition_context ? clean(nutrition_context) : "Sem detalhes de horários/preferências — usar orientações gerais por momento."}

INSTRUÇÕES:
1. Calcule TMB (mostrar fórmula e valores calculados)
2. Calcule GET (fator de atividade + custo de treino)
3. Defina calorias alvo com base no objetivo
4. Distribua macros conforme perfil e carb cycling
5. Sincronize as orientações com EXATAMENTE 6 semanas: semanas 1-2, 3-4 e 5-6.
6. Cada bloco de 2 semanas deve ter foco nutricional coerente com a carga: base, progressao e consolidacao/deload.
7. NÃO monte cardápio fechado. Gere ORIENTAÇÕES por momento (pré-treino, pós-treino, antes de dormir, dias de descanso, hidratação, treinos longos).
8. TIMING ESPECÍFICO: use os horários das refeições e o horário/jejum de treino para orientar o que priorizar na refeição mais próxima do treino, se cabe um lanche pré ~30-60 min antes (conforme a janela e o apetite informado), como tratar o pós-treino em função da próxima refeição, e o intervalo até dormir. Respeite o apetite (ao acordar/antes/depois) ao sugerir forma e volume (sólido x líquido, leve x completo).
9. SUBSTITUIÇÕES: em cada dica e no campo "substitutions", ofereça 2-3 trocas usando SÓ alimentos que o aluno gosta; NUNCA inclua os que ele rejeitou.
10. Use porções aproximadas e linguagem prática ("um punhado", "uma porção de", "um pão"), sem gramas/calorias exatas no nível da refeição. Você NÃO substitui nutricionista; havendo condição clínica ou red flag, oriente procurar profissional com CRN.
11. Verifique TODAS as linhas vermelhas antes de prescrever; se o resultado integrado apontar baixa recuperação, dor ou red/yellow flags, reduza agressividade do déficit/superávit e destaque acompanhamento profissional.
12. Retorne APENAS o JSON, sem texto adicional.
13. Seja compacto: 4 a 6 dicas nutricionais, até 4 suplementos, até 5 substituições e frases curtas.
14. Priorize JSON válido completo; não escreva cardápio fechado nem explicações longas.
    `.trim();

    // GERAÇÃO DETERMINÍSTICA (fallback-first): plano BN Nutri completo e enviável SEM IA/crédito.
    // Mifflin-St Jeor (Katch se %gordura), GET por atividade, macros por objetivo, carb cycling,
    // hidratação, pisos de segurança e refeições — tudo em código (nutritionEngine.ts). A IA fica
    // como refino de TEXTO opcional, desligado por padrão e nunca alterando estrutura.
    const planJson: any = buildNutritionProgram(input);
    planJson.enrichment = { status: "deterministic_only" };
    void athleteContext; // contexto mantido p/ futura camada de refino por IA
    if (prescription_integration) {
      planJson.prescription_integration = {
        readiness: prescription_integration.readiness ?? null,
        coach_summary: prescription_integration.coach_summary ?? null,
        risk_screening: prescription_integration.risk_screening ?? null,
      };
    }
    if (bnito_orchestration) {
      planJson.bnito_orchestration = {
        duration_weeks: bnito_orchestration.duration_weeks ?? 6,
        block_length_weeks: bnito_orchestration.block_length_weeks ?? 2,
        blocks: bnito_orchestration.blocks ?? null,
        synchronization_rules: bnito_orchestration.synchronization_rules ?? null,
      };
    }

    // Invariante: nunca persistir plano sem energia/macros/refeições.
    assertNutritionPlanComplete(planJson);

    // Salva no banco
    const { data: existingCyclePlan } = cycleContext
      ? await supabase.from("nutrition_plans").select("id").eq("training_cycle_id", cycleContext.id).maybeSingle()
      : { data: null };
    const planId = existingCyclePlan?.id || crypto.randomUUID();
    // Schema LIVE de nutrition_plans (studio): name(NOT NULL)/goal/target_*/total_*/meals.
    const persistencePayload = {
      id: planId,
      company_id: authorizedCompanyId, student_id,
      name: planJson.plan_name,
      plan_name: planJson.plan_name,
      goal: objective,
      target_calories: planJson.total_calories,
      target_protein_g: planJson.protein_g,
      target_carbs_g: planJson.carbs_g,
      target_fat_g: planJson.fat_g,
      target_water_ml: planJson.energy_summary?.hydration_ml ?? null,
      total_calories: planJson.total_calories,
      protein_g: planJson.protein_g,
      carbs_g: planJson.carbs_g,
      fat_g: planJson.fat_g,
      context_weight_kg: weight_kg ?? null,
      context_body_fat_pct: body_fat_percent ?? null,
      context_activity_level: activity_level ?? null,
      context_dietary_restrictions: textValue(food_restrictions),
      meals: planJson.meals,
      ai_rationale: textValue(planJson.general_notes),
      observations: textValue(planJson.general_notes),
      anamnese_id,
      bundle_id: authorizedBundleId,
      training_cycle_id: cycleContext?.id ?? null,
      previous_plan_id: authorizedPreviousPlanId,
      sequence_number: planJson.program_sequence?.sequence_number ?? 1,
      sequence_phase: planJson.program_sequence?.phase ?? null,
      start_date: cycleContext?.start_date ?? businessDateYmd(),
      end_date: cycleContext?.end_date ?? null,
      status: cycleContext && cycleContext.start_date > businessDateYmd() ? "scheduled" : "active",
    };
    if (existingCyclePlan?.id) {
      await supabase.from("nutrition_plans").update(persistencePayload).eq("id", existingCyclePlan.id).throwOnError();
    } else {
      await supabase.from("nutrition_plans").insert(persistencePayload).throwOnError();
    }

    return new Response(
      JSON.stringify({ id: planId, plan: planJson }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return new Response(
      JSON.stringify({ error: message }),
      { status: e instanceof HttpError ? e.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
