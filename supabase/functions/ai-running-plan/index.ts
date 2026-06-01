import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const clean = (s: string) => (s || "").replace(/[^\x20-\x7E\u00C0-\u017F]/g, "");

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

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
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
    } = await req.json();

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

AVALIAÇÃO FUNCIONAL BN (se disponível):
${assessment_context ? JSON.stringify(assessment_context) : "Sem avaliação funcional — não incluir orientações baseadas em avaliação postural"}

INSTRUÇÕES:
1. Calcule as zonas de FC usando Karvonen
2. Verifique as linhas vermelhas (TSB e EVA) ANTES de prescrever
3. Escolha o modelo (Polarizado ou Piramidal) baseado nas regras de decisão
4. Respeite a Regra dos 10% de progressão de volume
5. Gere o plano semana a semana com todas as sessões
6. Retorne APENAS o JSON conforme instruído, sem texto adicional
    `.trim();

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",  // Sonnet para prescrição — equilíbrio custo/qualidade
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: clean(athleteContext) }],
      }),
    });

    const aiData = await aiResponse.json();
    const rawText = aiData.content?.[0]?.text ?? "";

    // Parse do JSON
    let planJson = null;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      planJson = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Falha ao parsear JSON da IA", raw: rawText.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Salva no banco
    const planId = crypto.randomUUID();
    await supabase.from("running_plans").insert({
      id: planId,
      company_id,
      student_id,
      plan_name: planJson.plan_name,
      sport: planJson.sport,
      goal: clean(goal),
      weeks: planJson.weeks,
      fc_zones: planJson.fc_zones,
      safety_check: planJson.safety_check,
      general_tips: planJson.general_tips,
      warnings: planJson.warnings,
      complementary_strength: planJson.complementary_strength,
      nutrition_alert: planJson.nutrition_alert,
      duration_weeks: planJson.duration_weeks,
      model: planJson.model,
    });

    return new Response(
      JSON.stringify({ id: planId, plan: planJson }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PARTE 2 — SQL (tabela running_plans atualizada)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Adicionar colunas que faltam na tabela running_plans
ALTER TABLE running_plans
  ADD COLUMN IF NOT EXISTS fc_zones JSONB,
  ADD COLUMN IF NOT EXISTS safety_check JSONB,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS duration_weeks INT,
  ADD COLUMN IF NOT EXISTS complementary_strength JSONB,
  ADD COLUMN IF NOT EXISTS nutrition_alert TEXT,
  ADD COLUMN IF NOT EXISTS warnings TEXT[];


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PARTE 3 — DEPLOY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  supabase functions deploy ai-running-plan --no-verify-jwt

================================================================================
  PRÓXIMO: Aguardando documentos de metodologia de
  - Musculação (prescrição de força)
  - Dieta/Nutrição
================================================================================
