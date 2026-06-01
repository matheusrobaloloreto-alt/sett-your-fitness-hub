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
