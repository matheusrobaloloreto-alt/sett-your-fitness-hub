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
