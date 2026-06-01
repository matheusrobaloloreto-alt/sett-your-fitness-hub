#!/bin/bash
# ============================================================
# setup_bn_ias.sh — BN Performance Training
# Coloca todos os arquivos nos lugares certos e faz o commit
# Rodar de dentro do projeto: bash setup_bn_ias.sh
# ============================================================

REPO_ROOT="$(pwd)"
echo "📁 Repositório: $REPO_ROOT"

# Verifica que está na raiz do projeto
if [ ! -f "package.json" ]; then
  echo "❌ Rode este script da raiz do projeto (onde está o package.json)"
  exit 1
fi

echo "📝 supabase/functions/ai-prescribe-workout/index.ts"
mkdir -p "supabase/functions/ai-prescribe-workout"
cat > 'supabase/functions/ai-prescribe-workout/index.ts' << 'BNEOF_SUPABASE_FUNCTIONS_AI-PRESCRIBE-WORKOUT_INDEX_TS'
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

// ─── SYSTEM PROMPT — METODOLOGIA BN MUSCULAÇÃO ───────────────────────────────
const SYSTEM_PROMPT = `
Você é o Expert de BN Musculação/Força e Biomecânica da BN Performance Training.
Seu papel é prescrever treinos de força utilizando biomecânica de precisão, controlando
a distribuição de torque articular e o alinhamento de vetores de força.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILOSOFIA BN FORÇA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Envelope de Função: otimizar a relação entre estresse mecânico aplicado e capacidade
de carga dos tecidos articulares e miotendíneos.
TÉCNICA > CARGA: o movimento deve respeitar braços de momento, cinemática articular ideal
e controle motor ANTES de qualquer progressão de volume ou intensidade.
Objetivo BN: unir estética e funcionalidade — treino que melhora a forma E a performance.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOMADA DE DECISÃO CLÍNICA — ANÁLISE DO OVERHEAD SQUAT (OHS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ajuste OBRIGATÓRIO da seleção de exercícios baseado nas falhas de movimento:

LIMITAÇÃO DE DORSIFLEXÃO DE TORNOZELO
(joelhos não passam a linha dos pés / perda de equilíbrio):
→ Prescrever mobilidade de tornozelo (calf stretch, ankle circles, wall drill)
→ No agachamento global: elevação de calcanhares provisória (calcanhar wedge ou anilha)
   para manter tronco verticalizado e reduzir torque de flexão lombar
→ Priorizar: leg press 45°, RDL unilateral, split squat com calcanhar elevado

VALGO DINÂMICO DE JOELHO (colapso medial durante agachamento):
→ Prescrever fortalecimento isolado de abdutores de quadril:
   clamshell, side-lying abduction, fire hydrant, monster walk
→ Técnica RNT (Reactive Neuromuscular Training):
   miniband ao redor dos joelhos durante agachamentos para feedback proprioceptivo
→ Priorizar: box squat com controle, leg press com cue de joelhos para fora
→ Evitar: agachamentos com carga axial alta até correção do valgo

INCLINAÇÃO EXCESSIVA DO TRONCO (perda de controle lombo-pélvico):
→ Substituir Back Squat por variações anteriores que diminuem braço de momento lombar:
   Front Squat, Goblet Squat, Zercher Squat, hack squat na máquina
→ Essas variações favorecem recrutamento de quadríceps e reduzem sobrecarga lombar
→ Fortalecer core lombo-pélvico: pranchas, bird dog, Pallof press, dead bug

RETROVERSÃO PÉLVICA / "BUTT WINK" PRECOCE:
→ Limitar amplitude do agachamento ao ponto anterior à perda do controle pélvico
→ PROIBIDO sobrecarga axial com perda de alinhamento neutro da coluna
→ Trabalhar mobilidade de quadril e isquiotibiais antes do agachamento
→ Box squat com box na altura de segurança (acima do ponto de perda de controle)

DROP DA PELVE (Trendelenburg funcional):
→ Priorizar exercícios unilaterais de quadril: step-up, single-leg press, split squat
→ Adicionar abdutores isolados no início da sessão
→ Progressão gradual antes de retornar ao agachamento bilateral com carga

PROTRUSÃO DE OMBROS / CIFOSE:
→ Adicionar trabalho específico de escápulas: remada curvada, face pull, W-raise
→ Evitar pressão horizontal horizontal intensa até correção postural
→ Priorizar: remadas, pull-ups, puxadas na polia com retração escapular

ASSIMETRIA DE BRAÇOS NO OHS:
→ Abordar mobilidade do ombro comprometido antes das séries de peso
→ Incluir exercícios unilaterais para equalizar o desequilíbrio
→ Rack stretch, sleeper stretch, rotação externa com elástico

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LINHAS VERMELHAS — INEGOCIÁVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVA > 3 (dor ativa):
→ Identificar o padrão que desencadeia a dor
→ Modificar braços de momento (mudar ângulo, amplitude ou posicionamento)
→ Reduzir amplitude de movimento até zona livre de dor
→ Substituir por variações com menor estresse cisalhante/compressivo
→ NUNCA progredir carga em padrão que gera dor

PLIOMETRIA PROIBIDA NO 1º BLOCO (primeiras 6 semanas):
→ Nenhum aluno em fase inicial pode realizar pliometria
→ Foco do 1º bloco: base de força e coordenação motora
→ Pliometria apenas a partir do 2º bloco / 2ª prescrição

INSTABILIDADE LOMBO-PÉLVICA ATIVA:
→ Butt wink precoce = PROIBIDA sobrecarga axial
→ Limitar amplitude até ponto seguro
→ Substituir qualquer exercício que exija alinhamento neutro que não consegue manter

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FÓRMULAS DE INTENSIDADE (Belmiro de Salles & Jonato Prestes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Volume Load (VL) = Séries × Repetições × Carga

Estimativa de 1RM (Brzycki):
1RM = Carga / (1,0278 - (0,0278 × Repetições))

ZONAS DE PRESCRIÇÃO:
Força Máxima:      ≥ 85% 1RM | 1-5 reps  | Pausa 3-5 min
Hipertrofia:       65-85% 1RM | 6-12 reps | Pausa 1,5-2 min
Resistência Força: < 60% 1RM  | ≥ 15 reps | Pausa 30-60s

RPE/RIR (Repetições de Reserva):
RIR 0 = falha concêntrica
RIR 1 = 1 rep reserva
RIR 2-3 = estimulante e seguro para treino de hipertrofia
RIR 4+ = aquecimento / técnica

Para atletas de corrida/triathlon: preferir RIR 2-3 para preservar recuperação aeróbica.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA OBRIGATÓRIA DA SESSÃO (7 ETAPAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TODA sessão DEVE seguir exatamente esta sequência:

1. MOBILIDADE
   Soltura articular específica com foco nas limitações identificadas no OHS/avaliação
   Ex: mobilidade de tornozelo → 3 séries de 10 ankle circles + wall drill

2. ATIVAÇÃO GERAL — CORE
   Rigidez lombo-pélvica: pranchas, perdigueiro (bird dog), Pallof press, dead bug
   Objetivo: ativar os estabilizadores antes de qualquer carga axial

3. ATIVAÇÃO ESPECÍFICA
   Despertar neuromuscular de sinergistas: glúteo médio, manguito rotador, serrátil
   Ex: clamshell + miniband → glúteo médio | Y-T-W → manguito rotador

4. CONTROLE MOTOR
   Educativos técnicos com baixa carga (< 40% 1RM)
   Foco em padrão de movimento, não em carga
   Ex: goblet squat com 8kg → padrão | RDL com halteres leves → cadeia posterior

5. PLIOMETRIA (APENAS a partir do 2º bloco / 2ª prescrição)
   Nunca no 1º bloco. Iniciar com variações de baixa intensidade
   Ex: box jump baixo → broad jump → saltos unilaterais progressivos

6. FORÇA GLOBAL — MULTIARTICULARES LIVRES (PRIORIDADE BN)
   Exercícios compostos livres são o NÚCLEO da metodologia
   Agachamentos, terra (DL/RDL), pressão, remada, avanços
   Seleção baseada na avaliação funcional disponível

7. FORÇA ESPECÍFICA — ACESSÓRIOS ESTRATÉGICOS
   Uniarticulares, máquinas ou elásticos para equalizar desequilíbrios
   Isquiotibiais, rotadores, abdutores, extensores, bíceps/tríceps
   Volume menor — finalizadores funcionais

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTEGRAÇÃO CORRIDA/TRIATHLON + FORÇA (anti-interferência)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para atletas de endurance: minimizar efeito interferente
→ Força ANTES do cardio no mesmo dia (nunca depois de cardio intenso)
→ Priorizar força excêntrica e unilateral (transferência direta para corrida)
→ Preservar força explosiva de quadril e glúteos (potência de corrida)
→ Semana de deload na corrida = reduzir volume de força em 20%
→ Volume semanal de força: 2-3x/semana é suficiente para endurance athletes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÃO DE SAÍDA — APENAS JSON VÁLIDO, SEM TEXTO ADICIONAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "cycle_name": "Nome do ciclo/mesociclo",
  "objective": "Objetivo do ciclo",
  "duration_weeks": N,
  "block": "1 | 2 | 3",
  "biomechanical_notes": "Principais adaptações biomecânicas aplicadas com base na avaliação",
  "workouts": [
    {
      "name": "Treino A — Padrão de Empurrar + Puxar",
      "day_of_week": 1,
      "duration_min": 60,
      "split_focus": "descricao do foco muscular/padrão",
      "exercises": [
        {
          "phase": "mobilidade | ativacao_core | ativacao_especifica | controle_motor | pliometria | forca_global | forca_especifica",
          "exercise_name": "Nome do exercício",
          "muscle_group": "Grupo muscular primário",
          "sets": N,
          "reps": "8-10 | 5 | 15+ | 30s",
          "load_percent_1rm": "65-75% (ou null se não aplicável)",
          "rir": "2-3 (Repetições de Reserva)",
          "rest_seconds": N,
          "tempo": "3010 (excêntrico-pausa-concêntrico-pausa — ex: 3010 = 3s desce, 0 pausa, 1s sobe)",
          "exercise_order": N,
          "cues": "Cue técnico principal de execução",
          "biomechanical_note": "Razão biomecânica para a escolha deste exercício (se relevante)",
          "regression": "Regressão caso o aluno não consiga executar",
          "progression": "Progressão para próximo bloco"
        }
      ],
      "volume_load_estimate": "VL estimado da sessão (séries × reps × carga média)",
      "notes": "Observações gerais da sessão"
    }
  ],
  "weekly_structure": "Descrição da estrutura semanal e ordem dos treinos",
  "progression_protocol": "Como progredir no próximo bloco",
  "warnings": ["Alertas específicos baseados nas limitações identificadas"]
}
`.trim();

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const {
      student_id, student_name, company_id,
      objective,          // "hipertrofia" | "forca" | "emagrecimento" | "performance"
      fitness_level,      // "iniciante" | "intermediario" | "avancado"
      days_per_week,      // dias disponíveis para musculação
      duration_weeks,
      equipment,          // "academia_completa" | "casa_halteres" | "funcional"
      restrictions,       // lesões e restrições
      block_number,       // 1 | 2 | 3 (para liberar pliometria)
      is_endurance_athlete, // true/false — atleta de corrida/triathlon
      assessment_context,   // JSON da avaliação funcional BN
      notes,
    } = await req.json();

    const athleteContext = `
DADOS DO ATLETA:
Nome: ${clean(student_name || "não informado")}
Objetivo: ${clean(objective)}
Nível: ${clean(fitness_level)}
Dias disponíveis para força: ${days_per_week}
Duração do ciclo: ${duration_weeks} semanas
Bloco atual: ${block_number || 1} (pliometria ${block_number >= 2 ? "PERMITIDA" : "PROIBIDA"})
Equipamentos: ${clean(equipment || "academia completa")}
É atleta de endurance (corrida/triathlon): ${is_endurance_athlete ? "SIM — aplicar protocolo anti-interferência" : "NÃO"}
Restrições/Lesões: ${clean(restrictions || "nenhuma")}
Observações adicionais: ${clean(notes || "")}

AVALIAÇÃO FUNCIONAL BN (PRIORIDADE MÁXIMA — adapte TODOS os exercícios):
${assessment_context ? JSON.stringify(assessment_context) : "Sem avaliação funcional disponível — presumir boa mobilidade, aplicar protocolo padrão"}

INSTRUÇÕES:
1. Analise a avaliação funcional e ajuste CADA exercício conforme as disfunções encontradas
2. Siga obrigatoriamente a estrutura de 7 etapas em CADA sessão
3. Pliometria apenas se block_number >= 2
4. Inclua cues técnicos específicos baseados nas falhas do OHS
5. Para atleta de endurance: preferir RIR 2-3, volume moderado, força excêntrica
6. Retorne APENAS o JSON, sem texto adicional, sem markdown
    `.trim();

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: clean(athleteContext) }],
      }),
    });

    const aiData = await aiResponse.json();
    const rawText = aiData.content?.[0]?.text ?? "";

    let planJson = null;
    try {
      planJson = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      return new Response(
        JSON.stringify({ error: "Falha ao parsear JSON", raw: rawText.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Salva o ciclo com os treinos
    const cycleId = crypto.randomUUID();
    await supabase.from("training_cycles").insert({
      id: cycleId,
      company_id, student_id,
      name: planJson.cycle_name,
      objective: planJson.objective,
      duration_weeks: planJson.duration_weeks,
      status: "active",
      notes: planJson.biomechanical_notes,
    });

    for (let i = 0; i < (planJson.workouts || []).length; i++) {
      const w = planJson.workouts[i];
      const workoutId = crypto.randomUUID();
      await supabase.from("workouts").insert({
        id: workoutId, cycle_id: cycleId, company_id,
        name: w.name, day_of_week: w.day_of_week,
        sort_order: i, notes: w.notes,
      });
      for (let j = 0; j < (w.exercises || []).length; j++) {
        const ex = w.exercises[j];
        await supabase.from("workout_exercises").insert({
          workout_id: workoutId,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          sets: ex.sets,
          reps: ex.reps,
          rest_seconds: ex.rest_seconds,
          exercise_order: j,
          notes: `${ex.cues || ""} | Fase: ${ex.phase} | Tempo: ${ex.tempo || "-"} | RIR: ${ex.rir || "-"} | ${ex.biomechanical_note || ""}`,
        });
      }
    }

    return new Response(
      JSON.stringify({ id: cycleId, plan: planJson }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
BNEOF_SUPABASE_FUNCTIONS_AI-PRESCRIBE-WORKOUT_INDEX_TS

echo "📝 supabase/functions/ai-running-plan/index.ts"
mkdir -p "supabase/functions/ai-running-plan"
cat > 'supabase/functions/ai-running-plan/index.ts' << 'BNEOF_SUPABASE_FUNCTIONS_AI-RUNNING-PLAN_INDEX_TS'
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
BNEOF_SUPABASE_FUNCTIONS_AI-RUNNING-PLAN_INDEX_TS

echo "📝 supabase/functions/ai-nutrition-plan/index.ts"
mkdir -p "supabase/functions/ai-nutrition-plan"
cat > 'supabase/functions/ai-nutrition-plan/index.ts' << 'BNEOF_SUPABASE_FUNCTIONS_AI-NUTRITION-PLAN_INDEX_TS'
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
Adesão Realista: cardápio adaptado à realidade brasileira, acessível, com alimentos
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
  "plan_name": "Plano Nutricional BN — [objetivo] | [nome]",
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
  "daily_meals": [
    {
      "meal_name": "Café da manhã",
      "time": "07:00",
      "context": "treino | descanso | pre_treino | pos_treino",
      "calories": N,
      "protein_g": N,
      "carbs_g": N,
      "fat_g": N,
      "foods": [
        {
          "name": "Ovos mexidos",
          "quantity": "3 unidades (150g)",
          "protein_g": 18,
          "carbs_g": 1,
          "fat_g": 12,
          "notes": "fonte de proteína completa + gordura saudável"
        }
      ]
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
  "general_notes": "Orientações gerais sobre timing de refeições, sono, estresse",
  "warnings": ["alertas baseados nas linhas vermelhas verificadas"]
}
`.trim();

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
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
    } = await req.json();

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
Tem micro-ondas/cozinha: ${has_microwave ? "SIM" : "NÃO — cardápio sem preparo complexo"}

CONTEXTO DO PLANO DE CORRIDA (para sincronizar carga):
${running_plan_context ? JSON.stringify(running_plan_context).slice(0, 1000) : "Sem plano de corrida — usar apenas nível de atividade geral"}

INSTRUÇÕES:
1. Calcule TMB (mostrar fórmula e valores calculados)
2. Calcule GET (fator de atividade + custo de treino)
3. Defina calorias alvo com base no objetivo
4. Distribua macros conforme perfil e carb cycling
5. Monte refeições práticas e brasileiras
6. Verifique TODAS as linhas vermelhas antes de prescrever
7. Retorne APENAS o JSON, sem texto adicional
    `.trim();

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: clean(athleteContext) }],
      }),
    });

    const aiData = await aiResponse.json();
    const rawText = aiData.content?.[0]?.text ?? "";

    let planJson = null;
    try {
      planJson = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      return new Response(
        JSON.stringify({ error: "Falha ao parsear JSON", raw: rawText.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Salva no banco
    const planId = crypto.randomUUID();
    await supabase.from("nutrition_plans").insert({
      id: planId,
      company_id, student_id,
      plan_name: planJson.plan_name,
      total_calories: planJson.energy_summary?.target_kcal,
      protein_g: planJson.energy_summary?.protein_total_g,
      carbs_g: planJson.energy_summary?.carbs_total_g,
      fat_g: planJson.energy_summary?.fat_total_g,
      observations: planJson.general_notes,
    });

    // Salva refeições
    for (const meal of (planJson.daily_meals || [])) {
      await supabase.from("meals").insert({
        plan_id: planId,
        name: meal.meal_name,
        time: meal.time,
        calories: meal.calories,
        foods: meal.foods,
      });
    }

    return new Response(
      JSON.stringify({ id: planId, plan: planJson }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
BNEOF_SUPABASE_FUNCTIONS_AI-NUTRITION-PLAN_INDEX_TS

echo "📝 supabase/functions/ai-secretary-chat/index.ts"
mkdir -p "supabase/functions/ai-secretary-chat"
cat > 'supabase/functions/ai-secretary-chat/index.ts' << 'BNEOF_SUPABASE_FUNCTIONS_AI-SECRETARY-CHAT_INDEX_TS'
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

// ─── SYSTEM PROMPT DO BNITO ───────────────────────────────────────────────────
const BNITO_SYSTEM = `
Você é o Bnito, assistente virtual da BN Performance Training.

SOBRE A BN PERFORMANCE TRAINING:
A BN Performance Training é uma consultoria online de alto nível que une estética e funcionalidade. 
Nossa metodologia própria foi desenvolvida para corredores, triatletas e pessoas que buscam 
desempenho real com qualidade de vida. Cada aluno tem um plano 100% individualizado, criado por 
uma equipe dedicada que se reúne semanalmente para revisar prescrições e discutir casos.
Nosso diferencial: não somos uma academia genérica. Somos uma consultoria de performance onde 
cada detalhe do treino é pensado para o seu perfil, seus objetivos e sua avaliação física.

SUA PERSONALIDADE:
- Tom: próximo, encorajador, direto. Como um amigo que entende muito de esporte.
- Nunca robótico, nunca frio. Use linguagem natural e brasileira.
- Pode usar emojis com moderação 🏃 💪 — sem exageros.
- Chame o aluno sempre pelo nome quando souber.
- Seja conciso: WhatsApp não é lugar para textão.

O QUE VOCÊ SABE RESPONDER:
1. PLANOS E PREÇOS → responda com os valores/modalidades fornecidos no contexto
2. TREINO DA SEMANA → oriente o aluno a acessar o app/plataforma; se não tiver acesso, escale
3. DOR / LESÃO → acolha com empatia, NUNCA dê diagnóstico, oriente a reportar para a equipe,
   pergunte: "É uma dor aguda ou crônica? Apareceu durante o treino ou depois?"
4. MOTIVAÇÃO / CHECK-IN → seja o parceiro de treino. Celebre conquistas. Seja firme mas gentil
   nos lembretes de check-in.
5. REAGENDAMENTO / CANCELAMENTO → colete as informações e informe que o time vai confirmar
6. DÚVIDAS DE CORRIDA E TRIATHLON → responda com base em conhecimento técnico sólido
   (frequência cardíaca, periodização, nutrição básica, recuperação, etc.)
7. PRIMEIRO CONTATO / INTERESSE EM CONTRATAR → apresente a proposta de valor da BN,
   colete nome, modalidade de interesse e objetivo. Encaminhe para o time fechar.

REGRAS INEGOCIÁVEIS:
- JAMAIS invente informações sobre preços, datas ou compromissos da equipe
- JAMAIS dê diagnóstico médico ou prescreva medicamentos
- JAMAIS prometa resultados específicos ("você vai emagrecer X kg")
- Se não souber: responda EXATAMENTE "Vou verificar isso com nosso time e te retorno em breve! 🙏"
  — nada mais, nada menos nessa frase específica.
- Respostas curtas: máximo 4 linhas no WhatsApp. Se precisar de mais, divida em mensagens.

APRENDIZADOS RECENTES DO TIME:
{KNOWLEDGE_BLOCK}

CONTEXTO DO ALUNO (se disponível):
{STUDENT_CONTEXT}
`.trim();

// ─── BUSCA CONHECIMENTO RELEVANTE ─────────────────────────────────────────────
async function fetchRelevantKnowledge(
  supabase: any,
  companyId: string,
  message: string
): Promise<{ items: any[]; ids: string[] }> {
  const { data } = await supabase
    .from("secretary_knowledge")
    .select("id, question, human_answer")
    .eq("company_id", companyId)
    .eq("status", "learned")
    .textSearch("question", message.split(" ").slice(0, 5).join(" | "), {
      config: "portuguese",
    })
    .limit(5);

  if (!data || data.length === 0) return { items: [], ids: [] };

  return {
    items: data,
    ids: data.map((d: any) => d.id),
  };
}

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      message,
      student_name,
      student_id,
      phone,
      company_id,
      history = [],
      student_context = "",
    } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Busca conhecimento aprendido relevante
    const { items: knowledgeItems, ids: knowledgeIds } = await fetchRelevantKnowledge(
      supabase,
      company_id,
      message
    );

    const knowledgeBlock =
      knowledgeItems.length > 0
        ? knowledgeItems
            .map((k) => `P: "${k.question}"\nR: "${k.human_answer}"`)
            .join("\n\n")
        : "Nenhum aprendizado específico ainda para este contexto.";

    // 2. Monta o system prompt com conhecimento e contexto do aluno
    const systemPrompt = BNITO_SYSTEM
      .replace("{KNOWLEDGE_BLOCK}", knowledgeBlock)
      .replace("{STUDENT_CONTEXT}", student_context || "Aluno não identificado");

    // 3. Monta histórico recente (últimas 6 trocas)
    const recentHistory = history.slice(-6).map((h: any) => ({
      role: h.role,
      content: clean(h.content),
    }));

    // 4. Chama a API do Claude
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...recentHistory,
          { role: "user", content: clean(message) },
        ],
      }),
    });

    const aiData = await aiResponse.json();
    const responseText = aiData.content?.[0]?.text ?? "Não consegui processar sua mensagem. Tente novamente!";

    // 5. Detecta se foi escalado
    const escalated = responseText.includes("Vou verificar isso com nosso time");

    // 6. Se escalado, salva na base de conhecimento para aprendizado futuro
    if (escalated && company_id) {
      await supabase.from("secretary_knowledge").insert({
        company_id,
        question: clean(message),
        context: clean(
          `Aluno: ${student_name || "desconhecido"}\n` +
          `Histórico recente: ${JSON.stringify(recentHistory.slice(-2))}`
        ),
        status: "pending",
      });
    }

    // 7. Salva conversa no histórico
    await supabase.from("secretary_conversations").insert({
      company_id,
      student_id: student_id || null,
      student_name: student_name || null,
      phone: phone || null,
      message: clean(message),
      response: responseText,
      escalated,
      knowledge_ids: knowledgeIds.length > 0 ? knowledgeIds : null,
    });

    // 8. Atualiza contador de uso dos conhecimentos utilizados
    if (knowledgeIds.length > 0) {
      await supabase.rpc("increment_knowledge_usage", { ids: knowledgeIds });
    }

    return new Response(
      JSON.stringify({
        response: responseText,
        escalated,
        knowledge_used: knowledgeIds.length,
      }),
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
  PARTE 3 — FUNÇÃO SQL AUXILIAR (contador de uso)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION increment_knowledge_usage(ids UUID[])
RETURNS void AS $$
  UPDATE secretary_knowledge
  SET used_count = used_count + 1
  WHERE id = ANY(ids);
$$ LANGUAGE SQL SECURITY DEFINER;


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PARTE 4 — PAINEL ADMIN (como o time "ensina" o Bnito)
  Componente: SecretaryKnowledge.tsx (adicionar ao painel admin)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FLUXO DE APRENDIZADO:
1. Aluno pergunta algo que o Bnito não sabe
2. Bnito responde "Vou verificar com nosso time"
3. Supabase salva a pergunta em secretary_knowledge com status='pending'
4. No painel admin, aba "Ensinar Bnito" mostra perguntas pendentes
5. Admin digita a resposta certa → status muda para 'learned'
6. Da próxima vez que um aluno fizer pergunta similar, o Bnito usa essa resposta

QUERY para listar pendentes no admin:
  SELECT id, question, context, created_at
  FROM secretary_knowledge
  WHERE company_id = $1 AND status = 'pending'
  ORDER BY created_at DESC;

QUERY para ensinar (admin responde):
  UPDATE secretary_knowledge
  SET human_answer = $1,
      status = 'learned',
      learned_at = NOW()
  WHERE id = $2;

QUERY para ver o que o Bnito já aprendeu:
  SELECT question, human_answer, used_count, learned_at
  FROM secretary_knowledge
  WHERE company_id = $1 AND status = 'learned'
  ORDER BY used_count DESC;


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PARTE 5 — INTEGRAÇÃO WHATSAPP (Evolution API)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Webhook recebe mensagem da Evolution API → chama edge function:

  POST /functions/v1/ai-secretary-chat
  {
    "message": "texto da mensagem do aluno",
    "phone": "5511999999999",
    "student_name": "João Silva",     // buscar pelo phone na tabela students
    "student_id": "uuid-do-aluno",   // se encontrado
    "company_id": "uuid-da-empresa",
    "history": [],                    // buscar do secretary_conversations
    "student_context": "            // dados relevantes do aluno
      Aluno: João Silva
      Plano: Corrida + Musculação
      Modalidade: Corrida / 10km
      Objetivo: Sub 50min nos 10km
      Último check-in: 3 dias atrás
      Fase do ciclo: Semana 3 de 4 (volume)
    "
  }

  Buscar histórico recente:
    SELECT message, response FROM secretary_conversations
    WHERE phone = $1 AND company_id = $2
    ORDER BY created_at DESC LIMIT 6;

  Buscar contexto do aluno:
    SELECT s.full_name, s.email,
           tc.name as ciclo_atual, tc.objective,
           tc.status
    FROM students s
    LEFT JOIN training_cycles tc ON tc.student_id = s.id AND tc.status = 'active'
    WHERE s.phone = $1 AND s.company_id = $2
    LIMIT 1;


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PARTE 6 — EXEMPLOS DO BNITO EM AÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALUNO: "Oi, quais são os planos de vocês?"
BNITO: "Oi! 👋 Aqui é o Bnito, da BN Performance Training!
Trabalhamos com consultoria 100% online e individualizada — cada plano é montado 
pra você, não é planilha genérica.
Temos modalidades de musculação funcional, corrida e triathlon.
Posso te passar os detalhes! Me conta: qual é seu principal objetivo hoje?"

ALUNO: "Meu joelho tá doendo depois do longão de domingo"
BNITO: "Cara, que chato isso 😕 Vamos entender melhor.
Essa dor apareceu durante a corrida ou só depois? É uma dor pontual ou mais difusa?
Enquanto isso, pausa o treino de impacto por hoje — melhor prevenir do que agravar.
Vou acionar nosso time pra avaliar seu caso com atenção, tá?"

ALUNO: "Faz 4 dias que não treino, tô com preguiça"
BNITO: "Saudades de você nas planilhas! 🏃
4 dias é tempo suficiente pra o corpo descansar — mas é também onde a preguiça 
tenta vencer. Qual foi o último treino que você fez? 
Bora marcar o próximo já."

ALUNO: "Qual o pace ideal pra minha tirada de 800m?"
BNITO: "Depende do seu objetivo e FC atual!
Para desenvolvimento aeróbico: 10-15s mais rápido que seu pace de limiar.
Para VO2max: pace de 5km ou ligeiramente mais rápido.
Qual é seu pace atual de corrida e qual o foco do ciclo agora?"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DEPLOY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  supabase functions deploy ai-secretary-chat --no-verify-jwt

================================================================================
  PRÓXIMO: IA Avaliadora Funcional (análise de vídeo postural + overhead squat)
================================================================================
BNEOF_SUPABASE_FUNCTIONS_AI-SECRETARY-CHAT_INDEX_TS

echo "📝 supabase/functions/ai-functional-assessment/index.ts"
mkdir -p "supabase/functions/ai-functional-assessment"
cat > 'supabase/functions/ai-functional-assessment/index.ts' << 'BNEOF_SUPABASE_FUNCTIONS_AI-FUNCTIONAL-ASSESSMENT_INDEX_TS'
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

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
Você é um especialista em avaliação postural e funcional da BN Performance Training.
Sua função é analisar imagens de avaliação postural estática e overhead squat e gerar
um laudo técnico completo que será usado para prescrição de treino individualizado.

METODOLOGIA BN PERFORMANCE:
A BN Performance Training avalia cada aluno em dois momentos:
1. POSTURA ESTÁTICA — fotos de frente, lado e costas com grid de alinhamento
2. MOVIMENTO FUNCIONAL — overhead squat de frente, lado e costas

O objetivo é identificar compensações, disfunções e restrições que impactam
tanto a performance (corrida, triathlon, musculação) quanto a estética corporal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROTOCOLO DE ANÁLISE — POSTURA ESTÁTICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VISTA FRONTAL (com grid):
□ Alinhamento da cabeça (inclinação lateral, rotação)
□ Nível dos ombros (ombro mais alto/baixo, protração bilateral ou unilateral)
□ Nível das cristas ilíacas (pelve mais alta de um lado)
□ Joelhos (valgo/varo bilateral ou unilateral)
□ Pés (pronação, supinação, rotação externa/interna)
□ Simetria geral direita vs esquerda

VISTA LATERAL:
□ Posição da cabeça (anteriorização, retificação cervical)
□ Ombros (protrusão anterior, cifose torácica)
□ Coluna torácica (hipercifose, retificação)
□ Coluna lombar (hiperlordose, retificação)
□ Pelve (anteversão = hiperlordose lombar / retroversão = lordose reduzida)
□ Quadril (flexão de quadril — hip flexors encurtados)
□ Joelhos (hiperextensão, flexão)
□ Tornozelos (flexão plantar compensatória)

VISTA POSTERIOR (com grid):
□ Alinhamento da coluna (escoliose funcional ou estrutural)
□ Nível de escápulas (abdução, elevação)
□ Altura das cristas ilíacas (drop da pelve em repouso)
□ Joelhos (valgo/varo, rotação tibial)
□ Calcanhares (pronação = calcâneo valgum)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROTOCOLO DE ANÁLISE — OVERHEAD SQUAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VISTA FRONTAL:
□ Assimetria de braços (um lado mais baixo/rotado)
□ Inclinação lateral do tronco
□ Joelhos: valgo bilateral ou unilateral (indica fraqueza de glúteo médio/rotadores externos)
□ Pés: pronação excessiva, rotação externa compensatória
□ Drop da pelve (um lado cai — Trendelenburg funcional)
□ Deslocamento do peso para um lado

VISTA LATERAL:
□ Inclinação excessiva do tronco à frente
  — Ângulo do tronco vs ângulo da tíbia (devem ser aproximadamente paralelos)
  — Inclinação desproporcional indica: encurtamento de tornozelo (ADM limitada),
    fraqueza de glúteos ou encurtamento de hip flexors
□ Falta de ADM (amplitude de dorsiflexão do tornozelo)
  — Identificar se limitação é de tornozelo ou de mobilidade de quadril
□ Retroversão pélvica ao final do movimento ("butt wink")
  — Indica encurtamento de isquiotibiais e limitação de dorsiflexão
□ Aumento da lordose lombar durante o movimento
  — Indica fraqueza de core + hip flexors encurtados
□ Profundidade do agachamento (ADM total do movimento)

VISTA POSTERIOR:
□ Drop da pelve (um lado cai durante o agachamento)
□ Assimetria de braços overhead
□ Desvio lateral da coluna durante o movimento
□ Rotação de quadril assimétrica

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISFUNÇÕES E SUAS CAUSAS PROVÁVEIS (para referenciar no laudo)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INCLINAÇÃO EXCESSIVA DO TRONCO NO SQUAT:
→ Causa 1: Falta de ADM de tornozelo (dorsiflexão limitada)
→ Causa 2: Fraqueza de glúteos/quadríceps
→ Causa 3: Encurtamento de hip flexors (psoas/reto femoral)
→ Impacto corrida: aumento de sobrecarga posterior, risco de lesão lombar

DROP DA PELVE:
→ Causa: Fraqueza de glúteo médio e pequeno (abdutores do quadril)
→ Impacto corrida: síndrome do estresse tibial, STIC, dor no TFL/IT band
→ Impacto musculação: desalinhamento nos agachamentos e levantamentos

RETROVERSÃO PÉLVICA (BUTT WINK):
→ Causa 1: Encurtamento de isquiotibiais
→ Causa 2: Falta de mobilidade de quadril
→ Causa 3: Fraqueza de core na estabilização lombar
→ Impacto: sobrecarga lombar em cargas axiais

VALGO DE JOELHO:
→ Causa 1: Fraqueza de glúteo médio + rotadores externos
→ Causa 2: Pronação excessiva de tornozelo
→ Causa 3: Fraqueza de vasto medial
→ Impacto corrida: risco elevado de STIC e dor patelofemoral
→ Lado afetado sempre deve ser indicado (D, E ou bilateral)

ASSIMETRIA DE BRAÇOS NO OVERHEAD:
→ Causa 1: Limitação de mobilidade de ombro (geralmente o lado mais baixo)
→ Causa 2: Desequilíbrio de trapézio/serrátil anterior
→ Causa 3: Restrição de mobilidade torácica

PROTRUSÃO DE OMBROS (postura estática):
→ Causa: Peitoral menor encurtado + romboides/trapézio inferior fracos
→ Impacto: limitação de mobilidade overhead, risco de impacto subacromial

HIPERLORDOSE LOMBAR (postura estática):
→ Causa: Psoas/reto femoral encurtados + core e glúteos fracos
→ Impacto corrida: síndrome do piriforme, dor sacroilíaca, stress lombar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÃO DE SAÍDA — RESPONDA APENAS COM JSON VÁLIDO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você deve retornar EXATAMENTE este JSON, sem texto adicional, sem markdown:

{
  "postura_estatica": {
    "vista_frontal": {
      "cabeca": "descrição ou null",
      "ombros": "descrição ou null",
      "pelve": "descrição ou null",
      "joelhos": "descrição ou null",
      "pes": "descrição ou null",
      "observacoes": "outras observações"
    },
    "vista_lateral": {
      "cabeca_pescoco": "descrição ou null",
      "ombros": "descrição ou null",
      "coluna_toracica": "descrição ou null",
      "coluna_lombar": "descrição ou null",
      "pelve": "descrição ou null",
      "joelhos": "descrição ou null",
      "observacoes": "outras observações"
    },
    "vista_posterior": {
      "coluna": "descrição ou null",
      "escapulas": "descrição ou null",
      "pelve": "descrição ou null",
      "joelhos_calcanhares": "descrição ou null",
      "observacoes": "outras observações"
    }
  },
  "overhead_squat": {
    "vista_frontal": {
      "bracos": "simétrico | assimetria direita | assimetria esquerda",
      "joelhos": "sem alteração | valgo bilateral | valgo direito | valgo esquerdo | varo",
      "pelve": "estável | drop direito | drop esquerdo",
      "tronco": "centralizado | desvio direito | desvio esquerdo",
      "observacoes": "outras observações"
    },
    "vista_lateral": {
      "inclinacao_tronco": "adequada | excessiva",
      "angulo_tibiotronco": "paralelo | tronco muito a frente",
      "adm_tornozelo": "adequada | limitada",
      "pelve_fundo": "neutra | retroversao | anteversao",
      "lordose_lombar": "mantida | aumentada | reduzida",
      "profundidade_squat": "completa | parcial | limitada",
      "observacoes": "outras observações"
    },
    "vista_posterior": {
      "drop_pelve": "ausente | direito | esquerdo",
      "assimetria_bracas": "ausente | presente direito | presente esquerdo",
      "desvio_coluna": "ausente | presente",
      "observacoes": "outras observações"
    }
  },
  "disfuncoes_identificadas": [
    {
      "nome": "nome da disfunção",
      "localizacao": "bilateral | direito | esquerdo",
      "gravidade": "leve | moderada | severa",
      "causa_provavel": "descrição da causa",
      "impacto_treino": "como isso afeta o treino"
    }
  ],
  "musculos_encurtados": ["lista de músculos provavelmente encurtados"],
  "musculos_fracos": ["lista de músculos provavelmente fracos/inibidos"],
  "restricoes_movimento": ["lista de restrições de amplitude/mobilidade"],
  "prioridades_corretivas": [
    "1ª prioridade de intervenção",
    "2ª prioridade",
    "3ª prioridade"
  ],
  "exercicios_contraindicados": [
    {
      "exercicio": "nome do exercício",
      "motivo": "por que contraindicar"
    }
  ],
  "exercicios_cautela": [
    {
      "exercicio": "nome do exercício",
      "adaptacao": "como adaptar para tornar seguro"
    }
  ],
  "score_postural": {
    "total": 0,
    "cabeca_cervical": 0,
    "coluna_toracolombar": 0,
    "pelve_quadril": 0,
    "membros_inferiores": 0,
    "obs": "escala de 0 a 10 onde 10 é ideal"
  },
  "score_funcional": {
    "total": 0,
    "mobilidade_tornozelo": 0,
    "mobilidade_quadril": 0,
    "estabilidade_lombar": 0,
    "controle_joelho": 0,
    "simetria_movimento": 0,
    "obs": "escala de 0 a 10 onde 10 é ideal"
  },
  "relatorio_para_aluno": "Texto em português claro, acolhedor e motivador (3-5 parágrafos). Explica o que foi encontrado em linguagem acessível, sem termos técnicos excessivos. Fala sobre os pontos de atenção e o que o programa vai trabalhar. Tom: profissional e encorajador.",
  "resumo_para_prescricao": "Texto técnico resumido (2-3 parágrafos) para o profissional que vai prescrever o treino. Deve incluir as principais disfunções, músculos a priorizar, restrições e orientações específicas por modalidade se a informação estiver disponível."
}
`.trim();

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      student_id,
      student_name,
      company_id,
      assessment_id,       // ID pré-gerado no frontend
      // Imagens em base64 (podem ser parciais — nem todas são obrigatórias)
      image_postura_frente,  // base64
      image_postura_lado,    // base64
      image_postura_costas,  // base64
      image_squat_frente,    // base64
      image_squat_lado,      // base64
      image_squat_costas,    // base64
      // Anamnese complementar
      queixa_principal = "",
      historico_lesoes = "",
      modalidade = "",
      nivel = "",
    } = await req.json();

    // Monta array de imagens disponíveis para o Claude
    const imageContent: any[] = [];
    const labels = [
      { key: image_postura_frente, label: "POSTURA ESTÁTICA — VISTA FRONTAL" },
      { key: image_postura_lado,   label: "POSTURA ESTÁTICA — VISTA LATERAL" },
      { key: image_postura_costas, label: "POSTURA ESTÁTICA — VISTA POSTERIOR" },
      { key: image_squat_frente,   label: "OVERHEAD SQUAT — VISTA FRONTAL" },
      { key: image_squat_lado,     label: "OVERHEAD SQUAT — VISTA LATERAL" },
      { key: image_squat_costas,   label: "OVERHEAD SQUAT — VISTA POSTERIOR" },
    ];

    for (const { key, label } of labels) {
      if (key) {
        imageContent.push({ type: "text", text: `\n--- ${label} ---` });
        imageContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: key.replace(/^data:image\/\w+;base64,/, ""),
          },
        });
      }
    }

    // Adiciona contexto da anamnese
    const anamneseText = `
DADOS DO ALUNO:
Nome: ${clean(student_name || "não informado")}
Modalidade: ${clean(modalidade || "não informada")}
Nível: ${clean(nivel || "não informado")}
Queixa principal: ${clean(queixa_principal || "nenhuma")}
Histórico de lesões: ${clean(historico_lesoes || "nenhum")}

Analise todas as imagens acima e retorne o JSON conforme instruído.
    `.trim();

    imageContent.push({ type: "text", text: anamneseText });

    // Chama Claude com visão
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",   // Usa Opus para análise visual complexa
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: imageContent }],
      }),
    });

    const aiData = await aiResponse.json();
    const rawText = aiData.content?.[0]?.text ?? "";

    // Parse do JSON retornado
    let assessmentJson = null;
    let reportText = "";
    let resumoPresricao = "";

    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      assessmentJson = JSON.parse(cleaned);
      reportText = assessmentJson.relatorio_para_aluno || "";
      resumoPresricao = assessmentJson.resumo_para_prescricao || "";
    } catch {
      // Se não parsear, salva raw mesmo
      reportText = "Análise concluída. Consulte o relatório técnico completo.";
    }

    // Salva no banco
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const id = assessment_id || crypto.randomUUID();

    await supabase.from("functional_assessments").upsert({
      id,
      company_id,
      student_id,
      queixa_principal: clean(queixa_principal),
      historico_lesoes: clean(historico_lesoes),
      modalidade: clean(modalidade),
      nivel: clean(nivel),
      ai_raw_response: rawText,
      report_text: reportText,
      assessment_json: assessmentJson,
      status: "completed",
    });

    return new Response(
      JSON.stringify({
        id,
        report_text: reportText,
        assessment_json: assessmentJson,
        resumo_prescricao: resumoPresricao,
      }),
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
  PARTE 3 — COMO O JSON ALIMENTA AS IAS DE PRESCRIÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Quando a IA Prescritora de Musculação for gerar um treino, ela recebe:

  const assessment = await supabase
    .from("functional_assessments")
    .select("assessment_json, report_text")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Injeta no prompt de prescrição:
  const assessmentContext = assessment?.data?.assessment_json ? `
    AVALIAÇÃO FUNCIONAL DO ALUNO:
    Disfunções identificadas: ${JSON.stringify(assessment.data.assessment_json.disfuncoes_identificadas)}
    Músculos encurtados: ${assessment.data.assessment_json.musculos_encurtados?.join(", ")}
    Músculos fracos: ${assessment.data.assessment_json.musculos_fracos?.join(", ")}
    Exercícios contraindicados: ${JSON.stringify(assessment.data.assessment_json.exercicios_contraindicados)}
    Exercícios com cautela: ${JSON.stringify(assessment.data.assessment_json.exercicios_cautela)}
    Prioridades corretivas: ${assessment.data.assessment_json.prioridades_corretivas?.join(" | ")}
    Score postural: ${assessment.data.assessment_json.score_postural?.total}/10
    Score funcional: ${assessment.data.assessment_json.score_funcional?.total}/10
  ` : "Sem avaliação funcional disponível.";


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PARTE 4 — PAYLOAD DO FRONTEND (como chamar a função)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// No componente React/Lovable:
const handleAnalyze = async () => {
  // Converte arquivos para base64
  const toBase64 = (file: File) => new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const payload = {
    student_id: selectedStudentId,
    student_name: selectedStudentName,
    company_id: companyId,
    assessment_id: crypto.randomUUID(),
    image_postura_frente: posturaFrenteFile ? await toBase64(posturaFrenteFile) : null,
    image_postura_lado: posturaLadoFile   ? await toBase64(posturaLadoFile) : null,
    image_postura_costas: posturaCostaFile ? await toBase64(posturaCostaFile) : null,
    image_squat_frente: squatFrenteFile   ? await toBase64(squatFrenteFile) : null,
    image_squat_lado: squatLadoFile       ? await toBase64(squatLadoFile) : null,
    image_squat_costas: squatCostaFile    ? await toBase64(squatCostaFile) : null,
    queixa_principal,
    historico_lesoes,
    modalidade,
    nivel,
  };

  const { data, error } = await supabase.functions.invoke(
    "ai-functional-assessment",
    { body: payload }
  );
};

NOTA IMPORTANTE SOBRE MODELO:
  A análise de imagens usa claude-opus-4-6 (mais capaz para visão complexa).
  Para reduzir custo, pode usar claude-sonnet-4-6 — ainda excelente para visão.
  NÃO usar Haiku para análise postural — resolução de análise visual é inferior.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PARTE 5 — DEPLOY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  supabase functions deploy ai-functional-assessment --no-verify-jwt

================================================================================
  PRÓXIMO: aguardando seus prompts de metodologia para
  IA Prescritora de Musculação, Corrida e Dieta
================================================================================
BNEOF_SUPABASE_FUNCTIONS_AI-FUNCTIONAL-ASSESSMENT_INDEX_TS

echo "📝 src/pages/admin/UnifiedPrescriber.tsx"
mkdir -p "src/pages/admin"
cat > 'src/pages/admin/UnifiedPrescriber.tsx' << 'BNEOF_SRC_PAGES_ADMIN_UNIFIEDPRESCRIBER_TSX'
// ============================================================================
// UnifiedPrescriber.tsx — BN Performance Training
// Cole em: src/pages/admin/UnifiedPrescriber.tsx
//
// FLUXO:
//   1. Seleciona aluno → carrega anamnese salva (se houver)
//   2. Preenche/edita anamnese UMA VEZ
//   3. Marca quais IAs gerar (qualquer combinação)
//   4. "Gerar Prescrições" → roda em sequência passando contexto
//      Musculação → Corrida (recebe plano de força) → Nutrição (recebe ambos)
// ============================================================================
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, Circle, AlertCircle, Dumbbell, Activity, Apple, ChevronDown, ChevronUp } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────
interface Student { id: string; name: string; }
interface Anamnese {
  age: string; body_fat_percent: string;
  objective: string; activity_level: string;
  is_endurance_athlete: boolean;
  training_modality: string;
  days_per_week_strength: string; days_per_week_cardio: string;
  session_duration_min: string; equipment: string; experience_months: string;
  sport: string; fcmax: string; fcrep: string;
  current_volume_weekly: string; cardio_goal: string;
  stress_score: string; sleep_quality: string; injuries: string;
  food_restrictions: string; budget_food: string;
  meals_per_day: string; has_kitchen: boolean; notes: string;
}
type Modality = "musculacao" | "corrida" | "nutricao";
type GenStatus = "idle" | "generating" | "done" | "error";

const DEFAULT_ANAMNESE: Anamnese = {
  age: "", body_fat_percent: "", objective: "performance",
  activity_level: "moderado", is_endurance_athlete: false,
  training_modality: "", days_per_week_strength: "3",
  days_per_week_cardio: "0", session_duration_min: "60",
  equipment: "academia_completa", experience_months: "",
  sport: "corrida", fcmax: "", fcrep: "",
  current_volume_weekly: "", cardio_goal: "",
  stress_score: "", sleep_quality: "", injuries: "",
  food_restrictions: "", budget_food: "moderado",
  meals_per_day: "5", has_kitchen: true, notes: "",
};

// ── Componente principal ──────────────────────────────────────────────────
export default function UnifiedPrescriber() {
  const [companyId, setCompanyId]   = useState<string | null>(null);
  const [students, setStudents]     = useState<Student[]>([]);
  const [studentId, setStudentId]   = useState("");
  const [anamnese, setAnamnese]     = useState<Anamnese>(DEFAULT_ANAMNESE);
  const [anamneseId, setAnamneseId] = useState<string | null>(null);
  const [modalities, setModalities] = useState<Set<Modality>>(new Set(["musculacao"]));
  const [open, setOpen]             = useState({ personal: true, training: true, cardio: false, health: false, nutri: false });
  const [status, setStatus]         = useState<Record<Modality, GenStatus>>({ musculacao: "idle", corrida: "idle", nutricao: "idle" });
  const [results, setResults]       = useState<Record<Modality, any>>({ musculacao: null, corrida: null, nutricao: null });
  const [generating, setGenerating] = useState(false);
  const [bundleId, setBundleId]     = useState<string | null>(null);
  const [error, setError]           = useState("");

  // Carrega company + alunos
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: m } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (!m) return;
      setCompanyId(m.company_id);
      const { data: list } = await supabase.from("students").select("id, name").eq("company_id", m.company_id).order("name");
      setStudents(list || []);
    })();
  }, []);

  // Carrega anamnese salva quando troca de aluno
  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const { data } = await supabase.from("student_anamneses").select("*").eq("student_id", studentId).maybeSingle();
      if (data) {
        setAnamneseId(data.id);
        setAnamnese({
          age: data.age?.toString() ?? "",
          body_fat_percent: data.body_fat_percent?.toString() ?? "",
          objective: data.objective ?? "performance",
          activity_level: data.activity_level ?? "moderado",
          is_endurance_athlete: data.is_endurance_athlete ?? false,
          training_modality: data.training_modality ?? "",
          days_per_week_strength: data.days_per_week_strength?.toString() ?? "3",
          days_per_week_cardio: data.days_per_week_cardio?.toString() ?? "0",
          session_duration_min: data.session_duration_min?.toString() ?? "60",
          equipment: data.equipment ?? "academia_completa",
          experience_months: data.experience_months?.toString() ?? "",
          sport: data.sport ?? "corrida",
          fcmax: data.fcmax?.toString() ?? "",
          fcrep: data.fcrep?.toString() ?? "",
          current_volume_weekly: data.current_volume_weekly?.toString() ?? "",
          cardio_goal: data.cardio_goal ?? "",
          stress_score: data.stress_score?.toString() ?? "",
          sleep_quality: data.sleep_quality?.toString() ?? "",
          injuries: data.injuries ?? "",
          food_restrictions: data.food_restrictions ?? "",
          budget_food: data.budget_food ?? "moderado",
          meals_per_day: data.meals_per_day?.toString() ?? "5",
          has_kitchen: data.has_kitchen ?? true,
          notes: data.notes ?? "",
        });
      } else {
        setAnamneseId(null);
        setAnamnese(DEFAULT_ANAMNESE);
      }
    })();
  }, [studentId]);

  // Sincroniza seção cardio quando seleciona corrida
  useEffect(() => {
    if (modalities.has("corrida")) setOpen(o => ({ ...o, cardio: true }));
    if (modalities.has("nutricao")) setOpen(o => ({ ...o, nutri: true }));
  }, [modalities]);

  const set = (k: keyof Anamnese, v: any) => setAnamnese(a => ({ ...a, [k]: v }));
  const toggleMod = (m: Modality) => setModalities(prev => {
    const next = new Set(prev);
    next.has(m) ? next.delete(m) : next.add(m);
    return next;
  });
  const student = students.find(s => s.id === studentId);

  // ── Salvar anamnese no banco ────────────────────────────────────────────
  async function saveAnamnese(): Promise<string> {
    const payload = {
      student_id: studentId, company_id: companyId,
      age: anamnese.age ? Number(anamnese.age) : null,
      body_fat_percent: anamnese.body_fat_percent ? Number(anamnese.body_fat_percent) : null,
      objective: anamnese.objective, activity_level: anamnese.activity_level,
      is_endurance_athlete: anamnese.is_endurance_athlete,
      training_modality: anamnese.training_modality,
      days_per_week_strength: Number(anamnese.days_per_week_strength) || null,
      days_per_week_cardio: Number(anamnese.days_per_week_cardio) || null,
      session_duration_min: Number(anamnese.session_duration_min) || null,
      equipment: anamnese.equipment,
      experience_months: anamnese.experience_months ? Number(anamnese.experience_months) : null,
      sport: anamnese.sport, fcmax: anamnese.fcmax ? Number(anamnese.fcmax) : null,
      fcrep: anamnese.fcrep ? Number(anamnese.fcrep) : null,
      current_volume_weekly: anamnese.current_volume_weekly ? Number(anamnese.current_volume_weekly) : null,
      cardio_goal: anamnese.cardio_goal,
      stress_score: anamnese.stress_score ? Number(anamnese.stress_score) : null,
      sleep_quality: anamnese.sleep_quality ? Number(anamnese.sleep_quality) : null,
      injuries: anamnese.injuries, food_restrictions: anamnese.food_restrictions,
      budget_food: anamnese.budget_food,
      meals_per_day: Number(anamnese.meals_per_day) || 5,
      has_kitchen: anamnese.has_kitchen, notes: anamnese.notes,
      updated_at: new Date().toISOString(),
    };
    if (anamneseId) {
      await supabase.from("student_anamneses").update(payload).eq("id", anamneseId);
      return anamneseId;
    } else {
      const { data } = await supabase.from("student_anamneses").insert(payload).select("id").single();
      setAnamneseId(data.id);
      return data.id;
    }
  }

  // ── Geração sequencial integrada ────────────────────────────────────────
  async function generate() {
    if (!studentId || !companyId) { setError("Selecione um aluno."); return; }
    if (modalities.size === 0) { setError("Selecione ao menos uma prescrição."); return; }
    setGenerating(true); setError("");
    setStatus({ musculacao: "idle", corrida: "idle", nutricao: "idle" });
    setResults({ musculacao: null, corrida: null, nutricao: null });

    let strengthPlan: any = null;
    let runningPlan: any  = null;
    let newBundleId       = crypto.randomUUID();
    setBundleId(newBundleId);

    try {
      // Salva anamnese
      const savedAnamneseId = await saveAnamnese();

      // Busca avaliação funcional mais recente
      const { data: assessment } = await supabase
        .from("functional_assessments").select("assessment_json")
        .eq("student_id", studentId).order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      const assessmentCtx = assessment?.assessment_json ?? null;

      // ── 1. MUSCULAÇÃO ────────────────────────────────────────────────
      if (modalities.has("musculacao")) {
        setStatus(s => ({ ...s, musculacao: "generating" }));
        const { data, error: e } = await supabase.functions.invoke("ai-prescribe-workout", {
          body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: savedAnamneseId,
            // Anamnese
            objective: anamnese.objective, fitness_level: anamnese.activity_level,
            days_per_week: Number(anamnese.days_per_week_strength),
            duration_weeks: 6, equipment: anamnese.equipment,
            block_number: 1,
            is_endurance_athlete: anamnese.is_endurance_athlete,
            restrictions: anamnese.injuries, notes: anamnese.notes,
            // Contexto integrado: dias de corrida pra evitar interferência
            running_days_context: modalities.has("corrida") ? {
              days_per_week: Number(anamnese.days_per_week_cardio),
              sport: anamnese.sport,
            } : null,
            assessment_context: assessmentCtx,
          },
        });
        if (e || data?.error) throw new Error(e?.message || data?.error);
        strengthPlan = data?.plan;
        setResults(r => ({ ...r, musculacao: data?.plan }));
        setStatus(s => ({ ...s, musculacao: "done" }));
      }

      // ── 2. CORRIDA ───────────────────────────────────────────────────
      if (modalities.has("corrida")) {
        setStatus(s => ({ ...s, corrida: "generating" }));
        const { data, error: e } = await supabase.functions.invoke("ai-running-plan", {
          body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: savedAnamneseId,
            sport: anamnese.sport, goal: anamnese.cardio_goal || "Melhora de performance geral",
            duration_weeks: 8,
            days_per_week: Number(anamnese.days_per_week_cardio),
            session_duration: Number(anamnese.session_duration_min),
            current_volume: anamnese.current_volume_weekly ? Number(anamnese.current_volume_weekly) : null,
            fcmax: anamnese.fcmax ? Number(anamnese.fcmax) : null,
            fcrep: anamnese.fcrep ? Number(anamnese.fcrep) : null,
            experience_months: anamnese.experience_months ? Number(anamnese.experience_months) : null,
            tsb: null, eva: {}, injuries: anamnese.injuries,
            diet_type: anamnese.objective,
            // Contexto integrado: plano de força para sincronizar periodização
            strength_plan_context: strengthPlan ? {
              days_per_week: Number(anamnese.days_per_week_strength),
              workouts: strengthPlan.workouts?.map((w: any) => ({
                day: w.day_of_week,
                focus: w.split_focus,
                has_heavy_legs: w.exercises?.some((e: any) =>
                  ["forca_global", "controle_motor"].includes(e.phase) &&
                  ["quadríceps", "posterior", "glúteos"].some(m => e.muscle_group?.toLowerCase().includes(m))
                ),
              })) ?? [],
            } : null,
            assessment_context: assessmentCtx,
          },
        });
        if (e || data?.error) throw new Error(e?.message || data?.error);
        runningPlan = data?.plan;
        setResults(r => ({ ...r, corrida: data?.plan }));
        setStatus(s => ({ ...s, corrida: "done" }));
      }

      // ── 3. NUTRIÇÃO ──────────────────────────────────────────────────
      if (modalities.has("nutricao")) {
        setStatus(s => ({ ...s, nutricao: "generating" }));

        // Busca dados de peso/altura do perfil do aluno
        const { data: studentData } = await supabase
          .from("students").select("weight_kg, height_cm, gender, birth_date")
          .eq("id", studentId).maybeSingle();

        const age = anamnese.age
          ? Number(anamnese.age)
          : studentData?.birth_date
            ? Math.floor((Date.now() - new Date(studentData.birth_date).getTime()) / 31557600000)
            : null;

        const { data, error: e } = await supabase.functions.invoke("ai-nutrition-plan", {
          body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: savedAnamneseId,
            age, gender: studentData?.gender ?? "M",
            weight_kg: studentData?.weight_kg ?? null,
            height_cm: studentData?.height_cm ?? null,
            body_fat_percent: anamnese.body_fat_percent ? Number(anamnese.body_fat_percent) : null,
            objective: anamnese.objective, activity_level: anamnese.activity_level,
            is_endurance_athlete: anamnese.is_endurance_athlete,
            training_hours_per_day: (
              (Number(anamnese.days_per_week_strength) * Number(anamnese.session_duration_min) / 60) +
              (Number(anamnese.days_per_week_cardio) * Number(anamnese.session_duration_min) / 60)
            ) / 7,
            training_modality: anamnese.training_modality || [
              modalities.has("musculacao") ? "musculação" : "",
              modalities.has("corrida") ? anamnese.sport : "",
            ].filter(Boolean).join(" + "),
            meals_per_day: Number(anamnese.meals_per_day),
            food_restrictions: anamnese.food_restrictions,
            stress_score: anamnese.stress_score ? Number(anamnese.stress_score) : null,
            sleep_quality: anamnese.sleep_quality ? Number(anamnese.sleep_quality) : null,
            budget: anamnese.budget_food,
            has_microwave: anamnese.has_kitchen,
            // Contexto integrado: carga total real para cálculo do GET correto
            strength_plan_context: strengthPlan ? {
              sessions_per_week: Number(anamnese.days_per_week_strength),
              session_duration_min: Number(anamnese.session_duration_min),
              estimated_weekly_kcal: Number(anamnese.days_per_week_strength) * Number(anamnese.session_duration_min) / 60 * 450,
            } : null,
            running_plan_context: runningPlan ? {
              sport: anamnese.sport,
              model: runningPlan.model,
              volume_weekly_hours: runningPlan.volume_weekly_hours,
              estimated_weekly_kcal: (runningPlan.volume_weekly_hours ?? 0) * 700,
            } : null,
          },
        });
        if (e || data?.error) throw new Error(e?.message || data?.error);
        setResults(r => ({ ...r, nutricao: data?.plan }));
        setStatus(s => ({ ...s, nutricao: "done" }));
      }

      // Salva bundle de integração
      await supabase.from("prescription_bundles").insert({
        id: newBundleId, company_id: companyId, student_id: studentId,
        anamnese_id: savedAnamneseId,
        has_strength: modalities.has("musculacao"),
        has_cardio:   modalities.has("corrida"),
        has_nutrition: modalities.has("nutricao"),
        status: "active",
      });

    } catch (err: any) {
      setError(err.message);
    }
    setGenerating(false);
  }

  // ── UI helpers ────────────────────────────────────────────────────────
  const inputCls = "h-9 text-sm";
  const Section = ({ id, label, children }: { id: keyof typeof open; label: string; children: React.ReactNode }) => (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/50"
        onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
      >
        {label}
        {open[id] ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
      </button>
      {open[id] && <div className="px-4 pb-4 pt-2 grid gap-3 grid-cols-2 md:grid-cols-3 border-t">{children}</div>}
    </div>
  );
  const F = ({ label, span, children }: { label: string; span?: string; children: React.ReactNode }) => (
    <div className={span}>
      <Label className="text-xs text-muted-foreground mb-1">{label}</Label>
      {children}
    </div>
  );
  const SI = (props: any) => <Input {...props} className={inputCls} />;
  const SS = ({ value, onChange, opts }: any) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
      <SelectContent>{opts.map(([v, l]: [string, string]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );

  const genStatusIcon = (s: GenStatus) => {
    if (s === "generating") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    if (s === "done")       return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (s === "error")      return <AlertCircle className="h-4 w-4 text-destructive" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-bold">Prescrição Integrada</h1>
        <p className="text-sm text-muted-foreground">Anamnese única · IAs em sequência · Periodização sincronizada</p>
      </div>

      {/* ── Aluno ── */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Aluno</CardTitle></CardHeader>
        <CardContent>
          <SS value={studentId} onChange={setStudentId} opts={[["", "Selecione..."], ...students.map(s => [s.id, s.name])]} />
          {anamneseId && <p className="text-xs text-green-600 mt-1">✓ Anamnese salva carregada — edite se necessário</p>}
        </CardContent>
      </Card>

      {studentId && (
        <>
          {/* ── Anamnese ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Anamnese</CardTitle>
              <p className="text-xs text-muted-foreground">Preenchida uma vez — usada por todas as IAs selecionadas</p>
            </CardHeader>
            <CardContent className="space-y-3">

              <Section id="personal" label="📋 Dados Pessoais">
                <F label="Idade"><SI type="number" value={anamnese.age} onChange={e => set("age", e.target.value)} /></F>
                <F label="% Gordura corporal"><SI type="number" step="0.1" value={anamnese.body_fat_percent} onChange={e => set("body_fat_percent", e.target.value)} placeholder="opc." /></F>
                <F label="Objetivo">
                  <SS value={anamnese.objective} onChange={(v: string) => set("objective", v)}
                    opts={[["emagrecimento","Emagrecimento"],["hipertrofia","Hipertrofia"],["performance","Performance"]]} />
                </F>
                <F label="Nível de atividade">
                  <SS value={anamnese.activity_level} onChange={(v: string) => set("activity_level", v)}
                    opts={[["sedentario","Sedentário"],["leve","Leve"],["moderado","Moderado"],["muito_ativo","Muito ativo"],["extremo","Extremo"]]} />
                </F>
                <F label="Lesões / restrições" span="col-span-2 md:col-span-3">
                  <Textarea className="text-sm min-h-[60px]" value={anamnese.injuries} onChange={e => set("injuries", e.target.value)} placeholder="Ex: dor lombar EVA 2, ombro D sensível" />
                </F>
              </Section>

              <Section id="training" label="🏋️ Treino">
                <F label="Dias musculação/semana"><SI type="number" min="0" max="6" value={anamnese.days_per_week_strength} onChange={e => set("days_per_week_strength", e.target.value)} /></F>
                <F label="Dias cardio/semana"><SI type="number" min="0" max="7" value={anamnese.days_per_week_cardio} onChange={e => set("days_per_week_cardio", e.target.value)} /></F>
                <F label="Duração sessão (min)"><SI type="number" value={anamnese.session_duration_min} onChange={e => set("session_duration_min", e.target.value)} /></F>
                <F label="Experiência (meses)"><SI type="number" value={anamnese.experience_months} onChange={e => set("experience_months", e.target.value)} /></F>
                <F label="Equipamento">
                  <SS value={anamnese.equipment} onChange={(v: string) => set("equipment", v)}
                    opts={[["academia_completa","Academia completa"],["casa_halteres","Casa (halteres)"],["funcional","Funcional"]]} />
                </F>
                <F label="Modalidade principal"><SI value={anamnese.training_modality} onChange={e => set("training_modality", e.target.value)} placeholder="Ex: corrida + musculação" /></F>
                <div className="col-span-2 md:col-span-3 flex items-center gap-2 pt-1">
                  <Checkbox checked={anamnese.is_endurance_athlete} onCheckedChange={v => set("is_endurance_athlete", !!v)} id="endurance" />
                  <label htmlFor="endurance" className="text-sm cursor-pointer">Atleta de endurance (corrida / triathlon)</label>
                </div>
              </Section>

              {/* Seção Cardio — aparece quando corrida está selecionado */}
              {(modalities.has("corrida") || open.cardio) && (
                <Section id="cardio" label="🏃 Especifico Corrida / Pedal / Natação">
                  <F label="Modalidade">
                    <SS value={anamnese.sport} onChange={(v: string) => set("sport", v)}
                      opts={[["corrida","Corrida"],["ciclismo","Ciclismo"],["natacao","Natação"],["triathlon","Triathlon"]]} />
                  </F>
                  <F label="Objetivo / prova"><SI value={anamnese.cardio_goal} onChange={e => set("cardio_goal", e.target.value)} placeholder="Ex: Meia maratona em 8 sem." /></F>
                  <F label="Volume atual (km ou h/sem)"><SI type="number" value={anamnese.current_volume_weekly} onChange={e => set("current_volume_weekly", e.target.value)} /></F>
                  <F label="FC máx (bpm)" ><SI type="number" value={anamnese.fcmax} onChange={e => set("fcmax", e.target.value)} placeholder="vazio=220-idade" /></F>
                  <F label="FC repouso (bpm)"><SI type="number" value={anamnese.fcrep} onChange={e => set("fcrep", e.target.value)} placeholder="vazio=65" /></F>
                </Section>
              )}

              <Section id="health" label="💊 Saúde e Bem-Estar">
                <F label="Estresse (0-10)"><SI type="number" min="0" max="10" value={anamnese.stress_score} onChange={e => set("stress_score", e.target.value)} /></F>
                <F label="Qualidade sono (0-10)"><SI type="number" min="0" max="10" value={anamnese.sleep_quality} onChange={e => set("sleep_quality", e.target.value)} /></F>
              </Section>

              {/* Seção Nutrição — aparece quando nutrição está selecionado */}
              {(modalities.has("nutricao") || open.nutri) && (
                <Section id="nutri" label="🍎 Nutrição">
                  <F label="Orçamento alimentar">
                    <SS value={anamnese.budget_food} onChange={(v: string) => set("budget_food", v)}
                      opts={[["economico","Econômico"],["moderado","Moderado"],["premium","Premium"]]} />
                  </F>
                  <F label="Refeições/dia">
                    <SS value={anamnese.meals_per_day} onChange={(v: string) => set("meals_per_day", v)}
                      opts={[["4","4"],["5","5"],["6","6"]]} />
                  </F>
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox checked={anamnese.has_kitchen} onCheckedChange={v => set("has_kitchen", !!v)} id="kitchen" />
                    <label htmlFor="kitchen" className="text-sm cursor-pointer">Tem cozinha / micro-ondas</label>
                  </div>
                  <F label="Restrições alimentares" span="col-span-2 md:col-span-3">
                    <Textarea className="text-sm min-h-[56px]" value={anamnese.food_restrictions} onChange={e => set("food_restrictions", e.target.value)} placeholder="Ex: intolerância à lactose, vegetariano" />
                  </F>
                </Section>
              )}

            </CardContent>
          </Card>

          {/* ── Selecionar prescrições ── */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Quais prescrições gerar?</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["musculacao", "🏋️", "Musculação", "Força + biomecânica BN"],
                  ["corrida",    "🏃", "Corrida / Pedal / Natação", "Zonas FC + periodização"],
                  ["nutricao",   "🍎", "Nutrição", "Macros + carb cycling"],
                ] as [Modality, string, string, string][]).map(([mod, icon, label, sub]) => (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => toggleMod(mod)}
                    className={`rounded-lg border-2 p-3 text-left transition ${
                      modalities.has(mod)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="text-xl mb-1">{icon}</div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{sub}</div>
                  </button>
                ))}
              </div>

              {/* Status da geração */}
              {(generating || Object.values(status).some(s => s !== "idle")) && (
                <div className="mt-4 space-y-2 border rounded-lg p-4 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground mb-2">PROGRESSO DA GERAÇÃO</p>
                  {modalities.has("musculacao") && (
                    <div className="flex items-center gap-2 text-sm">
                      {genStatusIcon(status.musculacao)}
                      <span>Musculação {status.musculacao === "generating" ? "— gerando plano de força…" : status.musculacao === "done" ? "— concluído" : ""}</span>
                    </div>
                  )}
                  {modalities.has("corrida") && (
                    <div className="flex items-center gap-2 text-sm">
                      {genStatusIcon(status.corrida)}
                      <span>Corrida {status.corrida === "generating" ? "— calculando zonas FC e periodização…" : status.corrida === "done" ? "— concluído" : ""}</span>
                      {modalities.has("musculacao") && status.corrida !== "idle" && (
                        <Badge variant="outline" className="text-xs">sincroniza com musculação</Badge>
                      )}
                    </div>
                  )}
                  {modalities.has("nutricao") && (
                    <div className="flex items-center gap-2 text-sm">
                      {genStatusIcon(status.nutricao)}
                      <span>Nutrição {status.nutricao === "generating" ? "— calculando GET total e macros…" : status.nutricao === "done" ? "— concluído" : ""}</span>
                      {(modalities.has("musculacao") || modalities.has("corrida")) && status.nutricao !== "idle" && (
                        <Badge variant="outline" className="text-xs">GET baseado na carga total</Badge>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-destructive mt-3">{error}</p>}

              <Button className="w-full mt-4" onClick={generate} disabled={generating || modalities.size === 0}>
                {generating
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando prescrições…</>
                  : `Gerar ${modalities.size} prescrição${modalities.size > 1 ? "ões" : ""} integrada${modalities.size > 1 ? "s" : ""}`
                }
              </Button>
            </CardContent>
          </Card>

          {/* ── Resultados ── */}
          {Object.values(results).some(Boolean) && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Prescrições Geradas</h2>
              {results.musculacao && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Dumbbell className="h-4 w-4" /> Musculação — {results.musculacao.cycle_name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{results.musculacao.objective} · {results.musculacao.duration_weeks} semanas · Bloco {results.musculacao.block}</p>
                  </CardHeader>
                  <CardContent>
                    {results.musculacao.biomechanical_notes && (
                      <p className="text-xs bg-muted rounded p-2 mb-3">{results.musculacao.biomechanical_notes}</p>
                    )}
                    <div className="space-y-2">
                      {results.musculacao.workouts?.map((w: any, i: number) => (
                        <div key={i} className="text-sm border-l-2 border-primary pl-3">
                          <span className="font-medium">{w.name}</span>
                          <span className="text-muted-foreground text-xs ml-2">{w.split_focus} · {w.duration_min}min</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {results.corrida && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" /> {results.corrida.plan_name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{results.corrida.sport} · modelo {results.corrida.model} · {results.corrida.duration_weeks} semanas</p>
                  </CardHeader>
                  <CardContent>
                    {results.corrida.fc_zones && (
                      <div className="grid grid-cols-5 gap-1 text-xs text-center mb-3">
                        {["z1","z2","z3","z4","z5"].map(z => results.corrida.fc_zones[z] && (
                          <div key={z} className="border rounded p-1">
                            <div className="font-medium uppercase">{z}</div>
                            <div className="text-muted-foreground">{results.corrida.fc_zones[z].min}–{results.corrida.fc_zones[z].max}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {results.corrida.warnings?.length > 0 && (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded p-2 mb-2">{results.corrida.warnings[0]}</p>
                    )}
                  </CardContent>
                </Card>
              )}
              {results.nutricao && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Apple className="h-4 w-4" /> {results.nutricao.plan_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {results.nutricao.energy_summary && (
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="border rounded p-2 text-center">
                          <div className="font-bold">{results.nutricao.energy_summary.target_kcal} kcal</div>
                          <div className="text-xs text-muted-foreground">Meta diária</div>
                        </div>
                        <div className="border rounded p-2 text-center">
                          <div className="font-bold">{results.nutricao.energy_summary.protein_total_g}g</div>
                          <div className="text-xs text-muted-foreground">Proteína</div>
                        </div>
                        <div className="border rounded p-2 text-center">
                          <div className="font-bold">{results.nutricao.energy_summary.carbs_total_g}g</div>
                          <div className="text-xs text-muted-foreground">Carboidrato</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

BNEOF_SRC_PAGES_ADMIN_UNIFIEDPRESCRIBER_TSX

echo "📝 src/components/MusculacaoPrescriber.tsx"
mkdir -p "src/components"
cat > 'src/components/MusculacaoPrescriber.tsx' << 'BNEOF_SRC_COMPONENTS_MUSCULACAOPRESCRIBER_TSX'
// ============================================================================
// MusculacaoPrescriber.tsx — BN Performance Training
// Cole em: src/components/MusculacaoPrescriber.tsx
// Chama a edge function: ai-prescribe-workout
// ============================================================================
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Dumbbell } from "lucide-react";

interface Student {
  id: string;
  name: string;
}

const PHASE_LABELS: Record<string, string> = {
  mobilidade: "1. Mobilidade",
  ativacao_core: "2. Ativação Core",
  ativacao_especifica: "3. Ativação Específica",
  controle_motor: "4. Controle Motor",
  pliometria: "5. Pliometria",
  forca_global: "6. Força Global",
  forca_especifica: "7. Força Específica",
};

export default function MusculacaoPrescriber() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    student_id: "",
    objective: "hipertrofia",
    fitness_level: "intermediario",
    days_per_week: "3",
    duration_weeks: "6",
    equipment: "academia_completa",
    block_number: "1",
    is_endurance_athlete: "false",
    restrictions: "",
    notes: "",
  });

  // Busca company_id e alunos
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!member) return;
      setCompanyId(member.company_id);
      const { data: studentList } = await supabase
        .from("students")
        .select("id, name")
        .eq("company_id", member.company_id)
        .order("name");
      setStudents(studentList || []);
    })();
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.student_id) { setError("Selecione um aluno."); return; }
    setLoading(true); setError(null); setPlan(null);

    const student = students.find((s) => s.id === form.student_id);

    // Busca avaliação funcional mais recente (alimenta a biomecânica)
    let assessment_context = null;
    const { data: assessment } = await supabase
      .from("functional_assessments")
      .select("assessment_json")
      .eq("student_id", form.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assessment?.assessment_json) assessment_context = assessment.assessment_json;

    const { data, error: fnError } = await supabase.functions.invoke(
      "ai-prescribe-workout",
      {
        body: {
          student_id: form.student_id,
          student_name: student?.name,
          company_id: companyId,
          objective: form.objective,
          fitness_level: form.fitness_level,
          days_per_week: Number(form.days_per_week),
          duration_weeks: Number(form.duration_weeks),
          equipment: form.equipment,
          block_number: Number(form.block_number),
          is_endurance_athlete: form.is_endurance_athlete === "true",
          restrictions: form.restrictions,
          notes: form.notes,
          assessment_context,
        },
      }
    );

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    setPlan(data?.plan);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5" /> Prescrição de Musculação — Metodologia BN
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Aluno</Label>
            <Select value={form.student_id} onValueChange={(v) => set("student_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Objetivo</Label>
            <Select value={form.objective} onValueChange={(v) => set("objective", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hipertrofia">Hipertrofia</SelectItem>
                <SelectItem value="forca">Força máxima</SelectItem>
                <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Nível</Label>
            <Select value={form.fitness_level} onValueChange={(v) => set("fitness_level", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="iniciante">Iniciante</SelectItem>
                <SelectItem value="intermediario">Intermediário</SelectItem>
                <SelectItem value="avancado">Avançado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Dias por semana</Label>
            <Input type="number" min="1" max="6" value={form.days_per_week}
              onChange={(e) => set("days_per_week", e.target.value)} />
          </div>

          <div>
            <Label>Duração (semanas)</Label>
            <Input type="number" min="1" max="16" value={form.duration_weeks}
              onChange={(e) => set("duration_weeks", e.target.value)} />
          </div>

          <div>
            <Label>Bloco</Label>
            <Select value={form.block_number} onValueChange={(v) => set("block_number", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Bloco 1 (sem pliometria)</SelectItem>
                <SelectItem value="2">Bloco 2 (pliometria liberada)</SelectItem>
                <SelectItem value="3">Bloco 3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Equipamento</Label>
            <Select value={form.equipment} onValueChange={(v) => set("equipment", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="academia_completa">Academia completa</SelectItem>
                <SelectItem value="casa_halteres">Casa (halteres)</SelectItem>
                <SelectItem value="funcional">Funcional / peso corporal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>Atleta de endurance? (corrida/triathlon)</Label>
            <Select value={form.is_endurance_athlete} onValueChange={(v) => set("is_endurance_athlete", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Não</SelectItem>
                <SelectItem value="true">Sim (aplicar anti-interferência)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>Restrições / Lesões</Label>
            <Textarea value={form.restrictions} placeholder="Ex: dor lombar EVA 2, ombro direito sensível"
              onChange={(e) => set("restrictions", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>Observações adicionais</Label>
            <Textarea value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando plano…</> : "Gerar Plano de Treino"}
            </Button>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
        </CardContent>
      </Card>

      {plan && <PlanView plan={plan} />}
    </div>
  );
}

function PlanView({ plan }: { plan: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.cycle_name}</CardTitle>
        <p className="text-sm text-muted-foreground">{plan.objective} • {plan.duration_weeks} semanas • Bloco {plan.block}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {plan.biomechanical_notes && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Adaptações biomecânicas:</strong> {plan.biomechanical_notes}
          </div>
        )}

        {plan.warnings?.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <strong className="text-destructive">Alertas:</strong>
            <ul className="list-disc pl-5 mt-1">
              {plan.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {plan.workouts?.map((w: any, i: number) => (
          <div key={i} className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg">{w.name}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {w.split_focus} • {w.duration_min} min
            </p>
            <div className="space-y-2">
              {w.exercises?.map((ex: any, j: number) => (
                <div key={j} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-medium">{ex.exercise_name}</span>
                    <span className="text-xs text-muted-foreground">{PHASE_LABELS[ex.phase] || ex.phase}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {ex.sets}x{ex.reps}
                    {ex.load_percent_1rm && ex.load_percent_1rm !== "null" ? ` • ${ex.load_percent_1rm}` : ""}
                    {ex.rir ? ` • RIR ${ex.rir}` : ""}
                    {ex.tempo ? ` • Tempo ${ex.tempo}` : ""}
                    {ex.rest_seconds ? ` • ${ex.rest_seconds}s descanso` : ""}
                  </div>
                  {ex.cues && <div className="text-xs italic mt-0.5">💡 {ex.cues}</div>}
                  {ex.biomechanical_note && <div className="text-xs text-blue-600 mt-0.5">🔧 {ex.biomechanical_note}</div>}
                </div>
              ))}
            </div>
            {w.notes && <p className="text-xs text-muted-foreground mt-3">{w.notes}</p>}
          </div>
        ))}

        {plan.progression_protocol && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Progressão:</strong> {plan.progression_protocol}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

BNEOF_SRC_COMPONENTS_MUSCULACAOPRESCRIBER_TSX

echo "📝 src/components/CorridaPrescriber.tsx"
mkdir -p "src/components"
cat > 'src/components/CorridaPrescriber.tsx' << 'BNEOF_SRC_COMPONENTS_CORRIDAPRESCRIBER_TSX'
// ============================================================================
// CorridaPrescriber.tsx — BN Performance Training
// Cole em: src/components/CorridaPrescriber.tsx
// Chama a edge function: ai-running-plan
// Cobre: corrida, ciclismo, natação, triathlon
// ============================================================================
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Activity } from "lucide-react";

interface Student { id: string; name: string; }

export default function CorridaPrescriber() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    student_id: "",
    sport: "corrida",
    goal: "",
    duration_weeks: "8",
    days_per_week: "4",
    session_duration: "60",
    current_volume: "",
    fcmax: "",
    fcrep: "",
    experience_months: "",
    tsb: "",
    eva_joelho: "0",
    eva_tornozelo: "0",
    eva_quadril: "0",
    eva_lombar: "0",
    injuries: "",
    equipment: "",
    diet_type: "performance",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!member) return;
      setCompanyId(member.company_id);
      const { data: list } = await supabase
        .from("students")
        .select("id, name")
        .eq("company_id", member.company_id)
        .order("name");
      setStudents(list || []);
    })();
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.student_id) { setError("Selecione um aluno."); return; }
    if (!form.goal) { setError("Informe o objetivo/prova."); return; }
    setLoading(true); setError(null); setPlan(null);

    const student = students.find((s) => s.id === form.student_id);

    // Avaliação funcional (opcional) para ajustar exercícios complementares
    let assessment_context = null;
    const { data: assessment } = await supabase
      .from("functional_assessments")
      .select("assessment_json")
      .eq("student_id", form.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assessment?.assessment_json) assessment_context = assessment.assessment_json;

    const eva = {
      joelho: Number(form.eva_joelho),
      tornozelo: Number(form.eva_tornozelo),
      quadril: Number(form.eva_quadril),
      lombar: Number(form.eva_lombar),
    };

    const { data, error: fnError } = await supabase.functions.invoke(
      "ai-running-plan",
      {
        body: {
          student_id: form.student_id,
          student_name: student?.name,
          company_id: companyId,
          sport: form.sport,
          goal: form.goal,
          duration_weeks: Number(form.duration_weeks),
          days_per_week: Number(form.days_per_week),
          session_duration: Number(form.session_duration),
          current_volume: form.current_volume ? Number(form.current_volume) : null,
          fcmax: form.fcmax ? Number(form.fcmax) : null,
          fcrep: form.fcrep ? Number(form.fcrep) : null,
          experience_months: form.experience_months ? Number(form.experience_months) : null,
          tsb: form.tsb ? Number(form.tsb) : null,
          eva,
          injuries: form.injuries,
          equipment: form.equipment,
          diet_type: form.diet_type,
          assessment_context,
        },
      }
    );

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    setPlan(data?.plan);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Prescrição de Performance Cíclica — Metodologia BN
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Aluno</Label>
            <Select value={form.student_id} onValueChange={(v) => set("student_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Modalidade</Label>
            <Select value={form.sport} onValueChange={(v) => set("sport", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrida">Corrida</SelectItem>
                <SelectItem value="ciclismo">Ciclismo</SelectItem>
                <SelectItem value="natacao">Natação</SelectItem>
                <SelectItem value="triathlon">Triathlon</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Objetivo / Prova</Label>
            <Input value={form.goal} placeholder="Ex: Maratona em 12 semanas"
              onChange={(e) => set("goal", e.target.value)} />
          </div>

          <div>
            <Label>Duração do plano (semanas)</Label>
            <Input type="number" min="1" max="24" value={form.duration_weeks}
              onChange={(e) => set("duration_weeks", e.target.value)} />
          </div>

          <div>
            <Label>Dias por semana</Label>
            <Input type="number" min="1" max="7" value={form.days_per_week}
              onChange={(e) => set("days_per_week", e.target.value)} />
          </div>

          <div>
            <Label>Minutos por sessão</Label>
            <Input type="number" min="20" max="240" value={form.session_duration}
              onChange={(e) => set("session_duration", e.target.value)} />
          </div>

          <div>
            <Label>Volume atual (km ou h/semana)</Label>
            <Input type="number" value={form.current_volume} placeholder="Ex: 40"
              onChange={(e) => set("current_volume", e.target.value)} />
          </div>

          <div>
            <Label>FC máxima (bpm) <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" value={form.fcmax} placeholder="Estima 220-idade se vazio"
              onChange={(e) => set("fcmax", e.target.value)} />
          </div>

          <div>
            <Label>FC repouso (bpm) <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" value={form.fcrep} placeholder="Padrão 65 se vazio"
              onChange={(e) => set("fcrep", e.target.value)} />
          </div>

          <div>
            <Label>Experiência (meses)</Label>
            <Input type="number" value={form.experience_months} placeholder="Ex: 18"
              onChange={(e) => set("experience_months", e.target.value)} />
          </div>

          <div>
            <Label>TSB atual <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" value={form.tsb} placeholder="Ex: -12"
              onChange={(e) => set("tsb", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>EVA por articulação (0 = sem dor, 10 = dor máxima)</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {["tornozelo", "joelho", "quadril", "lombar"].map((j) => (
                <div key={j}>
                  <span className="text-xs capitalize">{j}</span>
                  <Input type="number" min="0" max="10"
                    value={(form as any)[`eva_${j}`]}
                    onChange={(e) => set(`eva_${j}`, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Tipo de dieta</Label>
            <Select value={form.diet_type} onValueChange={(v) => set("diet_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                <SelectItem value="hipertrofia">Hipertrofia</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Equipamento</Label>
            <Input value={form.equipment} placeholder="Ex: rua + esteira"
              onChange={(e) => set("equipment", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>Lesões / histórico</Label>
            <Textarea value={form.injuries} placeholder="Ex: tendinopatia de Aquiles D"
              onChange={(e) => set("injuries", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando plano…</> : "Gerar Plano de Treino"}
            </Button>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
        </CardContent>
      </Card>

      {plan && <RunPlanView plan={plan} />}
    </div>
  );
}

function RunPlanView({ plan }: { plan: any }) {
  const z = plan.fc_zones;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.plan_name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {plan.sport} • modelo {plan.model} • {plan.duration_weeks} semanas
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Zonas de FC */}
        {z && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Zonas de FC (Karvonen)</strong>
            {z.estimated && <span className="text-amber-600 text-xs ml-2">⚠️ valores estimados</span>}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
              {["z1", "z2", "z3", "z4", "z5"].map((zk) => (
                z[zk] && (
                  <div key={zk} className="text-center border rounded p-2">
                    <div className="font-medium uppercase">{zk}</div>
                    <div className="text-xs text-muted-foreground">{z[zk].min}–{z[zk].max} bpm</div>
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {/* Safety check */}
        {plan.safety_check && (
          <div className="rounded-lg border p-4 text-sm space-y-1">
            <div>TSB: <Badge status={plan.safety_check.tsb_status} /></div>
            <div>EVA: <Badge status={plan.safety_check.eva_status} /></div>
            {plan.safety_check.restrictions?.length > 0 && (
              <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                {plan.safety_check.restrictions.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        )}

        {plan.warnings?.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <strong className="text-destructive">Alertas:</strong>
            <ul className="list-disc pl-5 mt-1">
              {plan.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Semanas */}
        {plan.weeks?.map((week: any, i: number) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <h3 className="font-semibold">Semana {week.week_number} — {week.type}</h3>
              <span className="text-xs text-muted-foreground">
                {week.volume_km ? `${week.volume_km} km` : ""} • TSS ~{week.tss_total_estimado}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{week.focus}</p>
            <div className="space-y-1">
              {week.sessions?.map((s: any, j: number) => (
                <div key={j} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                  <span className="font-medium">{s.day}: {s.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">{s.zone} • {s.total_min}min</span>
                  {s.fc_target && <div className="text-xs">{s.fc_target}</div>}
                  {s.intervals && s.intervals !== "null" && <div className="text-xs">⏱ {s.intervals}</div>}
                  {s.notes && <div className="text-xs italic text-muted-foreground">{s.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {plan.complementary_strength?.length > 0 && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Força complementar:</strong>
            <ul className="list-disc pl-5 mt-1">
              {plan.complementary_strength.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {plan.nutrition_alert && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Nutrição:</strong> {plan.nutrition_alert}
          </div>
        )}

        {plan.general_tips && (
          <div className="text-sm text-muted-foreground whitespace-pre-line">{plan.general_tips}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    atencao: "bg-amber-100 text-amber-800",
    linha_vermelha: "bg-red-100 text-red-800",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${map[status] || ""}`}>{status}</span>;
}

BNEOF_SRC_COMPONENTS_CORRIDAPRESCRIBER_TSX

echo "📝 src/components/NutricaoPrescriber.tsx"
mkdir -p "src/components"
cat > 'src/components/NutricaoPrescriber.tsx' << 'BNEOF_SRC_COMPONENTS_NUTRICAOPRESCRIBER_TSX'
// ============================================================================
// NutricaoPrescriber.tsx — BN Performance Training
// Cole em: src/components/NutricaoPrescriber.tsx
// Chama a edge function: ai-nutrition-plan
// ============================================================================
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Apple } from "lucide-react";

interface Student { id: string; name: string; }

export default function NutricaoPrescriber() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    student_id: "",
    age: "",
    gender: "M",
    weight_kg: "",
    height_cm: "",
    body_fat_percent: "",
    objective: "performance",
    activity_level: "moderado",
    is_endurance_athlete: "false",
    training_hours_per_day: "1",
    training_modality: "",
    meals_per_day: "5",
    food_restrictions: "",
    stress_score: "",
    sleep_quality: "",
    budget: "moderado",
    has_microwave: "true",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!member) return;
      setCompanyId(member.company_id);
      const { data: list } = await supabase
        .from("students")
        .select("id, name")
        .eq("company_id", member.company_id)
        .order("name");
      setStudents(list || []);
    })();
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.student_id) { setError("Selecione um aluno."); return; }
    if (!form.weight_kg || !form.height_cm || !form.age) {
      setError("Preencha idade, peso e altura."); return;
    }
    setLoading(true); setError(null); setPlan(null);

    const student = students.find((s) => s.id === form.student_id);

    // Puxa o plano de corrida ativo para sincronizar o gasto energético
    let running_plan_context = null;
    const { data: rp } = await supabase
      .from("running_plans")
      .select("sport, model, duration_weeks, weeks")
      .eq("student_id", form.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rp) running_plan_context = rp;

    const { data, error: fnError } = await supabase.functions.invoke(
      "ai-nutrition-plan",
      {
        body: {
          student_id: form.student_id,
          student_name: student?.name,
          company_id: companyId,
          age: Number(form.age),
          gender: form.gender,
          weight_kg: Number(form.weight_kg),
          height_cm: Number(form.height_cm),
          body_fat_percent: form.body_fat_percent ? Number(form.body_fat_percent) : null,
          objective: form.objective,
          activity_level: form.activity_level,
          is_endurance_athlete: form.is_endurance_athlete === "true",
          training_hours_per_day: Number(form.training_hours_per_day),
          training_modality: form.training_modality,
          meals_per_day: Number(form.meals_per_day),
          food_restrictions: form.food_restrictions,
          stress_score: form.stress_score ? Number(form.stress_score) : null,
          sleep_quality: form.sleep_quality ? Number(form.sleep_quality) : null,
          budget: form.budget,
          has_microwave: form.has_microwave === "true",
          running_plan_context,
        },
      }
    );

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    setPlan(data?.plan);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Apple className="h-5 w-5" /> Prescrição Nutricional — Metodologia BN Nutri
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Aluno</Label>
            <Select value={form.student_id} onValueChange={(v) => set("student_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Idade</Label>
            <Input type="number" value={form.age} onChange={(e) => set("age", e.target.value)} />
          </div>
          <div>
            <Label>Sexo</Label>
            <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Feminino</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Peso (kg)</Label>
            <Input type="number" step="0.1" value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} />
          </div>
          <div>
            <Label>Altura (cm)</Label>
            <Input type="number" value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
          </div>
          <div>
            <Label>% Gordura <span className="text-xs text-muted-foreground">opcional (usa Katch-McArdle)</span></Label>
            <Input type="number" step="0.1" value={form.body_fat_percent}
              onChange={(e) => set("body_fat_percent", e.target.value)} />
          </div>

          <div>
            <Label>Objetivo</Label>
            <Select value={form.objective} onValueChange={(v) => set("objective", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                <SelectItem value="hipertrofia">Hipertrofia</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Nível de atividade</Label>
            <Select value={form.activity_level} onValueChange={(v) => set("activity_level", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentario">Sedentário</SelectItem>
                <SelectItem value="leve">Levemente ativo</SelectItem>
                <SelectItem value="moderado">Moderadamente ativo</SelectItem>
                <SelectItem value="muito_ativo">Muito ativo</SelectItem>
                <SelectItem value="extremo">Extremamente ativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Atleta de endurance?</Label>
            <Select value={form.is_endurance_athlete} onValueChange={(v) => set("is_endurance_athlete", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Não</SelectItem>
                <SelectItem value="true">Sim</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Horas de treino/dia</Label>
            <Input type="number" step="0.5" value={form.training_hours_per_day}
              onChange={(e) => set("training_hours_per_day", e.target.value)} />
          </div>

          <div>
            <Label>Modalidade principal</Label>
            <Input value={form.training_modality} placeholder="Ex: corrida + musculação"
              onChange={(e) => set("training_modality", e.target.value)} />
          </div>

          <div>
            <Label>Refeições por dia</Label>
            <Select value={form.meals_per_day} onValueChange={(v) => set("meals_per_day", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="6">6</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Estresse (0-10) <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" min="0" max="10" value={form.stress_score}
              onChange={(e) => set("stress_score", e.target.value)} />
          </div>
          <div>
            <Label>Sono (0-10) <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" min="0" max="10" value={form.sleep_quality}
              onChange={(e) => set("sleep_quality", e.target.value)} />
          </div>

          <div>
            <Label>Orçamento</Label>
            <Select value={form.budget} onValueChange={(v) => set("budget", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="economico">Econômico</SelectItem>
                <SelectItem value="moderado">Moderado</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tem cozinha/micro-ondas?</Label>
            <Select value={form.has_microwave} onValueChange={(v) => set("has_microwave", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>Restrições alimentares</Label>
            <Textarea value={form.food_restrictions} placeholder="Ex: intolerância à lactose, vegetariano"
              onChange={(e) => set("food_restrictions", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando plano…</> : "Gerar Plano Nutricional"}
            </Button>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
        </CardContent>
      </Card>

      {plan && <NutritionView plan={plan} />}
    </div>
  );
}

function NutritionView({ plan }: { plan: any }) {
  const e = plan.energy_summary;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.plan_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resumo energético */}
        {e && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Metas energéticas</strong>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              <Metric label="TMB" value={`${e.tmb_kcal} kcal`} />
              <Metric label="GET" value={`${e.get_kcal} kcal`} />
              <Metric label="Meta" value={`${e.target_kcal} kcal`} />
              <Metric label="Água" value={`${e.hydration_ml} ml`} />
              <Metric label="Proteína" value={`${e.protein_total_g}g (${e.protein_g_per_kg}/kg)`} />
              <Metric label="Carbo" value={`${e.carbs_total_g}g (${e.carbs_g_per_kg}/kg)`} />
              <Metric label="Gordura" value={`${e.fat_total_g}g (${e.fat_g_per_kg}/kg)`} />
              <Metric label="Fórmula" value={e.formula_used} />
            </div>
            {e.calculation_notes && (
              <p className="text-xs text-muted-foreground mt-2">{e.calculation_notes}</p>
            )}
          </div>
        )}

        {/* Carb cycling */}
        {plan.carb_cycling && (
          <div className="rounded-lg border p-4 text-sm">
            <strong>Carb cycling</strong>
            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
              <div className="border rounded p-2">
                <div className="font-medium">Dia alto</div>
                <div className="text-xs">{plan.carb_cycling.high_day_carbs_g}g CHO</div>
                <div className="text-xs text-muted-foreground">{plan.carb_cycling.high_day_kcal} kcal</div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium">Dia moderado</div>
                <div className="text-xs">{plan.carb_cycling.moderate_day_carbs_g}g CHO</div>
                <div className="text-xs text-muted-foreground">{plan.carb_cycling.moderate_day_kcal} kcal</div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium">Descanso</div>
                <div className="text-xs">{plan.carb_cycling.rest_day_carbs_g}g CHO</div>
                <div className="text-xs text-muted-foreground">{plan.carb_cycling.rest_day_kcal} kcal</div>
              </div>
            </div>
          </div>
        )}

        {plan.warnings?.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <strong className="text-destructive">Alertas:</strong>
            <ul className="list-disc pl-5 mt-1">
              {plan.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Refeições */}
        {plan.daily_meals?.map((meal: any, i: number) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <h3 className="font-semibold">{meal.meal_name} <span className="text-sm text-muted-foreground">{meal.time}</span></h3>
              <span className="text-xs text-muted-foreground">
                {meal.calories} kcal • P{meal.protein_g} C{meal.carbs_g} G{meal.fat_g}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {meal.foods?.map((food: any, j: number) => (
                <div key={j} className="text-sm flex justify-between border-l-2 border-primary/40 pl-3 py-0.5">
                  <span>{food.name} <span className="text-muted-foreground">— {food.quantity}</span></span>
                  <span className="text-xs text-muted-foreground">P{food.protein_g} C{food.carbs_g} G{food.fat_g}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Suplementação */}
        {plan.supplementation?.length > 0 && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Suplementação</strong>
            <div className="mt-2 space-y-1">
              {plan.supplementation.map((s: any, i: number) => (
                <div key={i} className="border-l-2 border-primary/40 pl-3 py-0.5">
                  <span className="font-medium">{s.supplement}</span> — {s.dose} • {s.timing}
                  <div className="text-xs text-muted-foreground">{s.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Substituições */}
        {plan.substitutions?.length > 0 && (
          <div className="rounded-lg border p-4 text-sm">
            <strong>Substituições</strong>
            <div className="mt-2 space-y-1">
              {plan.substitutions.map((s: any, i: number) => (
                <div key={i}><span className="font-medium">{s.original}:</span> {s.alternatives?.join(", ")}</div>
              ))}
            </div>
          </div>
        )}

        {plan.pre_race_gi_protocol && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Protocolo GI pré-prova:</strong> {plan.pre_race_gi_protocol}
          </div>
        )}
        {plan.intra_workout_protocol && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Intra-treino:</strong> {plan.intra_workout_protocol}
          </div>
        )}
        {plan.rest_day_adjustments && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Dias de descanso:</strong> {plan.rest_day_adjustments}
          </div>
        )}
        {plan.general_notes && (
          <div className="text-sm text-muted-foreground whitespace-pre-line">{plan.general_notes}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

BNEOF_SRC_COMPONENTS_NUTRICAOPRESCRIBER_TSX

echo "📝 supabase/migrations/20260601_integracao_prescricoes.sql"
mkdir -p "supabase/migrations"
cat > 'supabase/migrations/20260601_integracao_prescricoes.sql' << 'BNEOF_SUPABASE_MIGRATIONS_20260601_INTEGRACAO_PRESCRICOES_SQL'
-- ============================================================================
-- MIGRAÇÃO: Sistema de Prescrições Integradas BN Performance Training
-- Rodar no Supabase SQL Editor
-- ============================================================================

-- ── 1. Tabela de Anamnese Única ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_anamneses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  company_id            UUID NOT NULL REFERENCES companies(id),

  -- Dados pessoais (complementam students)
  age                   INT,
  body_fat_percent      DECIMAL(5,2),

  -- Objetivo e perfil de treino
  objective             TEXT,          -- emagrecimento | hipertrofia | performance
  activity_level        TEXT,          -- sedentario | leve | moderado | muito_ativo | extremo
  is_endurance_athlete  BOOLEAN DEFAULT FALSE,
  training_modality     TEXT,          -- ex: "corrida + musculação"
  days_per_week_strength INT,
  days_per_week_cardio   INT,
  session_duration_min   INT,
  equipment             TEXT,
  experience_months     INT,

  -- Especifico corrida/cardio
  sport                 TEXT,          -- corrida | ciclismo | natacao | triathlon
  fcmax                 INT,
  fcrep                 INT,
  current_volume_weekly DECIMAL,       -- km ou horas/semana
  cardio_goal           TEXT,          -- ex: "Maratona em 12 semanas"

  -- Saúde e bem-estar
  stress_score          INT CHECK (stress_score BETWEEN 0 AND 10),
  sleep_quality         INT CHECK (sleep_quality BETWEEN 0 AND 10),
  injuries              TEXT,

  -- Nutrição
  food_restrictions     TEXT,
  budget_food           TEXT,          -- economico | moderado | premium
  meals_per_day         INT DEFAULT 5,
  has_kitchen           BOOLEAN DEFAULT TRUE,

  -- Observações livres
  notes                 TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT student_anamneses_unique UNIQUE (student_id)
);

-- ── 2. Tabela de Planos Integrados (vínculo entre prescrições) ────────────
-- Agrupa as prescrições de um mesmo ciclo de periodização
CREATE TABLE IF NOT EXISTS prescription_bundles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  anamnese_id           UUID REFERENCES student_anamneses(id),

  -- Referências para as prescrições geradas neste bundle
  training_cycle_id     UUID REFERENCES training_cycles(id),
  running_plan_id       UUID REFERENCES running_plans(id),
  nutrition_plan_id     UUID REFERENCES nutrition_plans(id),

  -- Modalities selecionadas
  has_strength          BOOLEAN DEFAULT FALSE,
  has_cardio            BOOLEAN DEFAULT FALSE,
  has_nutrition         BOOLEAN DEFAULT FALSE,

  status                TEXT DEFAULT 'active',  -- active | archived
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE student_anamneses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anamneses_company_access" ON student_anamneses
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "bundles_company_access" ON prescription_bundles
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- RLS para o portal do aluno ver sua própria anamnese
CREATE POLICY "students_read_own_anamnese" ON student_anamneses
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- ── 4. Índices ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_anamneses_student   ON student_anamneses(student_id);
CREATE INDEX IF NOT EXISTS idx_anamneses_company   ON student_anamneses(company_id);
CREATE INDEX IF NOT EXISTS idx_bundles_student     ON prescription_bundles(student_id);
CREATE INDEX IF NOT EXISTS idx_bundles_company     ON prescription_bundles(company_id);

-- ── 5. Colunas extras em running_plans (se ainda não existirem) ───────────
ALTER TABLE running_plans
  ADD COLUMN IF NOT EXISTS anamnese_id UUID REFERENCES student_anamneses(id),
  ADD COLUMN IF NOT EXISTS bundle_id   UUID REFERENCES prescription_bundles(id);

ALTER TABLE training_cycles
  ADD COLUMN IF NOT EXISTS anamnese_id UUID REFERENCES student_anamneses(id),
  ADD COLUMN IF NOT EXISTS bundle_id   UUID REFERENCES prescription_bundles(id);

ALTER TABLE nutrition_plans
  ADD COLUMN IF NOT EXISTS anamnese_id UUID REFERENCES student_anamneses(id),
  ADD COLUMN IF NOT EXISTS bundle_id   UUID REFERENCES prescription_bundles(id);

-- ── 6. Notificar schema cache ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

BNEOF_SUPABASE_MIGRATIONS_20260601_INTEGRACAO_PRESCRICOES_SQL

echo "📝 docs/integracao_ias_bn.md"
mkdir -p "docs"
cat > 'docs/integracao_ias_bn.md' << 'BNEOF_DOCS_INTEGRACAO_IAS_BN_MD'
# Integração IAs BN Performance Training

================================================================================
  INTEGRAÇÃO DAS EDGE FUNCTIONS — Context Passing entre IAs
  Adicionar estes blocos às edge functions existentes
================================================================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. ai-prescribe-workout — adicionar ao athleteContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No body da request, aceitar: running_days_context (opcional)
  { days_per_week: number, sport: string }

Adicionar ao final do athleteContext:

```
INTEGRAÇÃO COM CORRIDA (contexto recebido do UnifiedPrescriber):
${running_days_context
  ? `O atleta TAMBÉM tem ${running_days_context.days_per_week} dias/semana de ${running_days_context.sport}.
     REGRAS OBRIGATÓRIAS DE ANTI-INTERFERÊNCIA:
     1. NÃO agendar treino pesado de MMII (agachamento, terra, afundo) no mesmo dia nem no dia ANTERIOR a corridas longas
     2. Semanas de deload da musculação = semana 4 de cada bloco (deload sincronizado com a corrida)
     3. Volume de MMII reduzido em 20% vs atleta sem corrida
     4. Preferir RIR 2-3 em todos os exercícios (preservar recuperação aeróbica)
     5. Separar força de MMII por no mínimo 6h de qualquer corrida Z4/Z5`
  : 'Sem plano de corrida — prescrever sem restrições de anti-interferência'
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2. ai-running-plan — adicionar ao athleteContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No body da request, aceitar: strength_plan_context (opcional)
  { days_per_week: number, workouts: Array<{ day: number, focus: string, has_heavy_legs: boolean }> }

Adicionar ao final do athleteContext:

```
INTEGRAÇÃO COM MUSCULAÇÃO (contexto recebido do plano de força já gerado):
${strength_plan_context
  ? `O atleta tem ${strength_plan_context.days_per_week} dias/semana de musculação.
     Dias com treino pesado de MMII: ${
       strength_plan_context.workouts
         .filter((w: any) => w.has_heavy_legs)
         .map((w: any) => `Dia ${w.day} (${w.focus})`)
         .join(', ') || 'não identificados'
     }
     REGRAS OBRIGATÓRIAS DE SINCRONIZAÇÃO:
     1. NÃO colocar corrida Z4/Z5 nos dias de treino pesado de MMII nem no dia seguinte
     2. Corrida Z1/Z2 pode ser feita no mesmo dia da musculação APENAS após o treino de força e com 6h de intervalo
     3. Semana de deload da corrida na mesma semana que o deload da musculação (semana 4)
     4. Preferir corridas longas Z2 nos dias de descanso da musculação
     5. Distribuição sugerida: [corrida] → [força MMII] → [descanso] → [corrida] → [força MMII+superior]`
  : 'Sem plano de musculação — prescrever sem restrições de sincronização'
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3. ai-nutrition-plan — adicionar ao athleteContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No body da request, aceitar:
  strength_plan_context: { sessions_per_week, session_duration_min, estimated_weekly_kcal }
  running_plan_context:  { sport, model, volume_weekly_hours, estimated_weekly_kcal }

Substituir o bloco de athleteContext de treino por:

```
CARGA DE TREINO REAL (para cálculo preciso do GET):
${strength_plan_context
  ? `Musculação: ${strength_plan_context.sessions_per_week}x/semana, ${strength_plan_context.session_duration_min}min/sessão
     Custo estimado musculação: ~${strength_plan_context.estimated_weekly_kcal} kcal/semana`
  : 'Sem musculação'
}
${running_plan_context
  ? `${running_plan_context.sport}: modelo ${running_plan_context.model}, ~${running_plan_context.volume_weekly_hours}h/semana
     Custo estimado cardio: ~${running_plan_context.estimated_weekly_kcal} kcal/semana`
  : 'Sem cardio'
}

INSTRUÇÃO CRÍTICA: 
- Some os custos calóricos reais de TODOS os treinos para calcular o GET correto
- GET = TMB × fator_atividade_BASE + custo_musculacao_semanal/7 + custo_cardio_semanal/7
- Carb cycling: dias com TREINO DUPLO (força + corrida) = CHO máximo do perfil
- Dias só de musculação = CHO médio
- Dias só de corrida Z2 = CHO médio
- Dias de descanso = CHO mínimo (2-3g/kg)
- Se atleta tem corrida Z4/Z5 no mesmo dia que musculação intensa → CHO pré-treino obrigatório
```

================================================================================
  ROTA NO LOVABLE
  Adicionar em src/App.tsx ou no arquivo de rotas:
================================================================================

import UnifiedPrescriber from "@/pages/admin/UnifiedPrescriber";

// Na lista de rotas:
{ path: "/admin/prescricao", element: <UnifiedPrescriber /> }

// No menu sidebar (AdminLayout ou similar):
{ label: "Prescrição Integrada", path: "/admin/prescricao", icon: Sparkles }

BNEOF_DOCS_INTEGRACAO_IAS_BN_MD

echo ""
echo "✅ Todos os arquivos criados."
echo ""
echo "🔀 Fazendo git add + commit + push..."
git add .
git commit -m "feat: IAs integradas BN — anamnese única, prescrição unificada, 5 edge functions"
git push
echo ""
echo "🚀 Pronto! Arquivos no GitHub."
echo ""
echo "Próximo passo — rodar no Supabase SQL Editor:"
echo "  supabase/migrations/20260601_integracao_prescricoes.sql"