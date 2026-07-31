import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertBundleAccess, assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";
import { buildCardioProgram, assertCardioPlanComplete, normalizeCardioSport } from "../_shared/prescription/cardio/cardioEngine.ts";
import { businessDateYmd } from "../_shared/business-date.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5-20250929";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const clean = (s: string) => (s || "").replace(/[^\x20-\x7E\u00C0-\u017F]/g, "");
const textValue = (v: any) => typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
const compactJson = (value: unknown, maxLength = 10000) => JSON.stringify(value ?? {}, null, 2).slice(0, maxLength);
const PAIN_REGIONS = ["tornozelo", "joelho", "quadril", "lombar", "ombro"] as const;

function deriveEva(input: Record<string, any>): Record<string, number> {
  const result: Record<string, number> = {};
  if (input.eva && typeof input.eva === "object") {
    for (const [region, value] of Object.entries(input.eva)) {
      const score = Number(value);
      if (Number.isFinite(score)) result[region] = Math.max(0, Math.min(10, score));
    }
  }
  const corpus = JSON.stringify([
    input.injuries,
    input.anamnese_context?.injuries,
    input.anamnese_context?.notes,
    input.prescription_integration?.risk_screening,
  ]).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const region of PAIN_REGIONS) {
    const match = corpus.match(new RegExp(`${region}[^0-9]{0,24}(10|[0-9])`));
    if (match) result[region] = Math.max(result[region] || 0, Number(match[1]));
  }
  const screening = input.prescription_integration?.risk_screening;
  const painRegions = Array.isArray(screening?.pain_regions) ? screening.pain_regions : [];
  const hasRedFlag = Array.isArray(screening?.red_flags) && screening.red_flags.length > 0;
  for (const rawRegion of painRegions) {
    const region = String(rawRegion).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (PAIN_REGIONS.includes(region as typeof PAIN_REGIONS[number]) && result[region] == null) {
      result[region] = hasRedFlag ? 5 : 3;
    }
  }
  return result;
}

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
- Tom: ${clean(config.tone || "tecnico, objetivo, humano e seguro")}
- Credenciais/voz do dono: ${config.owner_credentials ? clean(config.owner_credentials).slice(0, 2000) : "Nao informado; nao inventar autoridade."}
- Publico/nicho atendido: ${config.niche_audience ? clean(config.niche_audience).slice(0, 2000) : "Nao informado; usar contexto real do aluno/atleta."}
- Metodologia proprietaria: ${config.methodology ? clean(config.methodology).slice(0, 4000) : "Usar Metodologia BN como fallback."}
- Preferencias de exercicios/treino: ${config.exercise_preferences ? clean(config.exercise_preferences).slice(0, 2000) : "Integrar corrida e musculacao de forma conservadora."}
- Modelo de progressao: ${config.progression_model ? clean(config.progression_model).slice(0, 2500) : "Progressao BN de 6 semanas, respeitando carga aerobica e recuperacao."}
- Protocolo de avaliacao: ${config.assessment_protocol ? clean(config.assessment_protocol).slice(0, 2000) : "Usar avaliacao funcional como contexto para risco/limitacoes."}
- Linhas vermelhas da empresa: ${config.red_lines ? clean(config.red_lines).slice(0, 2500) : "Seguir linhas vermelhas BN de dor, sobrecarga e seguranca."}
- Estilo de comunicacao: ${config.communication_style ? clean(config.communication_style).slice(0, 1500) : "Tecnico, objetivo, humano e seguro."}
- Escopo nutricional: ${config.nutrition_scope ? clean(config.nutrition_scope).slice(0, 1500) : "Nao prescrever nutricao; apenas considerar recuperacao/energia quando houver contexto."}
- Limites eticos: ${config.ethical_limits ? clean(config.ethical_limits).slice(0, 2500) : "Nao diagnosticar, nao prometer resultado e nao ultrapassar escopo profissional."}
- Planos/pagamento/contexto comercial: ${config.plans_payment ? clean(config.plans_payment).slice(0, 2500) : "Nao informado; nao inventar."}

Use essa configuracao para nomes, tom, progressao e contexto. Para corrida/endurance, preserve linhas vermelhas de dor, TSB, progressao, limites eticos e seguranca mesmo que a metodologia configurada seja agressiva.
`.trim();
}

function fallbackCardioPlan(input: any, rawText = "") {
  const sport = input.sport || "corrida";
  return {
    plan_name: `Plano BN de ${sport}`,
    sport,
    goal: input.goal || "Melhora de performance",
    duration_weeks: 6,
    model: "polarizado",
    volume_weekly_hours: Math.max(1, ((Number(input.days_per_week) || 3) * (Number(input.session_duration) || 60)) / 60),
    fc_zones: {
      z1: { min: 110, max: 125 },
      z2: { min: 126, max: 140 },
      z3: { min: 141, max: 155 },
      z4: { min: 156, max: 170 },
      z5: { min: 171, max: 185 },
    },
    sample_week: [
      { day: "Segunda", workout: "Z2 leve 40-50 min + mobilidade." },
      { day: "Quarta", workout: "Intervalado moderado: 6x3 min Z3 com 2 min Z1." },
      { day: "Sábado", workout: "Sessão longa Z2, mantendo conversa confortável." },
    ],
    warnings: rawText
      ? [`A IA retornou resposta parcial; plano base gerado para continuidade. Prévia: ${clean(rawText).slice(0, 350)}`]
      : ["Plano base gerado para continuidade. Revisar antes de prescrever ao aluno."],
  };
}

function normalizeCardioPlan(plan: any, input: any, rawText = "") {
  if (!plan || typeof plan !== "object") return fallbackCardioPlan(input, rawText);
  plan.duration_weeks = 6;
  plan.sample_week = plan.sample_week || plan.semana_modelo || plan.weeks?.[0]?.sessions || plan.weeks?.[0]?.dias || [];
  plan.volume_weekly_hours = plan.volume_weekly_hours || Math.max(1, ((Number(input.days_per_week) || 3) * (Number(input.session_duration) || 60)) / 60);
  return plan;
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

function aiErrorResponse(status: number) {
  const msg =
    status === 429 ? "Limite de requisições da IA atingido. Tente novamente em instantes." :
    status === 401 ? "Chave da Anthropic inválida. Verifique a ANTHROPIC_API_KEY." :
    status === 402 ? "Créditos da Anthropic esgotados." :
    "Erro ao chamar a IA.";
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── SYSTEM PROMPT — METODOLOGIA BN COMPLETA ─────────────────────────────────
const SYSTEM_PROMPT = `
Você é a IA Prescritora de Performance Cíclica da BN Performance Training.
Sua função é criar planos de treino aeróbico (corrida, ciclismo, natação, triathlon)
100% individualizados seguindo rigorosamente a Metodologia BN.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILOSOFIA BN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Nenhum treino é tão importante quanto a saúde do atleta."
Gestão inteligente da fadiga (TSS/CTL/ATL/TSB) + avaliação biopsicossocial (EVA).
Periodização DINÂMICA — ajuste ao atleta, nunca o atleta ao plano.
Evitar o efeito interferente crônico entre cardio e força.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CÁLCULO DAS ZONAS — FÓRMULA DE KARVONEN (OBRIGATÓRIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FC_reserva = FCmax - FCrep
FC_alvo = FCrep + (% × FC_reserva)

ZONAS (% FC reserva — Karvonen):
Z1 Recuperação:     50–60%  | CR-10: 1–3  | Respiração nasal, consegue cantar
Z2 Aeróbico base:   60–70%  | CR-10: 3–4  | Consegue conversar fluentemente
Z3 Limiar baixo:    70–80%  | CR-10: 5–6  | Conversa entrecortada
Z4 Limiar anaeróbio:80–90%  | CR-10: 7–8  | Não consegue conversar
Z5 Potência máxima: 90–100% | CR-10: 9–10 | Esforço máximo, minutos apenas

SE FCmax ou FCrep não disponíveis:
- FCmax estimada = 220 - idade
- FCrep padrão = 65 bpm
- SEMPRE emitir: "⚠️ Valores estimados. Recomenda-se teste de esforço para maior precisão."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TSS SIMPLIFICADO (quando sem dados de potência/pace)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Z1: ~30 TSS/hora | Z2: ~60/h | Z3: ~100/h | Z4: ~140/h | Z5: ~180/h

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODELO DE INTENSIDADE — DECISÃO AUTOMÁTICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POLARIZADO (80/20) → usar quando:
  - Iniciante (< 6 meses)
  - Longa distância (maratona, Ironman, meio-Ironman)
  - Fase de base ou primeiro bloco
  - Histórico de lesões por sobrecarga
  - TSB < -20

PIRAMIDAL → usar quando:
  - Corrida 5–10km, sprint/olímpico
  - Intermediário/avançado com base aeróbica consolidada
  - Período competitivo (mais Z3–Z4)

SEMPRE polarizado nas primeiras 3 semanas de qualquer novo bloco.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA DOS 10% — LEI DE DAVIES (INVIOLÁVEL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Volume semanal NÃO pode aumentar mais de 10% em relação à média das últimas 3 semanas.
A cada 4 semanas: semana de deload (-30 a -40% do volume).
REJEITAR qualquer prescrição que viole esse limite.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LINHAS VERMELHAS DE SEGURANÇA — INEGOCIÁVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TSB CRÍTICO:
  TSB < -20: PROIBIDO Z3/Z4/Z5. Apenas Z1–Z2 regenerativo.
  TSB < -30 por > 10 dias: Pausa completa 48–72h. Recomendar avaliação médica.

EVA (Dor articular 0–10):
  EVA 0–2: Prescrição normal + fortalecimento preventivo
  EVA 3–4: Volume -30%. Substituir impacto por água/bicicleta
  EVA 5–6: LINHA VERMELHA. Apenas regeneração ativa. Fisioterapia.
  EVA 7+: CONTRAINDICAÇÃO ABSOLUTA. Parar modalidade. Avaliação médica.

Articulações a verificar por modalidade:
  Corrida: tornozelo, joelho, quadril, lombar
  Ciclismo: joelho, lombar, punho
  Natação: ombro, cotovelo, cervical

TENDINOPATIAS:
  Aquiles: suspender corrida em subida e sprints → substituir por ciclismo/natação + excêntrico
  Patelar: corrida só em plano, sem agachamento fundo → bicicleta com carga baixa
  Manguito rotador: sem crawl/borboleta → costas/peito + estabilização escapular

OUTRAS CONTRAINDICAÇÕES ABSOLUTAS:
  Febre/infecção: apenas repouso
  Cirurgia < 6 semanas: recusar prescrição até liberação médica escrita
  Gestação 2º/3º trimestre: apenas Z1–Z2 sem impacto + aprovação do obstetra

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE PERSONALIZAÇÃO POR NÍVEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Iniciante (< 6 meses): máx 3 dias/semana. Apenas Z1–Z2. Sem Z4–Z5.
Intermediário (6–12m): 4 dias/semana. Introduzir Z4 1x/semana com volume controlado.
Avançado (> 12 meses): 5–6 dias/semana. Polarizado ou Piramidal com picos de Z5.
Retorno pós-lesão: volume -50% nas primeiras 2 semanas. Apenas Z1–Z2. +10%/semana.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTEGRAÇÃO FORÇA + NUTRIÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cardio Z4–Z5 NO MESMO DIA que força de MMII (agachamento, terra, afundo):
  → cardio SEMPRE DEPOIS do treino de força, nunca antes
  → intervalo mínimo de 6h entre treino de força intenso e cardio Z4–Z5
Semana de deload da força → reduzir cardio em 20–30% também.

Dieta emagrecimento: priorizar Z1 + HIT curtos, limitar Z2 longo
Dieta hipertrofia: cardio máx 2–3x/semana Z1–Z2, < 150 min/semana total
Dieta performance: seguir plano sem restrições

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVALIAÇÃO FUNCIONAL (se disponível)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Se o atleta tiver avaliação funcional BN, incorporar:
- Disfunções identificadas → ajustar exercícios complementares
- Restrições de movimento → selecionar superfícies e modalidades compatíveis
- Músculos fracos identificados → incluir fortalecimento específico no plano
Ex: valgo de joelho → reforçar glúteo médio + rotadores externos na rotina complementar
Ex: drop da pelve → adicionar abdutores e exercícios unilaterais
Ex: retroversão pélvica → incluir mobilidade de quadril + isquiotibiais no aquecimento

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÃO DE SAÍDA — RESPONDA APENAS COM JSON VÁLIDO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Retorne EXATAMENTE este JSON sem texto adicional, sem markdown:

{
  "plan_name": "Nome descritivo do plano",
  "sport": "corrida | ciclismo | natacao | triathlon",
  "model": "polarizado | piramidal",
  "duration_weeks": N,
  "volume_weekly_km": N,
  "volume_weekly_hours": N,
  "fc_zones": {
    "fcmax": N,
    "fcrep": N,
    "fc_reserva": N,
    "estimated": true/false,
    "z1": {"min": N, "max": N},
    "z2": {"min": N, "max": N},
    "z3": {"min": N, "max": N},
    "z4": {"min": N, "max": N},
    "z5": {"min": N, "max": N}
  },
  "safety_check": {
    "tsb_status": "ok | atencao | linha_vermelha",
    "eva_status": "ok | atencao | linha_vermelha",
    "restrictions": ["lista de restrições aplicadas se houver"]
  },
  "weeks": [
    {
      "week_number": 1,
      "type": "base | desenvolvimento | qualidade | deload",
      "volume_km": N,
      "volume_hours": N,
      "tss_total_estimado": N,
      "focus": "descrição do foco da semana",
      "sessions": [
        {
          "day": "Segunda | Terça | Quarta | Quinta | Sexta | Sábado | Domingo",
          "type": "base_z2 | limiar_z4 | longo_z2 | potencia_z5 | regeneracao | cross_training | descanso",
          "title": "Nome do treino",
          "sport": "corrida | ciclismo | natacao | caminhada | descanso",
          "warmup_min": N,
          "main_min": N,
          "cooldown_min": N,
          "total_min": N,
          "distance_km": N,
          "zone": "Z1 | Z2 | Z3 | Z4 | Z5 | misto",
          "fc_target": "FC: XXX–YYY bpm",
          "intervals": "ex: 4x8min Z4 c/ 3min Z1 recuperação (ou null)",
          "tss_estimado": N,
          "notes": "orientações técnicas específicas"
        }
      ]
    }
  ],
  "complementary_strength": [
    "exercício preventivo/complementar baseado na avaliação funcional se disponível"
  ],
  "nutrition_alert": "orientação nutricional baseada no objetivo e carga",
  "general_tips": "2-3 parágrafos com orientações gerais sobre execução, hidratação, sono",
  "warnings": ["alertas gerados com base nas linhas vermelhas verificadas"]
}
`.trim();

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
      sport,            // "corrida" | "ciclismo" | "natacao" | "triathlon"
      goal,             // "maratona", "5km sub-25", "ironman", etc.
      duration_weeks,   // número de semanas do plano
      days_per_week,    // dias disponíveis para cardio
      session_duration, // minutos por sessão
      current_volume,   // km/semana atual (corrida) ou horas/semana
      fcmax,            // pode ser null
      fcrep,            // pode ser null
      experience_months,// tempo de prática em meses
      tsb,              // pode ser null — se informado, aplicar regras de fadiga
      eva,              // objeto: { tornozelo: 0, joelho: 0, quadril: 0, lombar: 0, ... }
      injuries,         // lesões pregressas ou atuais
      equipment,        // esteira, rua, piscina, bicicleta outdoor/indoor
      diet_type,        // "emagrecimento" | "hipertrofia" | "performance"
      assessment_context, // JSON da avaliação funcional BN (se houver)
      anamnese_context, // JSON bruto/resumido da anamnese
      prescription_integration, // resultado integrado anamnese + avaliação
      bnito_orchestration, // contrato do BNITO para sincronizar agentes
      strength_plan_context, // { days_per_week, workouts:[{day,focus,has_heavy_legs}] }
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
      const { data: previous, error: previousError } = await supabase.from("running_plans")
        .select("id, plan_name, sport, goal, duration_weeks, weeks, fc_zones, safety_check")
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
    try {
      input.sport = normalizeCardioSport(sport);
    } catch (sportError) {
      throw new HttpError(422, sportError instanceof Error ? sportError.message : "Modalidade não suportada.");
    }
    input.eva = deriveEva(input);
    input.prescription_integration = prescription_integration ?? null;
    const aiConfig = await loadCompanyAiConfig(supabase, authorizedCompanyId);

    // Monta contexto do atleta
    const athleteContext = `
DADOS DO ATLETA:
Nome: ${clean(student_name || "não informado")}
Modalidade: ${clean(sport)}
Objetivo: ${clean(goal)}
Semanas de plano solicitado: ${duration_weeks}
Dias disponíveis para cardio: ${days_per_week}
Duração por sessão: ${session_duration || "60-90"} min
Volume atual: ${current_volume || "não informado"} km/semana ou horas/semana
FCmax: ${fcmax || "não informado (usar estimativa)"} bpm
FCrep: ${fcrep || "não informado (usar padrão 65)"} bpm
Experiência: ${experience_months || "não informada"} meses
TSB atual: ${tsb ?? "não informado (assumir TSB neutro, ~0)"}
EVA articular: ${JSON.stringify(eva || {})} (0=sem dor, 10=dor máxima)
Lesões/histórico: ${clean(injuries || "nenhum")}
Equipamentos: ${clean(equipment || "não informado")}
Dieta atual: ${clean(diet_type || "não informado")}

RESULTADO INTEGRADO ANAMNESE + AVALIAÇÃO (PRIORIDADE MÁXIMA):
${prescription_integration
  ? compactJson(prescription_integration, 10000)
  : "Sem resultado integrado — usar anamnese e avaliação separadamente, com cautela."}

ORQUESTRAÇÃO BNITO — CONTRATO ENTRE AGENTES:
${bnito_orchestration
  ? compactJson(bnito_orchestration, 9000)
  : "Sem orquestracao explicita — ainda assim prescrever 6 semanas em 3 blocos de 2 semanas."}

ANAMNESE E CONTEXTO CLÍNICO/ROTINA:
${anamnese_context ? compactJson(anamnese_context, 7000) : "Sem anamnese estruturada adicional."}

AVALIAÇÃO FUNCIONAL BN (se disponível):
${assessment_context ? JSON.stringify(assessment_context) : "Sem avaliação funcional — não incluir orientações baseadas em avaliação postural"}

INTEGRAÇÃO COM MUSCULAÇÃO (sincronização de periodização):
${strength_plan_context
  ? `O atleta tem ${strength_plan_context.days_per_week} dias/semana de musculação.
     Dias com treino pesado de MMII: ${
       (strength_plan_context.workouts || [])
         .filter((w: any) => w.has_heavy_legs)
         .map((w: any) => `Dia ${w.day} (${w.focus})`)
         .join(", ") || "não identificados"
     }
     REGRAS OBRIGATÓRIAS DE SINCRONIZAÇÃO:
     1. NÃO colocar corrida Z4/Z5 nos dias de treino pesado de MMII nem no dia seguinte
     2. Corrida Z1/Z2 pode ocorrer no mesmo dia da musculação APENAS após o treino de força e com 6h de intervalo
     3. Semana de deload da corrida na mesma semana do deload da musculação (semana 4)
     4. Preferir corridas longas Z2 nos dias de descanso da musculação`
  : "Sem plano de musculação — prescrever sem restrições de sincronização"}


INSTRUÇÕES:
1. Comece pelo RESULTADO INTEGRADO para ajustar volume, intensidade, terreno, intervalos e restrições.
2. Calcule as zonas de FC usando Karvonen.
3. Verifique as linhas vermelhas (TSB, EVA, dor e flags funcionais) ANTES de prescrever.
4. Escolha o modelo (Polarizado ou Piramidal) baseado nas regras de decisão.
5. Respeite a Regra dos 10% de progressão de volume.
6. O plano deve ter EXATAMENTE 6 semanas, sincronizado com o BNITO em blocos 1-2, 3-4 e 5-6.
7. Troque o estimulo a cada 2 semanas: base, qualidade moderada, consolidacao/deload conforme o risco.
8. Detalhe todas as sessoes das 6 semanas, mas seja conciso em notes e fc_target para fechar JSON valido.
9. Nunca posicione Z4/Z5 no mesmo dia nem na vespera de MMII pesado quando houver strength_plan_context.
10. Retorne APENAS o JSON conforme instruído, sem texto adicional
    `.trim();

    // GERAÇÃO DETERMINÍSTICA (fallback-first): plano BN completo e enviável SEM depender de IA/crédito.
    // A metodologia (Karvonen, regra dos 10%, deload, linhas vermelhas TSB/EVA, polarizado/piramidal,
    // sincronização com a musculação) vive agora em código (cardioEngine.ts). A IA fica como camada de
    // refino de TEXTO opcional — desligada por padrão e NUNCA gerando estrutura. Isso elimina as cascas
    // vazias e tira a dependência do saldo da Anthropic para prescrever cardio.
    const planJson: any = buildCardioProgram(input);
    planJson.enrichment = { status: "deterministic_only" };
    void athleteContext; // contexto mantido p/ futura camada de refino por IA
    const persistedPlanName = clean(planJson.plan_name || `Plano de ${sport || "corrida"}`);
    planJson.plan_name = persistedPlanName;
    if (prescription_integration) {
      planJson.prescription_integration = {
        readiness: prescription_integration.readiness ?? null,
        coach_summary: prescription_integration.coach_summary ?? null,
        risk_screening: prescription_integration.risk_screening ?? null,
        prescription_decision: prescription_integration.prescription_decision ?? null,
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

    // Invariante: nunca persistir casca vazia. O determinístico sempre preenche, mas garantimos.
    assertCardioPlanComplete(planJson);

    // Salva no banco
    const { data: existingCyclePlan } = cycleContext
      ? await supabase.from("running_plans").select("id").eq("training_cycle_id", cycleContext.id).eq("sport", planJson.sport).maybeSingle()
      : { data: null };
    const planId = existingCyclePlan?.id || crypto.randomUUID();
    const persistencePayload = {
      id: planId,
      company_id: authorizedCompanyId,
      student_id,
      name: persistedPlanName,
      plan_name: persistedPlanName,
      sport: planJson.sport,
      goal: clean(goal),
      weeks: planJson.weeks,
      fc_zones: planJson.fc_zones,
      safety_check: planJson.safety_check,
      general_tips: textValue(planJson.general_tips),
      warnings: Array.isArray(planJson.warnings) ? planJson.warnings.map(textValue) : planJson.warnings ? [textValue(planJson.warnings)] : [],
      complementary_strength: planJson.complementary_strength,
      nutrition_alert: textValue(planJson.nutrition_alert),
      duration_weeks: planJson.duration_weeks,
      model: planJson.model,
      anamnese_id: anamnese_id ?? null,
      bundle_id: authorizedBundleId,
      training_cycle_id: cycleContext?.id ?? null,
      previous_plan_id: authorizedPreviousPlanId,
      sequence_number: planJson.program_sequence?.sequence_number ?? 1,
      sequence_phase: planJson.program_sequence?.phase ?? null,
      start_date: cycleContext?.start_date ?? null,
      end_date: cycleContext?.end_date ?? null,
      status: cycleContext && cycleContext.start_date > businessDateYmd() ? "scheduled" : "active",
    };
    if (existingCyclePlan?.id) {
      await supabase.from("running_plans").update(persistencePayload).eq("id", existingCyclePlan.id).throwOnError();
    } else {
      await supabase.from("running_plans").insert(persistencePayload).throwOnError();
    }

    return new Response(
      JSON.stringify({ id: planId, plan: planJson }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return new Response(
      JSON.stringify({ error: message }),
      { status: e instanceof HttpError ? e.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
