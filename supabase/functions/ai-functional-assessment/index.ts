import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, HttpError } from "../_shared/tenant-auth.ts";
import { requireCompanyFeature } from "../_shared/company-feature-entitlements.ts";
import { assertAssessmentFrameCoverage, readCompanyAssessmentProtocol, resolveAssessmentCapture, type AssessmentProtocolReader } from '../_shared/prescription/assessmentProtocol.ts';
import {
  buildDeterministicAssessmentJson as buildAssessmentEngineJson,
  normalizeAssessmentJson as normalizeAssessmentEngineJson,
} from "../_shared/assessment/engine.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Visão postural: melhor Sonnet por padrão (env-overridable; pode trocar p/ claude-opus-4-8)
const MODEL = Deno.env.get("ANTHROPIC_MODEL_VISION") || Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5-20250929";
// Fallback-first: por padrão NÃO chama Vision. A avaliação retorna um contrato
// estruturado conservador (sem inventar achado visual) para a prescrição consumir.
// Para ligar leitura visual por IA, defina FUNCTIONAL_ASSESSMENT_AI_FIRST=on.
const AI_FIRST = (Deno.env.get("FUNCTIONAL_ASSESSMENT_AI_FIRST") ?? "off").trim().toLowerCase() === "on";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const clean = (s: unknown) => String(s || "").replace(/[^\x20-\x7EÀ-ſ]/g, "");

function extractJson(raw: string): any {
  if (!raw) throw new Error("Resposta vazia da IA");
  let s = raw.replace(/```json|```/g, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
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

type FrameRef = { frameId: string; vista: string };

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

interface AiDecisionLogInput {
  student_id: string | null | undefined;
  company_id: string | null | undefined;
  source: "prescricao" | "avaliacao" | "bnito";
  summary: string;
  payload: Record<string, unknown>;
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

type OhsCompensationDefinition = {
  key: string;
  label: string;
  aliases: string[];
  vistaKeywords: string[];
  trainingImplication: string;
  // Enriquecimento determinístico (mapa muscular + corretivos + linguagem de aluno).
  // Fundamentação (PubMed): OHS observacional detecta valgo/MKD de forma confiável (Post 2016,
  // 10.1123/jsr.2015-0178); vídeo > tempo real (Rogers 2019, 10.1519/JSC.0000000000002175).
  view?: string;         // rótulo da vista p/ agrupar no laudo (vistas[])
  plainLabel?: string;   // linguagem de aluno
  studentMeaning?: string;
  overactive?: string[]; // encurtados/hiperativos → alongar
  underactive?: string[]; // alongados/inibidos → ativar
  corrective?: { alongar: string[]; ativar: string[] };
  redFlag?: boolean;     // se houver dor nesse padrão → handoff
};

const VIEW_LABELS: Record<string, string> = {
  ohs_anterior: "Overhead Squat — vista frontal",
  ohs_lateral: "Overhead Squat — vista lateral",
  ohs_posterior: "Overhead Squat — vista posterior",
  postura_lateral: "Postura estática — vista lateral",
};

const OHS_COMPENSATIONS: OhsCompensationDefinition[] = [
  {
    key: "dorsiflexion_limitation",
    label: "Limitação de dorsiflexão de tornozelo",
    aliases: ["dorsiflex", "tornozelo", "adm_tornozelo", "mobilidade_tornozelo", "calcanhar", "ankle"],
    vistaKeywords: ["lateral ohs", "air squat", "squat", "vista lateral"],
    trainingImplication: "Priorizar mobilidade de tornozelo e variações de agachamento com menor exigência de dorsiflexão; considerar elevação provisória de calcanhar e evitar progressão agressiva de carga axial.",
    view: "ohs_lateral",
    plainLabel: "Tornozelo travado (calcanhar tende a subir)",
    studentMeaning: "Seu tornozelo tem pouca mobilidade, o que joga o tronco à frente e dificulta agachar fundo. É um dos pontos que melhora mais rápido com mobilidade específica.",
    overactive: ["Sóleo", "Gastrocnêmio"],
    underactive: ["Tibial anterior"],
    corrective: { alongar: ["Along. Panturrilha Unilateral"], ativar: ["Fisio Tornozelo: dorsiflexão com banda"] },
  },
  {
    key: "dynamic_valgus",
    label: "Valgo dinâmico de joelho",
    aliases: ["valgo", "joelho", "colapso medial", "valgus"],
    vistaKeywords: ["anterior ohs", "vista anterior", "air squat", "lunge"],
    trainingImplication: "Adicionar ativação/fortalecimento de glúteo médio e rotadores externos, controle motor com cue de joelhos para fora e cautela com agachamentos/afundos pesados.",
    view: "ohs_anterior",
    plainLabel: "Joelhos caindo para dentro",
    studentMeaning: "Seus joelhos tendem a ceder para dentro quando você agacha — geralmente quadril (glúteos) pouco ativo e parte interna da coxa dominante. Com o tempo sobrecarrega o joelho; é totalmente treinável.",
    overactive: ["Adutores", "Tensor da fáscia lata (TFL)", "Bíceps femoral"],
    underactive: ["Glúteo médio", "Glúteo máximo", "Vasto medial (VMO)"],
    corrective: {
      alongar: ["Along. Adutores Bilateral", "Along. Tensor da Fascia Lata Solo"],
      ativar: ["Ponte de glúteo com mini band", "Caminhada lateral com mini band", "Concha (clamshell) com banda"],
    },
    redFlag: true,
  },
  {
    key: "trunk_forward_lean",
    label: "Inclinação excessiva de tronco",
    aliases: ["inclinação", "inclinacao", "tronco", "tibiotronco", "à frente", "a frente"],
    vistaKeywords: ["lateral ohs", "air squat", "vista lateral"],
    trainingImplication: "Reduzir braço de momento lombar, priorizar core lombo-pélvico e variações mais verticalizadas/estáveis antes de carga livre pesada.",
    view: "ohs_lateral",
    plainLabel: "Tronco caindo muito para frente",
    studentMeaning: "Seu tronco inclina bastante à frente ao agachar — normalmente tornozelo/panturrilha travados e glúteo pouco ativo. Mobilidade de tornozelo + ativação de glúteo deixam o agachamento mais ereto.",
    overactive: ["Sóleo", "Gastrocnêmio", "Flexores do quadril"],
    underactive: ["Glúteo máximo", "Eretores da espinha"],
    corrective: {
      alongar: ["Along. Panturrilha Unilateral", "Along. Iliopsoas"],
      ativar: ["Ponte de glúteo com mini band", "Fisio Tornozelo: dorsiflexão com banda"],
    },
  },
  {
    key: "butt_wink",
    label: "Retroversão pélvica / butt wink",
    aliases: ["butt wink", "retrovers", "pelve_fundo", "isquiotibiais", "pélvica", "pelvica"],
    vistaKeywords: ["lateral ohs", "vista lateral", "air squat"],
    trainingImplication: "Limitar amplitude ao ponto de controle pélvico, trabalhar mobilidade de quadril/isquiotibiais e evitar sobrecarga axial com perda de coluna neutra.",
    view: "ohs_lateral",
    plainLabel: "Lombar arredondando no fim da descida",
    studentMeaning: "No fundo do agachamento sua lombar arredonda ('butt wink'). Costuma ser isquiotibiais/mobilidade de quadril e controle do core. Ajustamos amplitude e mobilidade para proteger a coluna.",
    overactive: ["Isquiotibiais", "Adutor magno"],
    underactive: ["Flexores do quadril", "Eretores da espinha"],
    corrective: {
      alongar: ["Along. Posterior Unilateral Solo", "Along. Adutores Flexionado (Frog)"],
      ativar: ["Bird dog", "Perdigueiro Alternado"],
    },
    redFlag: true,
  },
  {
    key: "pelvic_drop_trendelenburg",
    label: "Drop de pelve / Trendelenburg funcional",
    aliases: ["drop", "trendelenburg", "pelve", "quadril cai", "queda da pelve"],
    vistaKeywords: ["posterior ohs", "vista posterior", "lunge", "equilibrio", "unipodal"],
    trainingImplication: "Priorizar abdutores de quadril e exercícios unilaterais progressivos, com regressão quando houver perda de alinhamento pélvico.",
    view: "ohs_posterior",
    plainLabel: "Quadril cai de um lado",
    studentMeaning: "Sua pelve inclina para um lado — normalmente glúteo médio pouco ativo. Fortalecer o quadril de forma unilateral estabiliza e protege joelho e lombar, importante para corrida também.",
    overactive: ["Quadrado lombar", "Adutores"],
    underactive: ["Glúteo médio"],
    corrective: {
      alongar: ["Along. Dorsal e Quadrado Lombar Unilateral Espaldar"],
      ativar: ["Caminhada lateral com mini band", "Prancha Lateral"],
    },
    redFlag: true,
  },
  {
    key: "shoulder_protraction_kyphosis",
    label: "Protrusão de ombro / cifose torácica",
    aliases: ["protrusão", "protrusao", "cifose", "torácica", "toracica", "escap", "ombros"],
    vistaKeywords: ["postura", "lateral", "shoulder flexion", "posterior"],
    trainingImplication: "Adicionar trabalho escapular, mobilidade torácica e fortalecimento de trapézio inferior/romboides/serrátil; cautela com pressões intensas se houver limitação overhead.",
    view: "postura_lateral",
    plainLabel: "Ombros arredondados / postura curvada",
    studentMeaning: "Seus ombros rolam para frente e a parte de cima das costas arredonda — muito comum por celular/computador. Abrir o peito e fortalecer as costas melhora postura, respiração e desempenho em puxadas.",
    overactive: ["Peitoral maior", "Peitoral menor", "Latíssimo do dorso"],
    underactive: ["Trapézio médio e inferior", "Rombóides", "Serrátil anterior"],
    corrective: {
      alongar: ["Along. Peitoral Bilateral Espaldar", "Along. Peitoral Menor"],
      ativar: ["Face pull com banda", "Band pull-apart", "Extensão Y-T", "Wall slides (deslizar na parede)"],
    },
  },
  {
    key: "overhead_arm_asymmetry",
    label: "Assimetria de braços no overhead",
    aliases: ["assimetria de braço", "assimetria de braco", "bracos", "braços", "overhead", "ombro mais baixo", "assimetria_bracas"],
    vistaKeywords: ["anterior ohs", "posterior ohs", "shoulder flexion", "overhead"],
    trainingImplication: "Avaliar mobilidade unilateral de ombro/torácica, incluir mobilidade do lado limitado e exercícios unilaterais para equalizar o padrão.",
    view: "ohs_anterior",
    plainLabel: "Um braço não sobe igual ao outro",
    studentMeaning: "Um braço fica mais baixo que o outro acima da cabeça — assimetria de mobilidade de ombro/torácica. Trabalho unilateral do lado limitado equaliza o padrão.",
    overactive: ["Latíssimo do dorso", "Peitoral maior"],
    underactive: ["Trapézio médio e inferior", "Manguito rotador"],
    corrective: {
      alongar: ["Along. Dorsal Unilateral Espaldar", "Along. Peitoral Unilateral Espaldar"],
      ativar: ["Face pull com banda", "Serrote em pé"],
    },
  },
];

// Infere compensações OHS a partir do TEXTO do professor/queixa (fallback determinístico "vê"
// o que o professor escreveu, mesmo sem IA de visão). Severidade por palavra-chave, senão moderada.
function inferCompensationsFromText(...values: unknown[]): Array<{ def: OhsCompensationDefinition; severidade: string }> {
  const text = values.map(clean).join(" ").toLowerCase();
  if (!text.trim()) return [];
  const sevWord = /sever|acentuad|grave|important|marcad/.test(text) ? "severa" : /leve|discret|sutil|pequen/.test(text) ? "leve" : "moderada";
  const out: Array<{ def: OhsCompensationDefinition; severidade: string }> = [];
  for (const def of OHS_COMPENSATIONS) {
    if (def.aliases.some((a) => text.includes(a.toLowerCase()))) out.push({ def, severidade: sevWord });
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSeverity(value: unknown): string {
  const raw = clean(value || "").toLowerCase();
  if (raw.includes("sever")) return "severa";
  if (raw.includes("moder")) return "moderada";
  if (raw.includes("leve")) return "leve";
  if (raw.includes("ausente") || raw.includes("sem alteração") || raw.includes("sem alteracao")) return "ausente";
  if (raw.includes("incert") || raw.includes("baixa confiança") || raw.includes("baixa confianca")) return "incerta";
  return raw ? "moderada" : "incerta";
}

function stringifyForSearch(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyForSearch).join(" ");
  if (isRecord(value)) return Object.values(value).map(stringifyForSearch).join(" ");
  return "";
}

function findFrameReference(definition: OhsCompensationDefinition, frameRefs: FrameRef[], explicitFrameId?: unknown) {
  const explicit = typeof explicitFrameId === "string" ? frameRefs.find((fr) => fr.frameId === explicitFrameId) : null;
  if (explicit) return explicit;
  const match = frameRefs.find((fr) => {
    const vista = fr.vista.toLowerCase();
    return definition.vistaKeywords.some((keyword) => vista.includes(keyword));
  });
  return match || frameRefs[0] || { frameId: null, vista: null };
}

function extractExplicitCompensation(assessmentJson: any, definition: OhsCompensationDefinition) {
  const candidates = [
    ...(Array.isArray(assessmentJson?.ohs_compensations) ? assessmentJson.ohs_compensations : []),
    ...(Array.isArray(assessmentJson?.compensacoes_ohs) ? assessmentJson.compensacoes_ohs : []),
    ...(Array.isArray(assessmentJson?.disfuncoes_identificadas) ? assessmentJson.disfuncoes_identificadas : []),
  ];
  return candidates.find((item) => {
    const text = stringifyForSearch(item).toLowerCase();
    return text.includes(definition.key) || definition.aliases.some((alias) => text.includes(alias));
  });
}

function inferOhsCompensation(assessmentJson: any, definition: OhsCompensationDefinition, frameRefs: FrameRef[]) {
  const explicit = extractExplicitCompensation(assessmentJson, definition);
  const globalText = stringifyForSearch(assessmentJson).toLowerCase();
  const mentioned = definition.aliases.some((alias) => globalText.includes(alias));
  const frameText = Array.isArray(assessmentJson?.frame_findings)
    ? assessmentJson.frame_findings.find((frame: any) => {
        const text = stringifyForSearch(frame).toLowerCase();
        return definition.aliases.some((alias) => text.includes(alias));
      })
    : null;
  const frameReference = findFrameReference(definition, frameRefs, explicit?.frameId || explicit?.frame_id || frameText?.frameId);
  const present = !!explicit || !!frameText || mentioned;
  const severity = present
    ? normalizeSeverity(explicit?.severidade || explicit?.gravidade || explicit?.severity || frameText?.gravidade || stringifyForSearch(explicit || frameText))
    : "ausente";
  const explicitPresent = typeof explicit?.presente === "boolean" ? explicit.presente : undefined;
  const normalizedPresent = explicitPresent ?? (present && severity !== "ausente" && severity !== "incerta");
  const evidence = explicit?.evidencia
    || explicit?.descricao
    || explicit?.achado
    || explicit?.nome
    || frameText?.findings?.[0]?.descricao
    || (normalizedPresent
      ? "Inferido do conjunto do laudo estruturado."
      : severity === "incerta"
        ? "Imagem ou contexto insuficiente para confirmar este achado."
        : "Não observado nos frames analisados.");

  return {
    key: definition.key,
    compensacao: definition.label,
    presente: normalizedPresent,
    severidade: severity,
    frame_referencia: frameReference.frameId,
    vista_referencia: frameReference.vista,
    evidencia: evidence,
    implicacao_treino: explicit?.implicacao_treino || explicit?.impacto_treino || definition.trainingImplication,
  };
}

function ensureFrameFindings(assessmentJson: any, frameRefs: FrameRef[]) {
  const current = Array.isArray(assessmentJson?.frame_findings) ? assessmentJson.frame_findings : [];
  const byId = new Map<string, any>(current.map((item: any) => [item?.frameId, item]));
  return frameRefs.map((frame) => ({
    frameId: frame.frameId,
    vista: byId.get(frame.frameId)?.vista || frame.vista,
    findings: Array.isArray(byId.get(frame.frameId)?.findings) ? byId.get(frame.frameId).findings : [],
  }));
}

function buildReportSections(assessmentJson: any) {
  return {
    postura: assessmentJson?.postura_estatica || {},
    overhead_squat: assessmentJson?.overhead_squat || {},
    laudo: {
      texto_aluno: assessmentJson?.relatorio_para_aluno || "",
      disfuncoes_identificadas: assessmentJson?.disfuncoes_identificadas || [],
      prioridades_corretivas: assessmentJson?.prioridades_corretivas || [],
      red_yellow_flags: assessmentJson?.red_yellow_flags || [],
    },
    contexto_prescricao: {
      resumo: assessmentJson?.resumo_para_prescricao || "",
      musculos_encurtados: assessmentJson?.musculos_encurtados || [],
      musculos_fracos: assessmentJson?.musculos_fracos || [],
      restricoes_movimento: assessmentJson?.restricoes_movimento || [],
      exercicios_contraindicados: assessmentJson?.exercicios_contraindicados || [],
      exercicios_cautela: assessmentJson?.exercicios_cautela || [],
    },
  };
}

function normalizeAssessmentJson(assessmentJson: any, frameRefs: FrameRef[]) {
  if (!isRecord(assessmentJson)) assessmentJson = {};
  const frame_findings = ensureFrameFindings(assessmentJson, frameRefs);
  const ohs_compensations = OHS_COMPENSATIONS.map((definition) => inferOhsCompensation({ ...assessmentJson, frame_findings }, definition, frameRefs));
  const prescription_context = {
    contract: "bn_functional_assessment_v1",
    source: "ai-functional-assessment",
    ohs_compensations,
    posture_static: assessmentJson.postura_estatica || null,
    overhead_squat: assessmentJson.overhead_squat || null,
    protocol_direction: assessmentJson.direcionamento_protocolo || null,
    red_yellow_flags: assessmentJson.red_yellow_flags || [],
    progression_criteria: assessmentJson.criterios_progressao_bn || null,
    corrective_priorities: assessmentJson.prioridades_corretivas || [],
    shortened_muscles: assessmentJson.musculos_encurtados || [],
    weak_muscles: assessmentJson.musculos_fracos || [],
    movement_restrictions: assessmentJson.restricoes_movimento || [],
    contraindicated_exercises: assessmentJson.exercicios_contraindicados || [],
    caution_exercises: assessmentJson.exercicios_cautela || [],
    summary_for_prescription: assessmentJson.resumo_para_prescricao || "",
  };

  return {
    ...assessmentJson,
    schema: "bn_functional_assessment_v1",
    assessment_contract_version: "2026-06-13.phase1",
    frame_findings,
    ohs_compensations,
    report_sections: assessmentJson.report_sections || buildReportSections(assessmentJson),
    prescription_context,
  };
}

function splitList(value: unknown): string[] {
  return clean(value)
    .split(/[;\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function painRegionsFromText(...values: unknown[]): string[] {
  const text = values.map(clean).join(" ").toLowerCase();
  const out: string[] = [];
  if (/joelho|patel|condrom|menisc|ligamento/.test(text)) out.push("joelho");
  if (/lomb|coluna|ci[aá]tic|sacro|quadrad/.test(text)) out.push("lombar");
  if (/ombro|manguito|cervic|esc[aá]pul/.test(text)) out.push("ombro/cervical");
  if (/tornoz|aquiles|panturr|canela|tibia/.test(text)) out.push("tornozelo/panturrilha");
  if (/quadril|gl[uú]te|piriforme|tfl|iliotibial/.test(text)) out.push("quadril");
  return [...new Set(out)];
}

function buildDeterministicAssessmentJson(args: {
  frameRefs: FrameRef[];
  queixa_principal: unknown;
  historico_lesoes: unknown;
  modalidade: unknown;
  nivel: unknown;
  peso_kg: unknown;
  altura_cm: unknown;
  cintura_cm: unknown;
  percentual_gordura: unknown;
  perimetros: unknown;
  observacoes_tecnicas: unknown;
  assessment_source: unknown;
  protocol_hint: unknown;
  expected_movements: unknown;
  reason: string;
}) {
  const painRegions = painRegionsFromText(args.queixa_principal, args.historico_lesoes, args.observacoes_tecnicas);
  const restrictions = painRegions.map((region) => ({
    regiao: region,
    regra: "manter dor <=3/10, reduzir amplitude/carga no padrão doloroso e sinalizar professor se houver piora",
  }));
  const redFlags = /formig|perda de for|edema|incha|dor tor[aá]c|tont|desma|fratura|cirurg|agud/i.test(
    [args.queixa_principal, args.historico_lesoes, args.observacoes_tecnicas].map(clean).join(" "),
  )
    ? ["Relato textual sugere red/yellow flag; exigir revisão do professor antes de progredir carga."]
    : [];
  const composition = {
    peso_kg: clean(args.peso_kg) || null,
    altura_cm: clean(args.altura_cm) || null,
    cintura_cm: clean(args.cintura_cm) || null,
    percentual_gordura_informado: clean(args.percentual_gordura) || null,
    prioridades_de_acompanhamento: splitList(args.perimetros),
  };
  const protocol = painRegions.some((region) => ["joelho", "tornozelo/panturrilha", "quadril"].includes(region))
    ? "protocolo_2_mmii"
    : painRegions.some((region) => region === "ombro/cervical")
      ? "protocolo_3_mmss"
      : painRegions.some((region) => region === "lombar")
        ? "protocolo_4_radic_investigar_se_sintomas_neurais"
        : clean(args.protocol_hint) || "protocolo_1_padrao";
  const visualNote = args.frameRefs.length
    ? "Fallback determinístico: frames recebidos, mas sem leitura visual por IA nesta execução. Achados visuais ficam incertos até revisão/IA Vision."
    : "Fallback determinístico baseado apenas em dados textuais, sem imagens.";

  // Inferência determinística: "lê" as observações técnicas do professor + queixa e mapeia
  // para compensações OHS/postura → músculos → plano corretivo (biblioteca-only) → laudo do aluno.
  const inferred = inferCompensationsFromText(args.observacoes_tecnicas, args.queixa_principal, args.historico_lesoes);
  const anyInferred = inferred.length > 0;

  const byView = new Map<string, Array<{ severidade: string; descricao: string }>>();
  for (const { def, severidade } of inferred) {
    const view = def.view || "ohs_lateral";
    const arr = byView.get(view) || [];
    arr.push({ severidade, descricao: `${def.plainLabel || def.label} — ${def.studentMeaning || def.trainingImplication}` });
    byView.set(view, arr);
  }
  const vistas = [...byView.entries()].map(([view, comps]) => ({ vista: VIEW_LABELS[view] || view, compensacoes: comps }));

  const encurtados = [...new Set(inferred.flatMap(({ def }) => def.overactive || []))];
  const fracos = [...new Set(inferred.flatMap(({ def }) => def.underactive || []))];
  const alongar = [...new Set(inferred.flatMap(({ def }) => def.corrective?.alongar || []))].slice(0, 6);
  const ativar = [...new Set(inferred.flatMap(({ def }) => def.corrective?.ativar || []))].slice(0, 6);

  const relatorioAluno = anyInferred
    ? [
        "Fizemos sua avaliação de movimento (agachamento overhead + postura). Veja o que observamos e o plano para você evoluir:",
        ...inferred.slice(0, 4).map(({ def }) => `• ${def.plainLabel || def.label}: ${def.studentMeaning || ""}`),
        alongar.length ? `Mobilidade/alongamento sugeridos: ${alongar.slice(0, 4).join(", ")}.` : "",
        ativar.length ? `Ativação/fortalecimento sugeridos: ${ativar.slice(0, 4).join(", ")}.` : "",
        "Nada aqui é motivo de preocupação — são pontos totalmente treináveis. Sentiu dor forte (acima de 5/10)? Pare o exercício e avise seu treinador.",
      ].filter(Boolean).join("\n")
    : [
        "Sua avaliação de movimento foi registrada. Não identificamos compensações marcantes a partir das informações desta análise.",
        painRegions.length ? `Pontos de atenção informados: ${painRegions.join(", ")}.` : "",
        "Seu treino começa com controle técnico, mobilidade/ativação e progressão gradual. Sentiu dor forte? Pare e avise seu treinador.",
      ].filter(Boolean).join("\n");

  const checklistProfessor = [
    "Vista frontal (OHS): joelhos em valgo? pés abrindo? peso simétrico? braços iguais?",
    "Vista lateral (OHS): calcanhar sobe (tornozelo travado)? tronco muito à frente? lombar arqueia ou arredonda? braços caem à frente?",
    "Vista posterior (OHS): quadril cai de um lado? desvio lateral?",
    "Postura estática (lateral): cabeça à frente? ombros arredondados/cifose? quadril empinado (anteversão)?",
  ];

  const prioridades = anyInferred
    ? inferred.map(({ def, severidade }) => `${def.plainLabel || def.label} (${severidade}) → alongar: ${(def.corrective?.alongar || []).join(", ") || "—"}; ativar: ${(def.corrective?.ativar || []).join(", ") || "—"}`)
    : restrictions.map((item) => `${item.regiao}: ${item.regra}`);

  const visualNoteFinal = anyInferred
    ? "Avaliação determinística a partir das observações técnicas do professor (sem IA de visão nesta execução). Compensações inferidas do relato — confirme nos frames."
    : visualNote;

  return normalizeAssessmentJson({
    generated_by: "bn_functional_assessment_fallback_v2",
    fallback_reason: args.reason,
    confianca_visual: anyInferred ? "media" : "baixa",
    composicao_corporal: composition,
    vistas,
    total_compensacoes: inferred.length,
    checklist_professor: checklistProfessor,
    frame_findings: args.frameRefs.map((frame) => ({
      frameId: frame.frameId,
      vista: frame.vista,
      findings: inferred
        .filter(({ def }) => (def.vistaKeywords || []).some((k) => (frame.vista || "").toLowerCase().includes(k)))
        .map(({ def, severidade }) => ({ compensacao: def.label, severidade })),
      observacao: visualNoteFinal,
    })),
    postura_estatica: { observacoes: visualNoteFinal },
    overhead_squat: { observacoes: visualNoteFinal },
    disfuncoes_identificadas: inferred.map(({ def, severidade }) => ({ key: def.key, label: def.label, severidade })),
    ohs_compensations: OHS_COMPENSATIONS.map((definition) => {
      const hit = inferred.find((i) => i.def.key === definition.key);
      return {
        key: definition.key,
        compensacao: definition.label,
        presente: !!hit,
        severidade: hit ? hit.severidade : "ausente",
        frame_referencia: findFrameReference(definition, args.frameRefs).frameId,
        evidencia: hit ? `Inferido do relato técnico; ${definition.studentMeaning || definition.trainingImplication}` : visualNoteFinal,
        implicacao_treino: definition.trainingImplication,
      };
    }),
    plano_corretivo: { alongar, ativar },
    direcionamento_protocolo: protocol,
    red_yellow_flags: redFlags,
    prioridades_corretivas: prioridades,
    restricoes_movimento: restrictions,
    exercicios_contraindicados: painRegions.includes("lombar")
      ? ["evitar flexão lombar carregada e carga axial alta sem controle"]
      : [],
    exercicios_cautela: [
      painRegions.includes("joelho") ? "agachamento profundo/afundo pesado se houver dor" : null,
      painRegions.includes("ombro/cervical") ? "press overhead pesado e dips se houver dor/limitação" : null,
      painRegions.includes("tornozelo/panturrilha") ? "pliometria, tiros e impacto alto se houver dor" : null,
    ].filter(Boolean),
    musculos_encurtados: encurtados,
    musculos_fracos: fracos.length ? fracos : (painRegions.includes("joelho") || painRegions.includes("quadril") ? ["glúteo médio"] : []),
    resumo_para_prescricao: [
      `Avaliação fallback para ${clean(args.modalidade || "treino")}.`,
      anyInferred ? `Compensações inferidas: ${inferred.map((i) => i.def.label).join(", ")}.` : (painRegions.length ? `Regiões de atenção: ${painRegions.join(", ")}.` : "Sem compensação/dor crítica relatada."),
      fracos.length ? `Priorizar ativação: ${fracos.join(", ")}.` : "",
      "Professor deve confirmar os achados nos frames antes de progressão agressiva.",
    ].filter(Boolean).join(" "),
    relatorio_para_aluno: relatorioAluno,
    criterios_progressao_bn: {
      dor: "progredir somente se dor <=3/10 durante e após o treino",
      tecnica: "progredir carga apenas com alinhamento e amplitude controlados",
      revisao: "revisar visualmente os frames quando a leitura por IA Vision estiver desligada",
    },
    sequencia_bn_video: Array.isArray(args.expected_movements) ? args.expected_movements.map(clean).filter(Boolean) : splitList(args.expected_movements),
  }, args.frameRefs);
}

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
- Tom do relatorio: ${clean(config.tone || "tecnico, acolhedor, direto e seguro")}
- Credenciais/voz do dono: ${config.owner_credentials ? clean(config.owner_credentials).slice(0, 2000) : "Nao informado; nao inventar autoridade."}
- Publico/nicho atendido: ${config.niche_audience ? clean(config.niche_audience).slice(0, 2000) : "Nao informado; usar somente o contexto recebido."}
- Metodologia proprietaria: ${config.methodology ? clean(config.methodology).slice(0, 4000) : "Usar Metodologia BN como fallback."}
- Preferencias de exercicios/biblioteca: ${config.exercise_preferences ? clean(config.exercise_preferences).slice(0, 2000) : "Usar apenas como contexto para implicacao no treino."}
- Modelo de progressao: ${config.progression_model ? clean(config.progression_model).slice(0, 2000) : "Informar implicacoes para periodizacao BN de 6 semanas."}
- Protocolo de avaliacao: ${config.assessment_protocol ? clean(config.assessment_protocol).slice(0, 3000) : "Usar protocolo BN de postura e overhead squat."}
- Linhas vermelhas da empresa: ${config.red_lines ? clean(config.red_lines).slice(0, 2500) : "Seguir linhas vermelhas BN de dor e seguranca."}
- Estilo de comunicacao: ${config.communication_style ? clean(config.communication_style).slice(0, 1500) : "Tecnico, acolhedor, direto e seguro."}
- Escopo nutricional: ${config.nutrition_scope ? clean(config.nutrition_scope).slice(0, 1000) : "Nao incluir no laudo funcional, salvo como contexto geral."}
- Limites eticos: ${config.ethical_limits ? clean(config.ethical_limits).slice(0, 2500) : "Nao diagnosticar, nao prometer resultado e nao ultrapassar escopo profissional."}
- Planos/pagamento/contexto comercial: ${config.plans_payment ? clean(config.plans_payment).slice(0, 2000) : "Nao informado; nao incluir no laudo."}

Use essa configuracao para nome da consultoria, tom, protocolo e contexto. Para avaliacao funcional, mantenha achados objetivos e nao diagnostique; se a metodologia configurada, protocolo local ou comunicacao desejada conflitar com seguranca/limites eticos, preserve a regra mais conservadora.
`.trim();
}

async function writeAiDecisionLog(supabase: any, input: AiDecisionLogInput) {
  if (!input.company_id) return;
  const { error } = await supabase.from("ai_decision_logs").insert({
    student_id: input.student_id ?? null,
    company_id: input.company_id,
    source: input.source,
    summary: clean(input.summary).slice(0, 1000),
    payload: input.payload ?? {},
  });
  if (error) {
    console.warn("ai_decision_logs insert skipped:", error.message);
  }
}

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
BASE BN ANONIMIZADA — VÍDEOS E PROTOCOLOS HISTÓRICOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A base histórica da BN aparece como pastas de avaliações completas com cortes de
vídeo e imagens, normalmente em conjuntos de 6 a 9 cortes por avaliação. Use este
padrão como referência técnica, mas NUNCA cite nomes, rostos, datas, pastas ou
qualquer dado pessoal. A saída deve conter somente achados técnicos anonimizados.

Quando receber frames rotulados como "Postura inicial", "Air Squat", "Toe Touch",
"Lunge alternado", "Shoulder Flexion", "Marcha estacionaria" e "Equilibrio
unipodal", trate como vídeo completo da sequência oficial BN.

SEQUÊNCIA OFICIAL BN — VÍDEO COMPLETO:
1. Air Squat — avaliar mobilidade de tornozelo, joelho e quadril; controle de tronco; 3 repetições controladas.
2. Toe Touch — verificar flexibilidade de cadeia posterior; 1 repetição lenta.
3. Lunge alternado — checar controle unilateral, equilíbrio, alinhamento de joelho e quadril; 2 repetições por perna.
4. Shoulder Flexion — observar mobilidade torácica e de ombros; 2 repetições lentas.
5. Marcha estacionaria — avaliar coordenação e ativação de core durante deslocamento vertical; 10 segundos contínuos.
6. Equilíbrio unipodal — verificar estabilidade de tornozelo, joelho e quadril; 10 segundos por perna.

REGISTRO OBRIGATÓRIO NA SEQUÊNCIA BN:
□ dor relatada ou sinal visual de proteção
□ tremor, instabilidade ou perda de controle
□ valgo/varo dinâmico
□ inclinação lateral ou rotação de tronco/quadril
□ assimetria direita/esquerda
□ limitação clara de amplitude
□ compensação que muda a prescrição

Se o vídeo não trouxer Overhead Squat clássico com braços acima da cabeça, use o
Air Squat como principal movimento de agachar, preencha overhead_squat de forma
conservadora e explique nas observações que a inferência veio do Air Squat.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIRECIONAMENTO DE PROTOCOLO BN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Escalas de registro:
□ DOR: 0 = sem dor, 10 = dor insuportável.
□ ADM: 0 = muita amplitude, 3 = pouca amplitude.

PROTOCOLO 1 — PADRÃO:
Use quando não houver queixa principal relevante e o agachamento não mostrar
disfunção importante. Testes a recomendar quando necessário: FADIR, Thomas,
Craig, estabilidade lombar, estabilidade cervical, Lunge Test, rotação interna e
externa de ombro.

PROTOCOLO 2 — MMII:
Use quando houver queixa de membros inferiores ou disfunção clara em squat, lunge,
toe touch, marcha ou equilíbrio. Testes a recomendar: FADIR, Thomas, KEA Test,
Craig, estabilidade lombar, Step Down Test e Lunge Test.

PROTOCOLO 3 — MMSS:
Use quando houver queixa de membros superiores, limitação de shoulder flexion,
alteração escapular, torácica ou de cervical. Testes a recomendar: coluna
(flexão, extensão, inclinação e rotação), flexão de ombros, rotação interna e
externa de ombros, elevação lateral, testes escapulares e cervical.

PROTOCOLO 4 — RADICULOPATIA:
Use como adicional quando houver sinais compatíveis com irradiação, formigamento,
perda de força, dor neurológica ou dor cervical/lombar relevante. Para MMII,
recomende LASEG e SLUMP. Para MMSS, diferencie suspeita cervical discal/facetária
e recomende encaminhamento quando houver red flag.

TRANSFERÊNCIA PARA TREINO — METODOLOGIA BN:
□ Ordem base: Mobilidade → Ativação → Controle motor → Pliometria/Potência quando apropriado → Força.
□ Primeiro treino deve validar a avaliação, observar resposta e evitar sobrecargas extremas.
□ Pliometria só entra quando movimentos básicos estão sem dor e com alinhamento, o aluno tem pelo menos 6 semanas de base, aterrissa bem e recupera sem dor articular.
□ Se houver dor EVA acima de 3, reduza amplitude/carga/braço de momento e não progrida o padrão doloroso.
□ Dor aguda, edema importante, piora progressiva, perda de força, formigamento, dor torácica, tontura/desmaio ou suspeita de fratura por estresse exigem cautela e encaminhamento.

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

Cada imagem vem rotulada com a VISTA e um identificador [frameId=XYZ].
Você deve retornar EXATAMENTE este JSON, sem texto adicional, sem markdown:

{
  "frame_findings": [
    {
      "frameId": "copie EXATAMENTE o frameId rotulado naquela imagem",
      "vista": "a vista rotulada",
      "findings": [
        { "gravidade": "Leve | Moderada | Severa", "descricao": "compensação objetiva observada NAQUELE frame" }
      ]
    }
  ],
  "postura_estatica": {
    "vista_frontal": { "cabeca": "descrição ou null", "ombros": "descrição ou null", "pelve": "descrição ou null", "joelhos": "descrição ou null", "pes": "descrição ou null", "observacoes": "outras observações" },
    "vista_lateral": { "cabeca_pescoco": "descrição ou null", "ombros": "descrição ou null", "coluna_toracica": "descrição ou null", "coluna_lombar": "descrição ou null", "pelve": "descrição ou null", "joelhos": "descrição ou null", "observacoes": "outras observações" },
    "vista_posterior": { "coluna": "descrição ou null", "escapulas": "descrição ou null", "pelve": "descrição ou null", "joelhos_calcanhares": "descrição ou null", "observacoes": "outras observações" }
  },
  "overhead_squat": {
    "vista_frontal": { "bracos": "simétrico | assimetria direita | assimetria esquerda", "joelhos": "sem alteração | valgo bilateral | valgo direito | valgo esquerdo | varo", "pelve": "estável | drop direito | drop esquerdo", "tronco": "centralizado | desvio direito | desvio esquerdo", "observacoes": "outras observações" },
    "vista_lateral": { "inclinacao_tronco": "adequada | excessiva", "angulo_tibiotronco": "paralelo | tronco muito a frente", "adm_tornozelo": "adequada | limitada", "pelve_fundo": "neutra | retroversao | anteversao", "lordose_lombar": "mantida | aumentada | reduzida", "profundidade_squat": "completa | parcial | limitada", "observacoes": "outras observações" },
    "vista_posterior": { "drop_pelve": "ausente | direito | esquerdo", "assimetria_bracas": "ausente | presente direito | presente esquerdo", "desvio_coluna": "ausente | presente", "observacoes": "outras observações" }
  },
  "ohs_compensations": [
    {
      "key": "dorsiflexion_limitation",
      "compensacao": "Limitação de dorsiflexão de tornozelo",
      "presente": false,
      "severidade": "ausente | leve | moderada | severa | incerta",
      "frame_referencia": "frameId principal ou null",
      "vista_referencia": "vista principal ou null",
      "evidencia": "sinal visual objetivo observado ou 'Não observado'",
      "implicacao_treino": "como muda mobilidade, seleção de exercícios, amplitude, carga e progressão"
    },
    {
      "key": "dynamic_valgus",
      "compensacao": "Valgo dinâmico de joelho",
      "presente": false,
      "severidade": "ausente | leve | moderada | severa | incerta",
      "frame_referencia": "frameId principal ou null",
      "vista_referencia": "vista principal ou null",
      "evidencia": "sinal visual objetivo observado ou 'Não observado'",
      "implicacao_treino": "como muda mobilidade, ativação, controle motor, exercício, volume e progressão"
    },
    {
      "key": "trunk_forward_lean",
      "compensacao": "Inclinação excessiva de tronco",
      "presente": false,
      "severidade": "ausente | leve | moderada | severa | incerta",
      "frame_referencia": "frameId principal ou null",
      "vista_referencia": "vista principal ou null",
      "evidencia": "sinal visual objetivo observado ou 'Não observado'",
      "implicacao_treino": "como muda controle lombo-pélvico, variação de agachamento, core e carga axial"
    },
    {
      "key": "butt_wink",
      "compensacao": "Retroversão pélvica / butt wink",
      "presente": false,
      "severidade": "ausente | leve | moderada | severa | incerta",
      "frame_referencia": "frameId principal ou null",
      "vista_referencia": "vista principal ou null",
      "evidencia": "sinal visual objetivo observado ou 'Não observado'",
      "implicacao_treino": "como muda amplitude, carga axial, mobilidade de quadril/isquiotibiais e progressão"
    },
    {
      "key": "pelvic_drop_trendelenburg",
      "compensacao": "Drop de pelve / Trendelenburg funcional",
      "presente": false,
      "severidade": "ausente | leve | moderada | severa | incerta",
      "frame_referencia": "frameId principal ou null",
      "vista_referencia": "vista principal ou null",
      "evidencia": "sinal visual objetivo observado ou 'Não observado'",
      "implicacao_treino": "como muda abdutores, unilaterais, estabilidade e integração com corrida"
    },
    {
      "key": "shoulder_protraction_kyphosis",
      "compensacao": "Protrusão de ombro / cifose torácica",
      "presente": false,
      "severidade": "ausente | leve | moderada | severa | incerta",
      "frame_referencia": "frameId principal ou null",
      "vista_referencia": "vista principal ou null",
      "evidencia": "sinal visual objetivo observado ou 'Não observado'",
      "implicacao_treino": "como muda mobilidade torácica, escápulas, puxadas/remadas e pressões"
    },
    {
      "key": "overhead_arm_asymmetry",
      "compensacao": "Assimetria de braços no overhead",
      "presente": false,
      "severidade": "ausente | leve | moderada | severa | incerta",
      "frame_referencia": "frameId principal ou null",
      "vista_referencia": "vista principal ou null",
      "evidencia": "sinal visual objetivo observado ou 'Não observado'",
      "implicacao_treino": "como muda mobilidade unilateral de ombro/torácica, exercícios unilaterais e pressões overhead"
    }
  ],
  "composicao_corporal": {
    "peso_kg": 0,
    "altura_cm": 0,
    "cintura_cm": 0,
    "percentual_gordura_informado": 0,
    "imc": 0,
    "leitura_tecnica": "leitura conservadora das medidas e fotos quando disponíveis",
    "confianca": "baixa | media | alta",
    "prioridades_de_acompanhamento": ["medidas ou fotos que devem ser acompanhadas"]
  },
  "analise_tecnica_movimento": [
    {
      "movimento": "overhead squat | postura | exercício descrito | corrida | outro",
      "achado": "compensação ou ponto técnico observado",
      "impacto": "como afeta treino/performance/composição",
      "cue_ou_ajuste": "correção prática ou próximo teste",
      "confianca": "baixa | media | alta"
    }
  ],
  "sequencia_bn_video": [
    {
      "movimento": "Postura inicial | Air Squat | Toe Touch | Lunge alternado | Shoulder Flexion | Marcha estacionaria | Equilibrio unipodal D | Equilibrio unipodal E",
      "objetivo_observacao": "o que esse movimento avalia na metodologia BN",
      "achados": ["achados tecnicos objetivos"],
      "compensacoes": [
        { "gravidade": "Leve | Moderada | Severa", "descricao": "compensação observada", "lado": "direito | esquerdo | bilateral | nao_aplica" }
      ],
      "score": 0,
      "cue_ou_teste": "cue pratico ou teste complementar indicado"
    }
  ],
  "direcionamento_protocolo": {
    "protocolo": "padrao | MMII | MMSS | radiculopatia | combinado",
    "motivo": "por que esse protocolo foi escolhido",
    "testes_recomendados": ["testes complementares pela metodologia BN"],
    "escalas": { "dor_eva": "0-10", "adm": "0-3" },
    "prioridade_reavaliacao": "baixa | media | alta"
  },
  "red_yellow_flags": [
    {
      "tipo": "yellow | red",
      "sinal": "ponto de atencao observado ou relatado",
      "conduta": "ajuste conservador ou encaminhamento"
    }
  ],
  "criterios_progressao_bn": {
    "sequencia_treino": ["mobilidade", "ativacao", "controle_motor", "pliometria_ou_potencia_quando_apropriado", "forca"],
    "liberado_para_pliometria": false,
    "motivo": "criterios atendidos ou pendentes",
    "primeiro_treino": ["prioridades praticas para validar a avaliacao"]
  },
  "disfuncoes_identificadas": [
    { "nome": "nome da disfunção", "localizacao": "bilateral | direito | esquerdo", "gravidade": "leve | moderada | severa", "causa_provavel": "descrição da causa", "impacto_treino": "como isso afeta o treino" }
  ],
  "musculos_encurtados": ["lista de músculos provavelmente encurtados"],
  "musculos_fracos": ["lista de músculos provavelmente fracos/inibidos"],
  "restricoes_movimento": ["lista de restrições de amplitude/mobilidade"],
  "prioridades_corretivas": ["1ª prioridade de intervenção", "2ª prioridade", "3ª prioridade"],
  "exercicios_contraindicados": [ { "exercicio": "nome do exercício", "motivo": "por que contraindicar" } ],
  "exercicios_cautela": [ { "exercicio": "nome do exercício", "adaptacao": "como adaptar para tornar seguro" } ],
  "score_postural": { "total": 0, "cabeca_cervical": 0, "coluna_toracolombar": 0, "pelve_quadril": 0, "membros_inferiores": 0, "obs": "escala de 0 a 10 onde 10 é ideal" },
  "score_funcional": { "total": 0, "mobilidade_tornozelo": 0, "mobilidade_quadril": 0, "estabilidade_lombar": 0, "controle_joelho": 0, "simetria_movimento": 0, "obs": "escala de 0 a 10 onde 10 é ideal" },
  "report_sections": {
    "postura": "bloco estruturado do relatório: postura estática por vista",
    "overhead_squat": "bloco estruturado do relatório: OHS por vista + compensações",
    "laudo": "bloco estruturado do relatório: leitura técnica, flags e prioridades",
    "contexto_prescricao": "bloco estruturado do relatório: o que a prescrição deve respeitar"
  },
  "prescription_context": {
    "contract": "bn_functional_assessment_v1",
    "ohs_compensations": "copiar exatamente o array ohs_compensations",
    "corrective_priorities": ["prioridades em ordem"],
    "shortened_muscles": ["músculos encurtados"],
    "weak_muscles": ["músculos fracos/inibidos"],
    "movement_restrictions": ["restrições"],
    "contraindicated_exercises": ["exercícios/padrões contraindicados"],
    "caution_exercises": ["exercícios/padrões com cautela/adaptação"],
    "summary_for_prescription": "contexto técnico direto para ai-prescribe-workout"
  },
  "relatorio_para_aluno": "Texto em português claro, acolhedor e motivador (3-5 parágrafos). Explica o que foi encontrado em linguagem acessível, sem termos técnicos excessivos. Tom: profissional e encorajador.",
  "resumo_para_prescricao": "Texto técnico resumido (2-3 parágrafos) para quem vai prescrever: principais disfunções, músculos a priorizar, restrições e orientações por modalidade."
}

REGRAS:
- SEMPRE preencha "frame_findings" com um item por imagem recebida, copiando o frameId rotulado. Se uma vista não tiver compensação, use findings: [].
- SEMPRE retorne os 7 itens de "ohs_compensations", nesta ordem e com as keys exatas: dorsiflexion_limitation, dynamic_valgus, trunk_forward_lean, butt_wink, pelvic_drop_trendelenburg, shoulder_protraction_kyphosis, overhead_arm_asymmetry.
- Para cada item de "ohs_compensations", marque presente=false e severidade="ausente" quando não observar; se a imagem não permitir concluir, use severidade="incerta" e explique a limitação em evidencia.
- "frame_referencia" deve apontar para o melhor frameId observado. Se não houver frame aplicável, use null.
- "implicacao_treino" deve sempre traduzir o achado para prescrição BN: mobilidade, ativação, controle motor, exercício, amplitude, carga, volume ou progressão.
- "report_sections" deve seguir o formato do relatório BN: postura + overhead squat + laudo + contexto p/ prescrição.
- "prescription_context" é o contrato que a IA de musculação vai consumir; não coloque texto genérico, coloque restrições e prioridades acionáveis.
- Baseie "disfuncoes_identificadas" no conjunto de TODAS as imagens.
- Se os frames seguirem a sequência oficial BN, preencha "sequencia_bn_video", "direcionamento_protocolo", "red_yellow_flags" e "criterios_progressao_bn" mesmo que algumas vistas clássicas de postura/OHS estejam ausentes.
- Nunca invente dor, diagnóstico ou dado clínico. Se uma dor não foi informada, escreva que não foi relatada e use baixa/média confiança.
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
    const {
      student_id,
      student_name,
      company_id,
      assessment_id,        // se presente → fluxo de fotos: a função persiste no banco
      frames,               // fluxo VÍDEO: [{ vista, data(base64), frameId }]
      image_postura_frente, image_postura_lado, image_postura_costas,
      image_squat_frente, image_squat_lado, image_squat_costas,
      queixa_principal = "",
      historico_lesoes = "",
      modalidade = "",
      nivel = "",
      peso_kg = "",
      altura_cm = "",
      cintura_cm = "",
      percentual_gordura = "",
      perimetros = "",
      observacoes_tecnicas = "",
      assessment_source = "",
      protocol_hint = "",
      company_protocol_version,
      expected_movements = [],
      frame_findings = [],
    } = await req.json();

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const authz = await assertTenantAccess(supabaseAdmin, claims, {
      companyId: company_id,
      studentId: student_id,
      requireStaff: true,
    });
    const authorizedCompanyId = authz.companyId;
    await requireCompanyFeature(supabaseAdmin, authorizedCompanyId, "hasPrescription");
    const companyProtocolCandidate = protocol_hint === 'company_approved_v1' || (Array.isArray(frames) && frames.length > 0)
      || [image_postura_frente, image_postura_lado, image_postura_costas, image_squat_frente, image_squat_lado, image_squat_costas].some(Boolean)
      ? await readCompanyAssessmentProtocol(supabaseAdmin as unknown as AssessmentProtocolReader, authorizedCompanyId)
      : null;
    const companyProtocol = companyProtocolCandidate && (companyProtocolCandidate.version > 0 || protocol_hint === 'company_approved_v1') ? companyProtocolCandidate : null;
    if (companyProtocol) {
      if (!Number.isSafeInteger(company_protocol_version) || company_protocol_version !== companyProtocol.version) throw new HttpError(409, 'O protocolo da empresa mudou. Recarregue a avaliacao e refaca os cortes.');
      try { assertAssessmentFrameCoverage(frames, companyProtocol.protocol); }
      catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Triagem obrigatoria incompleta.'); }
    }
    const effectiveExpectedMovements = companyProtocol ? resolveAssessmentCapture(companyProtocol.protocol).vistas : expected_movements;

    // Monta o conteúdo de imagens, rotulando cada uma com vista + frameId
    const imageContent: any[] = [];
    const frameRefs: FrameRef[] = [];
    const pushImage = (label: string, frameId: string, dataUrlOrB64: string) => {
      if (!dataUrlOrB64) return;
      frameRefs.push({ frameId, vista: label });
      imageContent.push({ type: "text", text: `\n--- ${label} [frameId=${frameId}] ---` });
      imageContent.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: dataUrlOrB64.replace(/^data:image\/\w+;base64,/, "") },
      });
    };

    if (Array.isArray(frames) && frames.length > 0) {
      frames.forEach((fr: any, i: number) =>
        pushImage(fr.vista || `Frame ${i + 1}`, fr.frameId || `frame_${i}`, fr.data || fr.base64 || ""));
    } else {
      [
        { key: image_postura_frente, label: "POSTURA ESTÁTICA — VISTA FRONTAL", id: "postura_frente" },
        { key: image_postura_lado,   label: "POSTURA ESTÁTICA — VISTA LATERAL", id: "postura_lado" },
        { key: image_postura_costas, label: "POSTURA ESTÁTICA — VISTA POSTERIOR", id: "postura_costas" },
        { key: image_squat_frente,   label: "OVERHEAD SQUAT — VISTA FRONTAL", id: "squat_frente" },
        { key: image_squat_lado,     label: "OVERHEAD SQUAT — VISTA LATERAL", id: "squat_lado" },
        { key: image_squat_costas,   label: "OVERHEAD SQUAT — VISTA POSTERIOR", id: "squat_costas" },
      ].forEach((s) => pushImage(s.label, s.id, s.key));
    }

    const incomingFrameFindings = Array.isArray(frame_findings) ? frame_findings : [];
    const frameMetricContext = Array.isArray(frames)
      ? frames.map((fr: any, i: number) => ({
        ...(incomingFrameFindings.find((item: any) => item?.frameId === (fr.frameId || `frame_${i}`)) || {}),
        frameId: fr.frameId || `frame_${i}`,
        vista: fr.vista || `Frame ${i + 1}`,
        metrics: fr.metrics ?? fr.measurements ?? fr.pose_metrics ?? fr.landmark_metrics ?? fr.analysis_metrics ?? null,
        measurements: fr.measurements ?? null,
        pose_metrics: fr.pose_metrics ?? null,
        findings: Array.isArray(fr.findings) ? fr.findings : [],
        observacao: fr.observacao ?? fr.observacoes ?? null,
      }))
      : incomingFrameFindings;

    const hasTextAssessmentData = [
      peso_kg,
      altura_cm,
      cintura_cm,
      percentual_gordura,
      perimetros,
      observacoes_tecnicas,
      queixa_principal,
      historico_lesoes,
    ].some((value) => String(value || "").trim());

    if (imageContent.length === 0 && !hasTextAssessmentData) {
      return new Response(JSON.stringify({ error: "Envie frames/fotos ou preencha dados textuais para a avaliação." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anamneseText = `
DADOS DO ALUNO:
Nome: ${clean(student_name || "não informado")}
Modalidade: ${clean(modalidade || "não informada")}
Nível: ${clean(nivel || "não informado")}
Queixa principal: ${clean(queixa_principal || "nenhuma")}
Histórico de lesões: ${clean(historico_lesoes || "nenhum")}
Peso: ${clean(peso_kg || "não informado")}
Altura: ${clean(altura_cm || "não informada")}
Cintura: ${clean(cintura_cm || "não informada")}
Percentual de gordura informado: ${clean(percentual_gordura || "não informado")}
Perímetros/dobras/outros dados de composição: ${clean(perimetros || "não informado")}
Observações técnicas do professor: ${clean(observacoes_tecnicas || "nenhuma")}
Origem da avaliação: ${clean(assessment_source || "não informada")}
Pista de protocolo: ${clean(protocol_hint || "não informada")}
Movimentos esperados no vídeo: ${Array.isArray(effectiveExpectedMovements) ? effectiveExpectedMovements.map(clean).join(", ") : clean(effectiveExpectedMovements || "não informado")}

${imageContent.length > 0
  ? "Analise TODAS as imagens acima e retorne o JSON conforme instruído, incluindo um item em frame_findings para CADA imagem (use o frameId rotulado)."
  : "Sem imagens nesta avaliação. Gere uma leitura conservadora baseada somente nos dados informados; use frame_findings como array vazio e marque baixa confiança nos achados visuais."}
    `.trim();
    imageContent.push({ type: "text", text: anamneseText });
    const aiConfig = await loadCompanyAiConfig(supabaseAdmin, authorizedCompanyId);

    let assessmentJson: any = null;
    let reportText = "";
    let resumoPrescricao = "";
    let frameFindings: any[] = [];
    let rawText = "";

    if (AI_FIRST && ANTHROPIC_API_KEY) {
      try {
        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: `${SYSTEM_PROMPT}\n\n${companyAiSystem(aiConfig)}`, messages: [{ role: "user", content: imageContent }] }),
        });

        if (!aiResponse.ok) {
          console.warn("ai-functional-assessment fallback", `anthropic_${aiResponse.status}`);
        } else {
          const aiData = await aiResponse.json();
          rawText = aiData.content?.[0]?.text ?? "";
          assessmentJson = normalizeAssessmentEngineJson(extractJson(rawText), frameRefs);
        }
      } catch (error) {
        console.warn("ai-functional-assessment fallback", error instanceof Error ? error.message : String(error));
      }
    }

    if (!assessmentJson) {
      assessmentJson = buildAssessmentEngineJson({
        frameRefs,
        queixa_principal,
        historico_lesoes,
        modalidade,
        nivel,
        peso_kg,
        altura_cm,
        cintura_cm,
        percentual_gordura,
        perimetros,
        observacoes_tecnicas,
        assessment_source,
        protocol_hint,
        expected_movements: effectiveExpectedMovements,
        frame_findings: frameMetricContext,
        reason: AI_FIRST ? (ANTHROPIC_API_KEY ? "vision_unavailable" : "anthropic_key_missing") : "deterministic_first",
      });
      rawText = JSON.stringify(assessmentJson);
    }
    if (companyProtocol) assessmentJson.company_protocol_provenance = {
      company_id: authorizedCompanyId, version: companyProtocol.version,
      protocol: companyProtocol.protocol,
      capture: resolveAssessmentCapture(companyProtocol.protocol),
      updated_at: companyProtocol.updated_at, updated_by: companyProtocol.updated_by,
      criteria_source: 'existing_immutable_assessment_engine',
    };
    reportText = assessmentJson.relatorio_para_aluno || "";
    resumoPrescricao = assessmentJson.resumo_para_prescricao || "";
    frameFindings = assessmentJson.frame_findings || [];

    if (assessmentJson) {
      const presentCompensations = Array.isArray(assessmentJson.ohs_compensations)
        ? assessmentJson.ohs_compensations.filter((item: any) => item?.presente)
        : [];
      await writeAiDecisionLog(supabaseAdmin, {
        student_id,
        company_id: authorizedCompanyId,
        source: "avaliacao",
        summary: `${presentCompensations.length} compensações OHS presentes; protocolo ${clean(assessmentJson.direcionamento_protocolo || "nao informado")}.`,
        payload: {
          assessment_id: assessment_id ?? null,
          ohs_compensations: assessmentJson.ohs_compensations ?? [],
          report_sections: assessmentJson.report_sections ?? null,
          prescription_context: assessmentJson.prescription_context ?? null,
          red_yellow_flags: assessmentJson.red_yellow_flags ?? [],
        },
      });
    }

    // Persiste só no fluxo de fotos (assessment_id presente). No vídeo, o frontend grava após edição.
    if (assessment_id) {
      await supabaseAdmin.from("functional_assessments").upsert({
        id: assessment_id, company_id: authorizedCompanyId, student_id,
        queixa_principal: clean(queixa_principal), historico_lesoes: clean(historico_lesoes),
        modalidade: clean(modalidade), nivel: clean(nivel),
        ai_raw_response: rawText, report_text: reportText, assessment_json: assessmentJson, status: "completed",
      });
    }

    return new Response(
      JSON.stringify({
        id: assessment_id || null,
        report_text: reportText,
        assessment_json: assessmentJson,
        resumo_prescricao: resumoPrescricao,
        frame_findings: frameFindings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: e instanceof HttpError ? e.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
