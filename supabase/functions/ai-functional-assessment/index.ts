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
