import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertBundleAccess, assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";
import { planAdvancedMethods } from "../_shared/prescription/advancedMethods.ts";
import { buildPrescriptionInputFromEdgePayload } from "../_shared/prescription/adapters/inputAdapter.ts";
import { adaptTrainingProgramForAiStrengthPlan } from "../_shared/prescription/adapters/outputAdapter.ts";
import { generateTrainingProgram } from "../_shared/prescription/engine.ts";
import { clinicalRiskText, prescriptionRiskText } from "../_shared/prescription/clinicalContext.ts";
import { targetVolumeFactor } from "../_shared/prescription/volumeRules.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5-20250929";
// O BN Prescription Engine v1 é o gerador principal: determinístico, biblioteca-only
// e com periodização semanal executável. A IA, quando ligada, apenas enriquece textos;
// buildEmergencyFallbackPlan fica como último recurso se o engine falhar.
const AI_FIRST = (Deno.env.get("PRESCRIPTION_AI_FIRST") ?? "off").trim().toLowerCase() === "on";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const clean = (s: unknown) => String(s || "").replace(/[^\x20-\x7E\u00C0-\u017F]/g, "");

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

interface ExerciseCatalogEntry {
  id: string;
  name: string;
  description: string | null;
  muscle_group: string | null;
  equipment?: string | null;
  difficulty?: string | null;
  contraindications: string[];
  regressions: string[];
  progressions: string[];
  equivalent_substitutes: string[];
  pain_limitation_tags: string[];
  targets: Array<{
    muscle_group: string;
    role: string | null;
    volume_percentage: number | null;
  }>;
}

interface ExerciseCatalog {
  company_id: string | null;
  total: number;
  exercises: ExerciseCatalogEntry[];
}

interface ValidationWarning {
  severity: "info" | "warning" | "blocker";
  code: string;
  message: string;
  recommendation: string;
  source: "biblioteca" | "volume" | "anamnese" | "avaliacao_funcional" | "objetivo" | "nivel" | "periodizacao" | "metodologia_bn";
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

const METHODOLOGY_PRESETS = {
  hipertrofia_iniciante: {
    label: "Hipertrofia iniciante",
    target_weekly_sets: "8-12 series efetivas por grupo prioritario; maximo conservador de 14-16 para MMII quando houver boa recuperacao",
    reps: "8-12 nos multiarticulares, 10-15 nos acessorios",
    rir: "2-3",
    methods_by_block: {
      "1-2": ["base tecnica", "tempo controlado"],
      "3-4": ["aumento discreto de series ou carga", "progressao dupla"],
      "5-6": ["up-set leve apenas em exercicio estavel"],
    },
  },
  hipertrofia_intermediario: {
    label: "Hipertrofia intermediario",
    target_weekly_sets: "10-16 series efetivas por grupo prioritario; 16-20 apenas com justificativa e boa tolerancia",
    reps: "6-12 nos multiarticulares, 10-15 nos acessorios",
    rir: "1-3",
    methods_by_block: {
      "1-2": ["volume base", "progressao dupla"],
      "3-4": ["piramide ou up-set em padroes estaveis"],
      "5-6": ["drop-set seletivo em isoladores seguros"],
    },
  },
  emagrecimento: {
    label: "Emagrecimento",
    target_weekly_sets: "8-14 series por grupo, mantendo tecnica e recuperacao para aderencia",
    reps: "8-15 com descansos moderados e densidade controlada",
    rir: "2-4",
    methods_by_block: {
      "1-2": ["base tecnica", "densidade baixa/moderada"],
      "3-4": ["reduzir descansos em acessorios", "circuito tecnico sem falha"],
      "5-6": ["metodo metabolico seletivo sem comprometer dor/tecnica"],
    },
  },
  recomposicao: {
    label: "Recomposicao corporal",
    target_weekly_sets: "10-16 series por grupo prioritario com controle de fadiga",
    reps: "6-12 forca/hipertrofia + 12-15 acessorios",
    rir: "2-3",
    methods_by_block: {
      "1-2": ["base tecnica e volume moderado"],
      "3-4": ["progressao de carga ou reps"],
      "5-6": ["piramide/up-set em exercicios estaveis"],
    },
  },
  forca: {
    label: "Forca",
    target_weekly_sets: "6-12 series efetivas nos padroes principais; acessorios suficientes para suporte tecnico",
    reps: "3-6 em forca global, 8-12 em suporte",
    rir: "1-3, nunca falha sistematica",
    methods_by_block: {
      "1-2": ["tecnica e exposicao submaxima"],
      "3-4": ["intensificacao controlada"],
      "5-6": ["cluster-set apenas se nivel e avaliacao permitirem"],
    },
  },
  retorno_lesao: {
    label: "Retorno de lesao",
    target_weekly_sets: "6-10 series por grupo afetado, progressao por tolerancia e dor <= 3",
    reps: "10-15 com amplitude livre de dor; isometria/tempo quando seguro",
    rir: "3-4",
    methods_by_block: {
      "1-2": ["mobilidade", "ativacao", "controle motor"],
      "3-4": ["aumentar amplitude/carga apenas sem dor"],
      "5-6": ["integrar padrao global conservador"],
    },
  },
  corrida_musculacao: {
    label: "Corrida + musculacao",
    target_weekly_sets: "6-12 series MMII, 8-14 MMSS/core, reduzindo 20% vs nao corredor",
    reps: "4-8 forca global, 8-12 acessorios, foco unilateral/excentrico",
    rir: "2-3",
    methods_by_block: {
      "1-2": ["base tecnica anti-interferencia"],
      "3-4": ["progressao discreta com deload sincronizado"],
      "5-6": ["potencia apenas se liberado e fora de semana critica da corrida"],
    },
  },
};

function compactJson(value: unknown, maxLength = 20000) {
  return JSON.stringify(value ?? {}, null, 2).slice(0, maxLength);
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
- Nome da IA/assistente: ${clean(config.assistant_name || "BNITO")}
- Nome da consultoria/app: ${clean(config.consultancy_name || "BN Performance Training")}
- Tom desejado: ${clean(config.tone || "tecnico, direto, humano e seguro")}
- Credenciais/voz do dono: ${config.owner_credentials ? clean(config.owner_credentials).slice(0, 2000) : "Nao informado; nao inventar autoridade."}
- Publico/nicho atendido: ${config.niche_audience ? clean(config.niche_audience).slice(0, 2000) : "Nao informado; usar contexto real do aluno."}
- Metodologia proprietaria da empresa: ${config.methodology ? clean(config.methodology).slice(0, 4000) : "Usar a Metodologia BN raiz deste prompt como fallback."}
- Preferencias de exercicios/biblioteca: ${config.exercise_preferences ? clean(config.exercise_preferences).slice(0, 2500) : "Seguir biblioteca do app e metodologia BN."}
- Modelo de progressao: ${config.progression_model ? clean(config.progression_model).slice(0, 2500) : "Periodizacao BN de 6 semanas com ajustes a cada 2 semanas."}
- Protocolo de avaliacao: ${config.assessment_protocol ? clean(config.assessment_protocol).slice(0, 2500) : "Usar avaliacao funcional BN e dados recebidos."}
- Linhas vermelhas da empresa: ${config.red_lines ? clean(config.red_lines).slice(0, 2500) : "Seguir linhas vermelhas BN de dor, seguranca e biblioteca."}
- Estilo de comunicacao: ${config.communication_style ? clean(config.communication_style).slice(0, 1500) : "Tecnico, direto, humano e seguro."}
- Escopo nutricional: ${config.nutrition_scope ? clean(config.nutrition_scope).slice(0, 1500) : "Nao usar para prescricao de treino salvo como contexto de rotina."}
- Limites eticos: ${config.ethical_limits ? clean(config.ethical_limits).slice(0, 2500) : "Nao diagnosticar, nao prometer resultado e nao ultrapassar escopo profissional."}
- Planos/pagamentos/posicionamento: ${config.plans_payment ? clean(config.plans_payment).slice(0, 2500) : "Nao informado; nao inventar dados comerciais."}

Use essa configuracao para nomes, tom, selecao de exercicios, progressao e contexto da empresa. Se metodologia, preferencias ou tom conflitarem com seguranca, dor, biblioteca de exercicios, limites eticos ou linhas vermelhas BN, preserve a regra mais conservadora.
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

function asTextArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function selectByExerciseIdChunks(
  supabase: any,
  table: string,
  columns: string,
  exerciseIds: string[],
  options: { companyId?: string | null; chunkSize?: number } = {},
) {
  const rows: any[] = [];
  for (const ids of chunkArray(exerciseIds, options.chunkSize ?? 80)) {
    let query = supabase.from(table).select(columns).in("exercise_id", ids);
    if (options.companyId) query = query.eq("company_id", options.companyId);
    const { data, error } = await query;
    if (error) return { data: rows, error };
    rows.push(...((data ?? []) as any[]));
  }
  return { data: rows, error: null };
}

async function loadExerciseCatalog(
  supabase: any,
  companyId: string | null,
): Promise<ExerciseCatalog> {
  // Catálogo COMPLETO via paginação: considerar TODOS os exercícios disponíveis como pool de
  // candidatos (sem teto fixo antigo de 700). PostgREST limita ~1000 linhas/requisição, então
  // paginamos com range() até a biblioteca acabar. Filtros/select/ordem preservados por página.
  const CATALOG_PAGE_SIZE = 1000;
  const makeExerciseLibraryQuery = (from: number, to: number) => {
    const q = supabase
      .from("exercise_library")
      .select("id, name, description, muscle_group, equipment, difficulty, is_global, company_id")
      .order("muscle_group", { ascending: true })
      .order("name", { ascending: true })
      .range(from, to);
    return companyId
      ? q.or(`is_global.eq.true,company_id.eq.${companyId}`)
      : q.eq("is_global", true);
  };

  const exerciseRows: any[] = [];
  for (let from = 0; ; from += CATALOG_PAGE_SIZE) {
    const { data, error: exerciseError } = await makeExerciseLibraryQuery(from, from + CATALOG_PAGE_SIZE - 1);
    if (exerciseError) {
      throw new Error(`Falha ao carregar biblioteca de exercicios: ${exerciseError.message}`);
    }
    const page = (data ?? []) as any[];
    if (page.length === 0) break;
    exerciseRows.push(...page);
    if (page.length < CATALOG_PAGE_SIZE) break;
  }
  const exerciseIds = exerciseRows.map((exercise) => exercise.id as string).filter(Boolean);

  const [targetsResult, groupsResult, overridesResult, metadataResult] = await Promise.all([
    exerciseIds.length
      ? selectByExerciseIdChunks(
          supabase,
          "exercise_muscle_targets",
          "exercise_id, muscle_group_id, role, volume_percentage",
          exerciseIds,
        )
      : Promise.resolve({ data: [], error: null }),
    supabase.from("muscle_groups").select("id, name"),
    companyId && exerciseIds.length
      ? selectByExerciseIdChunks(
          supabase,
          "company_exercise_volumes",
          "exercise_id, muscle_group_id, volume_percentage",
          exerciseIds,
          { companyId },
        )
      : Promise.resolve({ data: [], error: null }),
    exerciseIds.length
      ? selectByExerciseIdChunks(
          supabase,
          "exercise_metadata",
          "exercise_id, contraindications, regressions, progressions, equivalent_substitutes, pain_limitation_tags",
          exerciseIds,
        )
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (targetsResult.error) throw new Error(`Falha ao carregar alvos musculares: ${targetsResult.error.message}`);
  if (groupsResult.error) throw new Error(`Falha ao carregar grupos musculares: ${groupsResult.error.message}`);
  if (overridesResult.error) throw new Error(`Falha ao carregar volumes da empresa: ${overridesResult.error.message}`);
  if (metadataResult.error) {
    console.warn("exercise_metadata skipped:", metadataResult.error.message);
  }

  const groupNames = new Map<string, string>();
  for (const group of ((groupsResult.data ?? []) as any[])) {
    groupNames.set(group.id as string, group.name as string);
  }

  const volumeOverrides = new Map<string, number>();
  for (const override of ((overridesResult.data ?? []) as any[])) {
    volumeOverrides.set(
      `${override.exercise_id as string}:${override.muscle_group_id as string}`,
      override.volume_percentage as number,
    );
  }

  const targetsByExercise = new Map<string, ExerciseCatalogEntry["targets"]>();
  for (const target of ((targetsResult.data ?? []) as any[])) {
    const exerciseId = target.exercise_id as string;
    const muscleGroupId = target.muscle_group_id as string;
    const targets = targetsByExercise.get(exerciseId) ?? [];
    targets.push({
      muscle_group: groupNames.get(muscleGroupId) ?? muscleGroupId,
      role: (target.role as string | null) ?? null,
      volume_percentage:
        volumeOverrides.get(`${exerciseId}:${muscleGroupId}`) ??
        ((target.volume_percentage as number | null) ?? null),
    });
    targetsByExercise.set(exerciseId, targets);
  }

  const metadataByExercise = new Map<string, {
    contraindications: string[];
    regressions: string[];
    progressions: string[];
    equivalent_substitutes: string[];
    pain_limitation_tags: string[];
  }>();
  if (!metadataResult.error) {
    for (const row of ((metadataResult.data ?? []) as any[])) {
      metadataByExercise.set(row.exercise_id as string, {
        contraindications: asTextArray(row.contraindications),
        regressions: asTextArray(row.regressions),
        progressions: asTextArray(row.progressions),
        equivalent_substitutes: asTextArray(row.equivalent_substitutes),
        pain_limitation_tags: asTextArray(row.pain_limitation_tags),
      });
    }
  }

  return {
    company_id: companyId,
    total: exerciseRows.length,
    exercises: exerciseRows.map((exercise) => ({
      id: exercise.id as string,
      name: exercise.name as string,
      description: (exercise.description as string | null) ?? null,
      muscle_group: (exercise.muscle_group as string | null) ?? null,
      equipment: (exercise.equipment as string | null) ?? null,
      difficulty: (exercise.difficulty as string | null) ?? null,
      contraindications: metadataByExercise.get(exercise.id as string)?.contraindications ?? [],
      regressions: metadataByExercise.get(exercise.id as string)?.regressions ?? [],
      progressions: metadataByExercise.get(exercise.id as string)?.progressions ?? [],
      equivalent_substitutes: metadataByExercise.get(exercise.id as string)?.equivalent_substitutes ?? [],
      pain_limitation_tags: metadataByExercise.get(exercise.id as string)?.pain_limitation_tags ?? [],
      targets: targetsByExercise.get(exercise.id as string) ?? [],
    })),
  };
}

function formatExerciseCatalog(catalog: ExerciseCatalog) {
  return compactJson(
    {
      total_available: catalog.total,
      company_id: catalog.company_id,
      exercises: catalog.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        group: exercise.muscle_group ?? "nao_informado",
        targets: exercise.targets
          .map((target) =>
            [
              target.muscle_group,
              target.role ? `role:${target.role}` : null,
              target.volume_percentage !== null ? `volume:${target.volume_percentage}%` : null,
            ]
              .filter(Boolean)
              .join(" "),
          )
          .join("; "),
        description: exercise.description ? clean(exercise.description).slice(0, 120) : undefined,
        contraindications: exercise.contraindications.length ? exercise.contraindications.join("; ") : undefined,
        regressions: exercise.regressions.length ? exercise.regressions.join("; ") : undefined,
        progressions: exercise.progressions.length ? exercise.progressions.join("; ") : undefined,
        equivalent_substitutes: exercise.equivalent_substitutes.length ? exercise.equivalent_substitutes.join(", ") : undefined,
        pain_limitation_tags: exercise.pain_limitation_tags.length ? exercise.pain_limitation_tags.join("; ") : undefined,
      })),
    },
    20000,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePlanLibraryUsage(plan: unknown, validExerciseIds: Set<string>) {
  if (!isRecord(plan)) return null;
  const workouts = Array.isArray(plan.workouts) ? plan.workouts : [];
  const missing: string[] = [];
  const invalid: string[] = [];

  workouts.forEach((workout, workoutIndex) => {
    if (!isRecord(workout)) return;
    const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
    exercises.forEach((exercise, exerciseIndex) => {
      if (!isRecord(exercise)) return;
      const label = `workouts[${workoutIndex}].exercises[${exerciseIndex}]`;
      const exerciseId = exercise.exercise_id;
      if (typeof exerciseId !== "string" || !exerciseId.trim()) {
        missing.push(label);
        return;
      }
      if (!validExerciseIds.has(exerciseId)) invalid.push(`${label}:${exerciseId}`);
    });
  });

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

function normalizeText(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return clean(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function selectMethodologyPreset(
  objective: unknown,
  fitnessLevel: unknown,
  restrictions: unknown,
  anamneseContext: unknown,
  isEnduranceAthlete: unknown,
) {
  const objectiveText = normalizeText(objective);
  const levelText = normalizeText(fitnessLevel);
  const riskText = clinicalRiskText({ restrictions, anamneseContext });
  if (riskText.match(/lesao|lesoes|dor|eva|retorno|pos[- ]?operatorio|cirurgia|radicul|formigamento/)) return "retorno_lesao";
  if (isEnduranceAthlete) return "corrida_musculacao";
  if (objectiveText.includes("forca")) return "forca";
  if (objectiveText.includes("emagrec") || objectiveText.includes("perda") || objectiveText.includes("gordura")) return "emagrecimento";
  if (objectiveText.includes("recompos")) return "recomposicao";
  if (objectiveText.includes("hipertrof")) return levelText.includes("inic") ? "hipertrofia_iniciante" : "hipertrofia_intermediario";
  return levelText.includes("inic") ? "hipertrofia_iniciante" : "recomposicao";
}

function extractOhsCompensations(assessmentContext: unknown): any[] {
  if (!isRecord(assessmentContext)) return [];
  const direct = assessmentContext.ohs_compensations;
  const nested = isRecord(assessmentContext.prescription_context)
    ? assessmentContext.prescription_context.ohs_compensations
    : null;
  return Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : [];
}

function buildVolumeSummary(plan: unknown, catalog: ExerciseCatalog) {
  const exerciseMap = new Map(catalog.exercises.map((exercise) => [exercise.id, exercise]));
  const weeklySets = new Map<string, number>();
  if (!isRecord(plan) || !Array.isArray(plan.workouts)) return weeklySets;

  for (const workout of plan.workouts) {
    if (!isRecord(workout) || !Array.isArray(workout.exercises)) continue;
    for (const exercise of workout.exercises) {
      if (!isRecord(exercise)) continue;
      const sets = typeof exercise.sets === "number" ? exercise.sets : Number(exercise.sets || 0);
      if (!Number.isFinite(sets) || sets <= 0) continue;
      const exerciseId = typeof exercise.exercise_id === "string" ? exercise.exercise_id : "";
      const catalogExercise = exerciseMap.get(exerciseId);
      const targets = catalogExercise?.targets?.length
        ? catalogExercise.targets
        : [{ muscle_group: clean(exercise.muscle_group || catalogExercise?.muscle_group || "nao_informado"), role: null, volume_percentage: 100 }];
      for (const target of targets) {
        const group = target.muscle_group || "nao_informado";
        const multiplier = targetVolumeFactor(target);
        weeklySets.set(group, (weeklySets.get(group) ?? 0) + sets * multiplier);
      }
    }
  }
  return weeklySets;
}

function hasAdvancedMethod(plan: unknown) {
  const text = normalizeText(plan);
  return /(drop[- ]?set|cluster[- ]?set|piramide|up[- ]?set|rest[- ]?pause|bi[- ]?set|tri[- ]?set)/.test(text);
}

function collectPlanExercises(plan: unknown) {
  if (!isRecord(plan) || !Array.isArray(plan.workouts)) return [];
  return plan.workouts.flatMap((workout) => {
    if (!isRecord(workout) || !Array.isArray(workout.exercises)) return [];
    return workout.exercises.filter(isRecord);
  });
}

function metadataMatchesRisk(exercise: ExerciseCatalogEntry | undefined, riskText: string) {
  if (!exercise) return false;
  const metadataText = normalizeText([exercise.contraindications, exercise.pain_limitation_tags]);
  if (!metadataText) return false;
  return ["joelho", "lombar", "ombro", "tornozelo", "quadril"].some(
    (term) => riskText.includes(term) && metadataText.includes(term),
  );
}

function hasPhase(plan: unknown, phase: string) {
  if (!isRecord(plan) || !Array.isArray(plan.workouts)) return false;
  return plan.workouts.some((workout) =>
    isRecord(workout) && Array.isArray(workout.exercises) &&
    workout.exercises.some((exercise) => isRecord(exercise) && normalizeText(exercise.phase).includes(phase)),
  );
}

function validatePrescriptionPlan(args: {
  plan: any;
  libraryValidation: ReturnType<typeof validatePlanLibraryUsage>;
  catalog: ExerciseCatalog;
  objective: unknown;
  fitnessLevel: unknown;
  restrictions: unknown;
  anamneseContext: unknown;
  assessmentContext: unknown;
  durationWeeks: unknown;
  blockNumber: unknown;
  isEnduranceAthlete: unknown;
}) {
  const warnings: ValidationWarning[] = [];
  const blockers: ValidationWarning[] = [];
  const add = (warning: ValidationWarning) => {
    if (warning.severity === "blocker") blockers.push(warning);
    else warnings.push(warning);
  };

  if (args.libraryValidation && !args.libraryValidation.valid) {
    add({
      severity: "blocker",
      code: "library_exercise_contract_failed",
      message: "A prescricao contem exercicios sem exercise_id ou fora da biblioteca do app.",
      recommendation: "Regerar ou ajustar usando somente exercise_id real da biblioteca; registre lacunas em library_policy.gaps.",
      source: "biblioteca",
    });
  }

  const duration = Number(args.plan?.duration_weeks || args.durationWeeks || 0);
  if (duration !== 6) {
    add({
      severity: "warning",
      code: "periodization_duration_not_6_weeks",
      message: "A metodologia desta fase exige ciclo de exatamente 6 semanas.",
      recommendation: "Ajustar duration_weeks para 6 e manter blocos 1-2, 3-4 e 5-6.",
      source: "periodizacao",
    });
  }

  const blocks = Array.isArray(args.plan?.periodization_blocks) ? args.plan.periodization_blocks : [];
  const blockText = normalizeText(blocks);
  for (const requiredBlock of ["1-2", "3-4", "5-6"]) {
    if (!blockText.includes(requiredBlock)) {
      add({
        severity: "warning",
        code: `missing_periodization_block_${requiredBlock}`,
        message: `Bloco ${requiredBlock} nao apareceu claramente na periodizacao.`,
        recommendation: "Declarar estimulo, metodo e regra de progressao para este bloco.",
        source: "periodizacao",
      });
    }
  }

  const clinicalText = clinicalRiskText({
    restrictions: args.restrictions,
    anamneseContext: args.anamneseContext,
  });
  const riskText = prescriptionRiskText({
    restrictions: args.restrictions,
    anamneseContext: args.anamneseContext,
    assessmentContext: args.assessmentContext,
  });
  const levelText = normalizeText(args.fitnessLevel);
  const objectiveText = normalizeText(args.objective);
  const painActive = /(dor|eva\s*[1-9]|eva\s*10|joelho|lombar|ombro|tornozelo|quadril|lesao|lesoes|retorno|reabilit)/.test(clinicalText);
  const exerciseMap = new Map(args.catalog.exercises.map((exercise) => [exercise.id, exercise]));

  if ((levelText.includes("inic") || painActive) && hasAdvancedMethod(args.plan)) {
    add({
      severity: painActive ? "warning" : "info",
      code: "advanced_method_requires_justification",
      message: "Ha metodo avancado em contexto iniciante ou com dor/lesao.",
      recommendation: "Usar metodo avancado apenas em exercicio estavel, sem dor, preferencialmente no bloco 5-6; caso contrario trocar por progressao dupla.",
      source: "nivel",
    });
  }

  const planText = normalizeText(args.plan);
  if (Number(args.blockNumber || 1) < 2 && /(pliometr|salto|jump|hop|bound)/.test(planText)) {
    add({
      severity: "warning",
      code: "plyometrics_in_initial_block",
      message: "Pliometria apareceu no primeiro bloco, mas a metodologia BN bloqueia pliometria nas primeiras 6 semanas/inicio.",
      recommendation: "Remover pliometria e substituir por controle motor, forca global tecnica e acessorios.",
      source: "metodologia_bn",
    });
  }

  const compensations = extractOhsCompensations(args.assessmentContext).filter((item) => isRecord(item) && item.presente);
  if (compensations.length > 0 && (!hasPhase(args.plan, "mobilidade") || !hasPhase(args.plan, "ativacao"))) {
    add({
      severity: "warning",
      code: "ohs_compensation_without_corrective_phases",
      message: "A avaliacao funcional indicou compensacoes, mas o treino nao deixou claro mobilidade/ativacao corretiva.",
      recommendation: "Incluir mobilidade e ativacao especifica ligadas aos achados do OHS antes da forca global.",
      source: "avaliacao_funcional",
    });
  }

  const weeklySets = buildVolumeSummary(args.plan, args.catalog);
  const highSetLimit = levelText.includes("inic") ? 16 : objectiveText.includes("forca") ? 14 : 20;
  const lowSetLimit = objectiveText.includes("hipertrof") ? 8 : 6;
  const volume_review = Array.from(weeklySets.entries()).map(([muscle_group, sets]) => {
    const reviewStatus: "baixo" | "ok" | "alto" = sets < lowSetLimit ? "baixo" : sets > highSetLimit ? "alto" : "ok";
    return {
      muscle_group,
      weekly_sets: Math.round(sets * 10) / 10,
      status: reviewStatus,
      note: reviewStatus === "baixo"
        ? "Volume possivelmente baixo para o objetivo, se este grupo for prioridade."
        : reviewStatus === "alto"
          ? "Volume alto; exige justificativa, recuperacao e ausencia de dor."
          : "Volume dentro da faixa conservadora.",
    };
  });

  for (const review of volume_review) {
    if (review.status === "alto") {
      add({
        severity: "warning",
        code: `high_weekly_volume_${normalizeText(review.muscle_group).replace(/\s+/g, "_")}`,
        message: `${review.muscle_group}: ${review.weekly_sets} series/semana estimadas.`,
        recommendation: levelText.includes("inic")
          ? "Reduzir para <=16 series/semana ou justificar progressao por historico/tolerancia."
          : "Confirmar recuperacao, sono, dor e distribuicao antes de manter >20 series/semana.",
        source: "volume",
      });
    }
  }

  if (painActive) {
    add({
      severity: "warning",
      code: "pain_or_injury_requires_conservative_progression",
      message: "Anamnese/avaliacao sugere dor, lesao ou regiao sensivel.",
      recommendation: "Manter dor <=3, reduzir amplitude/carga/braco de momento em padroes dolorosos e sinalizar professor se houver piora.",
      source: "anamnese",
    });

    for (const exercise of collectPlanExercises(args.plan)) {
      const exerciseId = typeof exercise.exercise_id === "string" ? exercise.exercise_id : "";
      const catalogExercise = exerciseMap.get(exerciseId);
      if (!metadataMatchesRisk(catalogExercise, riskText)) continue;

      add({
        severity: "warning",
        code: "exercise_metadata_pain_match",
        message: `${catalogExercise?.name ?? "Exercicio"} tem metadado sensivel para a dor/limitacao informada.`,
        recommendation: [
          catalogExercise?.regressions?.[0] ? `Regressao sugerida: ${catalogExercise.regressions[0]}.` : null,
          catalogExercise?.equivalent_substitutes?.[0] ? `Substituto equivalente: ${catalogExercise.equivalent_substitutes[0]}.` : null,
          "Revisar amplitude, carga, tolerancia e sinais de piora antes de salvar.",
        ].filter(Boolean).join(" "),
        source: "biblioteca",
      });
    }
  }

  const status: "ok" | "warnings" | "blocked" = blockers.length
    ? "blocked"
    : warnings.some((warning) => warning.severity === "warning")
      ? "warnings"
      : "ok";

  return {
    status,
    blockers,
    warnings,
    corrections: [],
    volume_review,
    checked_at: new Date().toISOString(),
  };
}

function mergePreSaveValidation(primary: any, secondary: any) {
  const primaryWarnings = Array.isArray(primary?.warnings) ? primary.warnings : [];
  const primaryBlockers = Array.isArray(primary?.blockers) ? primary.blockers : [];
  const primaryCorrections = Array.isArray(primary?.corrections) ? primary.corrections : [];
  const primaryVolume = Array.isArray(primary?.volume_review) ? primary.volume_review : [];
  const secondaryWarnings = Array.isArray(secondary?.warnings) ? secondary.warnings : [];
  const secondaryBlockers = Array.isArray(secondary?.blockers) ? secondary.blockers : [];
  const secondaryCorrections = Array.isArray(secondary?.corrections) ? secondary.corrections : [];
  const secondaryVolume = Array.isArray(secondary?.volume_review) ? secondary.volume_review : [];
  const blockers = [...primaryBlockers, ...secondaryBlockers];
  const warnings = [...primaryWarnings, ...secondaryWarnings];
  return {
    ...secondary,
    ...primary,
    blockers,
    warnings,
    corrections: [...primaryCorrections, ...secondaryCorrections],
    volume_review: primaryVolume.length ? primaryVolume : secondaryVolume,
    status: blockers.length ? "blocked" : warnings.some((warning: any) => warning?.severity === "warning") ? "warnings" : "ok",
    checked_at: new Date().toISOString(),
  };
}

function exerciseText(exercise: ExerciseCatalogEntry) {
  return normalizeText([
    exercise.name,
    exercise.description,
    exercise.muscle_group,
    exercise.targets.map((target) => target.muscle_group).join(" "),
    exercise.pain_limitation_tags.join(" "),
  ].join(" "));
}

function pickCatalogExercise(
  catalog: ExerciseCatalog,
  keywords: string[],
  usedIds: Set<string>,
  riskText: string,
  level: "iniciante" | "intermediario" | "avancado" = "intermediario",
): ExerciseCatalogEntry | null {
  const normalizedKeywords = keywords.map(normalizeText).filter(Boolean);
  const riskTerms = ["joelho", "lombar", "ombro", "tornozelo", "quadril"].filter((term) => riskText.includes(term));
  const scored = catalog.exercises.map((exercise) => {
    const text = exerciseText(exercise);
    const nameText = normalizeText(exercise.name);
    const targetText = normalizeText(exercise.targets.map((t) => t.muscle_group).join(" "));
    const metadataText = normalizeText([exercise.contraindications, exercise.pain_limitation_tags]);
    const riskPenalty = riskTerms.some((term) => metadataText.includes(term)) ? 8 : 0;
    const usedPenalty = usedIds.has(exercise.id) ? 4 : 0;
    // Dificuldade do catálogo: iniciante evita exercício avançado; avançado despriorizado levemente p/ iniciante.
    const diff = normalizeText(exercise.difficulty || "");
    const difficultyPenalty = level === "iniciante" && /avanc|advanced|dificil/.test(diff) ? 6
      : level === "avancado" && /inic|beginner|facil/.test(diff) ? 1 : 0;
    const score = normalizedKeywords.reduce((sum, keyword) => {
      if (!text.includes(keyword)) return sum;
      // Match no NOME ou no músculo-alvo (targets) vale mais que match em descrição solta.
      return sum + 3 + (nameText.includes(keyword) ? 2 : 0) + (targetText.includes(keyword) ? 1 : 0);
    }, 0) - riskPenalty - usedPenalty - difficultyPenalty;
    return { exercise, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored.find((item) => item.score > -4);
  // Se o melhor match tem metadado sensível pro risco, tenta um substituto equivalente do catálogo.
  if (top && riskTerms.length) {
    const meta = normalizeText([top.exercise.contraindications, top.exercise.pain_limitation_tags]);
    if (riskTerms.some((term) => meta.includes(term)) && top.exercise.equivalent_substitutes?.length) {
      for (const subName of top.exercise.equivalent_substitutes) {
        const sub = catalog.exercises.find((e) => !usedIds.has(e.id) && normalizeText(e.name) === normalizeText(subName));
        if (sub && !riskTerms.some((term) => normalizeText([sub.contraindications, sub.pain_limitation_tags]).includes(term))) return sub;
      }
    }
  }
  return top?.exercise || catalog.exercises.find((exercise) => !usedIds.has(exercise.id)) || catalog.exercises[0] || null;
}

// Avaliação funcional → foco corretivo: injeta o corretivo certo na fase de ativação/mobilidade.
function correctiveFocusFromAssessment(riskText: string): { keywords: string[]; cue: string; why: string } | null {
  if (riskText.includes("valgo") || riskText.includes("colapso medial"))
    return { keywords: ["gluteo medio", "abducao", "mini band", "concha"], cue: "Joelhos apontando para fora, alinhados com os pés.", why: "Avaliação indicou valgo dinâmico — prioridade: glúteo médio." };
  if (riskText.includes("dorsiflex") || riskText.includes("calcanhar"))
    return { keywords: ["tornozelo", "dorsiflexao", "panturrilha", "mobilidade"], cue: "Ganhe tornozelo antes de carregar o agachamento.", why: "Avaliação indicou dorsiflexão limitada — prioridade: mobilidade de tornozelo." };
  if (riskText.includes("butt") || riskText.includes("retrovers"))
    return { keywords: ["posterior", "isquiotibiais", "alongamento", "quadril"], cue: "Amplitude só até onde a pelve fica estável.", why: "Avaliação indicou butt wink — prioridade: mobilidade posterior/quadril." };
  if (riskText.includes("trendelenburg") || riskText.includes("queda da pelve") || riskText.includes("drop de pelve"))
    return { keywords: ["gluteo medio", "unilateral", "prancha lateral", "abducao"], cue: "Pelve nivelada durante todo o movimento.", why: "Avaliação indicou drop de pelve — prioridade: abdutores unilaterais." };
  if (riskText.includes("cifose") || riskText.includes("protrus") || riskText.includes("escap"))
    return { keywords: ["face pull", "escapula", "trapezio", "banda"], cue: "Escápulas para trás e para baixo.", why: "Avaliação indicou protrusão/cifose — prioridade: controle escapular." };
  return null;
}

type FallbackExerciseSpec = {
  phase: string;
  keywords: string[];
  sets: number;
  reps: string;
  rest: number;
  rir: string;
  cue: string;
  note: string;
  tempo?: string;
};

// Troca de estímulo a cada 2 semanas — instruções ESPECÍFICAS e acionáveis por tipo de exercício.
const METHOD_LABEL: Record<string, string> = { dropset: "drop-set", restpause: "rest-pause", cluster: "cluster-set" };

// Método do isolador varia por objetivo + ordem (mais variedade; tudo com badge explicado no app).
function isoMethodFor(objective: string, order: number): string {
  const o = (objective || "").toLowerCase();
  if (o.includes("emagre") || o.includes("perda")) return "dropset";          // densidade/metabólico
  if (o.includes("perfor")) return order % 2 === 0 ? "cluster" : "restpause";  // qualidade com carga
  return ["dropset", "restpause", "cluster"][order % 3];                        // hipertrofia/saúde: varia
}

// Progressão inter-blocos POR OBJETIVO (usada nos periodization_blocks do fallback).
function progressionBlocksFor(objective: string) {
  const o = (objective || "").toLowerCase();
  if (o.includes("emagre") || o.includes("perda")) {
    return [
      { weeks: "1-2", stimulus: "base tecnica e ritmo constante", methods: ["sem metodos avancados"], progression_rule: "Aprender os movimentos mantendo RIR 3-4, dor <= 3 e descanso completo." },
      { weeks: "3-4", stimulus: "densidade metabolica", methods: ["reducao de descanso", "drop-set em isoladores"], progression_rule: "Manter cargas e REDUZIR descanso gradualmente (ate ~45s nas fases de forca)." },
      { weeks: "5-6", stimulus: "densidade consolidada", methods: ["drop-set em isoladores"], progression_rule: "Progredir carga leve SEM alongar o descanso; preparar reavaliacao." },
    ];
  }
  if (o.includes("perfor") || o.includes("forca") || o.includes("força")) {
    return [
      { weeks: "1-2", stimulus: "base tecnica com intencao de velocidade", methods: ["sem metodos avancados"], progression_rule: "Tecnica limpa e subida rapida controlada, RIR 3-4." },
      { weeks: "3-4", stimulus: "forca — carga sobe, reps caem", methods: ["cluster/rest-pause em estaveis"], progression_rule: "Aumentar carga e reduzir reps (ex.: 8-10 -> 5-6) mantendo RIR 2-3." },
      { weeks: "5-6", stimulus: "forca consolidada", methods: ["cluster em compostos estaveis (avancado)"], progression_rule: "Cargas altas em baixas repeticoes, sem falha; preparar reavaliacao." },
    ];
  }
  if (o.includes("hipertrofia") || o.includes("massa")) {
    return [
      { weeks: "1-2", stimulus: "base tecnica e conexao muscular", methods: ["sem metodos avancados"], progression_rule: "Amplitude completa e controle exc, RIR 3-4, dor <= 3." },
      { weeks: "3-4", stimulus: "acumulo de volume", methods: ["progressao dupla", "metodos de intensidade em isoladores"], progression_rule: "Progressao DUPLA: primeiro reps ate o teto da faixa, depois carga." },
      { weeks: "5-6", stimulus: "intensificacao controlada", methods: ["piramide em compostos", "drop/rest-pause/cluster em isoladores"], progression_rule: "Piramide crescente nos compostos; consolidar e preparar reavaliacao." },
    ];
  }
  return [
    { weeks: "1-2", stimulus: "base tecnica e tolerancia", methods: ["sem metodos avancados"], progression_rule: "Aumentar reps dentro da faixa mantendo RIR 3-4 e dor <= 3." },
    { weeks: "3-4", stimulus: "progressao conservadora", methods: ["progressao dupla"], progression_rule: "Aumentar 1 serie em exercicios estaveis ou carga leve se tecnica estiver limpa." },
    { weeks: "5-6", stimulus: "consolidacao", methods: ["piramide leve apenas se tecnica estavel"], progression_rule: "Consolidar cargas, sem falha, e preparar reavaliacao." },
  ];
}

// Troca de estímulo a cada 2 semanas, específica por TIPO de exercício e por OBJETIVO.
function blockNote(phase: string, isIso: boolean, objective: string, method: string | null): string {
  const o = (objective || "").toLowerCase();
  const emagre = o.includes("emagre") || o.includes("perda");
  const perf = o.includes("perfor");
  if (phase === "forca_global" || phase === "forca_especifica") {
    if (!isIso && method) {
      // Composto estável com cluster (avançado): instrução explícita e segura.
      return `semana 1 e 2: foco na técnica e na amplitude completa\nsemana 3 e 4: cluster-set — divida a série em mini-blocos com 15-20s de pausa (veja o marcador)\nsemana 5 e 6: progredir a carga mantendo a técnica, sem falha`;
    }
    if (isIso) {
      const lbl = method ? (METHOD_LABEL[method] || method) : "uma técnica de intensidade";
      const wk34 = emagre
        ? `reduza o descanso e faça 1 ${lbl} na última série`
        : perf
        ? `1 ${lbl} mantendo a qualidade de cada repetição`
        : `1 ${lbl} na última série (veja o que é no marcador)`;
      return `semana 1 e 2: foco na execução e conexão muscular\nsemana 3 e 4: ${wk34}\nsemana 5 e 6: progredir a carga e a intensidade`;
    }
    if (emagre) return "semana 1 e 2: foco na técnica e no ritmo constante\nsemana 3 e 4: reduza o descanso (até ~45s) mantendo a carga\nsemana 5 e 6: progredir a carga sem perder o ritmo";
    if (perf) return "semana 1 e 2: foco na técnica e na velocidade da subida\nsemana 3 e 4: aumentar a carga e baixar as reps (força)\nsemana 5 e 6: cargas altas em baixas repetições, com técnica";
    return "semana 1 e 2: foco na técnica e na amplitude completa\nsemana 3 e 4: pirâmide crescente — suba a carga e baixe as reps a cada série\nsemana 5 e 6: progredir a carga mantendo a técnica";
  }
  return "semana 1 e 2: aprender o movimento — cadência 2-0-2\nsemana 3 e 4: cadência 3-1-3 (3s descer, 1s pausa, 3s subir)\nsemana 5 e 6: cadência 4-2-4 com amplitude total";
}

function fallbackExercise(
  catalog: ExerciseCatalog,
  usedIds: Set<string>,
  riskText: string,
  params: FallbackExerciseSpec & { order: number },
  objective: string,
  level: "iniciante" | "intermediario" | "avancado" = "intermediario",
) {
  const exercise = pickCatalogExercise(catalog, params.keywords, usedIds, riskText, level);
  if (!exercise) return null;
  usedIds.add(exercise.id);
  const isIso = params.phase === "forca_especifica" || params.phase === "ativacao_especifica";
  const pain = /dor|lesa|les[aã]o/i.test(riskText || "");
  // Isolador: método varia por objetivo (todos os níveis, sem dor).
  // Composto ESTÁVEL: cluster só para AVANÇADO sem dor, no 2º composto em diante (nunca no 1º pesado)
  // — doutrina: método avançado só em exercício estável, sem dor e nível permitido; entra na semana 3+ (blockNote).
  const isCompound = params.phase === "forca_global";
  const isoMethod = (isIso && !pain) ? isoMethodFor(objective, params.order || 1)
    : (isCompound && !pain && level === "avancado" && params.order >= 4) ? "cluster"
    : null;
  const setsN = params.sets;
  const set_types = Array.from({ length: setsN }, (_, i) => {
    if (!isIso && i === 0 && setsN >= 3) return "warmup";          // 1ª série dos compostos = aquecimento
    if (isIso && setsN >= 2 && i === setsN - 1) return "failure";  // última do isolador = até a falha
    return "normal";
  });
  return {
    phase: params.phase,
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    library_exercise_name: exercise.name,
    muscle_group: exercise.muscle_group || exercise.targets[0]?.muscle_group || "geral",
    targets: exercise.targets.map((target) => ({ ...target })),
    sets: params.sets,
    reps: params.reps,
    load_percent_1rm: null,
    rir: params.rir,
    rest_seconds: params.rest,
    tempo: params.tempo || "3010",
    exercise_order: params.order,
    set_types,
    is_isolation: isIso,
    method: isoMethod,
    group_id: null,
    method_seconds: null,
    cues: params.cue,
    biomechanical_note: params.note,
    notes: blockNote(params.phase, isIso, objective, isoMethod),
    regression: exercise.regressions[0] || "Reduzir amplitude/carga e manter dor <= 3.",
    progression: exercise.progressions[0] || "Progredir reps antes de carga, mantendo técnica.",
  };
}

function buildEmergencyFallbackPlan(args: {
  catalog: ExerciseCatalog;
  presetKey: string;
  selectedPreset: typeof METHODOLOGY_PRESETS[keyof typeof METHODOLOGY_PRESETS];
  studentName: unknown;
  objective: unknown;
  fitnessLevel: unknown;
  daysPerWeek: unknown;
  restrictions: unknown;
  assessmentContext: unknown;
  prescriptionIntegration: unknown;
  bnitoOrchestration: unknown;
  fallbackReason: string;
}) {
  const days = Math.min(4, Math.max(2, Number(args.daysPerWeek) || 3));
  const riskText = normalizeText({
    restrictions: args.restrictions,
    assessmentContext: args.assessmentContext,
    prescriptionIntegration: args.prescriptionIntegration,
  });
  const kneeRisk = riskText.includes("joelho") || riskText.includes("valgo");
  const backRisk = riskText.includes("lombar") || riskText.includes("butt") || riskText.includes("retrovers");
  const usedIds = new Set<string>();
  const lvlText = normalizeText(args.fitnessLevel);
  const level: "iniciante" | "intermediario" | "avancado" =
    lvlText.includes("inic") ? "iniciante" : lvlText.includes("avan") ? "avancado" : "intermediario";
  const hasPain = kneeRisk || backRisk || /dor|lesao|lesão/.test(riskText);

  // Q3/T2 — prontidão (readiness) em "cautela" corta ~20% o volume das fases de força.
  const readinessStatus = (args.prescriptionIntegration as any)?.readiness?.status;
  const lowReadiness = readinessStatus === "cautela";
  const volMult = lowReadiness ? 0.8 : 1;

  const objectiveText = normalizeText(args.objective);
  const isEmagrecimento = /emagre|perda/.test(objectiveText);
  const isPerformance = /perfor|forca|força/.test(objectiveText);
  const isHipertrofia = /hipertrofia|massa/.test(objectiveText);

  // Avaliação funcional → corretivo prioritário injetado na ativação específica.
  const corrective = correctiveFocusFromAssessment(riskText);

  // Ajusta as specs por NÍVEL e OBJETIVO (o fallback deixa de ser one-size-fits-all):
  //  - iniciante: 1 exercício a menos (remove o último acessório de força) → 5/sessão
  //  - avançado: +1 acessório de força específica → 7/sessão
  //  - emagrecimento: descanso menor nas fases de força (densidade)
  //  - hipertrofia: isoladores com 3 séries (volume)
  //  - performance: 1º composto vira 4x5-6 com 120s (força)
  const tuneSpecs = (specs: FallbackExerciseSpec[], extraAccessory: FallbackExerciseSpec): FallbackExerciseSpec[] => {
    let out = specs.map((s) => ({ ...s }));
    if (level === "iniciante" || hasPain) {
      const lastIdx = out.map((s) => s.phase).lastIndexOf("forca_especifica");
      if (lastIdx > 0 && out.length > 5) out.splice(lastIdx, 1);
    } else if (level === "avancado") {
      out.push({ ...extraAccessory });
    }
    if (isEmagrecimento) {
      out = out.map((s) => (/^forca/.test(s.phase) ? { ...s, rest: Math.max(45, s.rest - 30), note: `${s.note} Densidade: descanso curto a partir da semana 3.` } : s));
    } else if (isHipertrofia) {
      out = out.map((s) => (s.phase === "forca_especifica" ? { ...s, sets: Math.max(s.sets, 3) } : s));
    } else if (isPerformance && level !== "iniciante") {
      const firstCompound = out.findIndex((s) => s.phase === "forca_global");
      if (firstCompound >= 0) out[firstCompound] = { ...out[firstCompound], sets: 4, reps: "5-6", rest: 120, rir: "2-3", note: `${out[firstCompound].note} Ênfase de força: carga alta, reps baixas, subida com intenção de velocidade.` };
    }
    // Corretivo da avaliação substitui o foco da ativação específica (quando houver achado).
    if (corrective) {
      const ativIdx = out.findIndex((s) => s.phase === "ativacao_especifica");
      if (ativIdx >= 0) out[ativIdx] = { ...out[ativIdx], keywords: corrective.keywords, cue: corrective.cue, note: corrective.why };
    }
    return out;
  };

  const makeWorkout = (name: string, day: number, focus: string, rawSpecs: FallbackExerciseSpec[], extraAccessory: FallbackExerciseSpec) => {
    const specs = tuneSpecs(rawSpecs, extraAccessory);
    const exercises = specs
      .map((spec, index) => {
        const sets = volMult < 1 && /^forca/.test(spec.phase) ? Math.max(1, Math.round(spec.sets * volMult)) : spec.sets;
        return fallbackExercise(args.catalog, usedIds, riskText, { ...spec, sets, order: index + 1 }, clean(args.objective || ""), level);
      })
      .filter(Boolean) as any[];
    return {
      name,
      day_of_week: day,
      duration_min: level === "avancado" ? 60 : 50,
      split_focus: focus,
      exercises,
      volume_load_estimate: "Conservador; usar RIR 2-4 e dor <= 3.",
      notes: `Motor BN: técnica antes de carga; troca de estímulo a cada 2 semanas; revisar se houver dor/restrição.${volMult < 1 ? " Volume das fases de força reduzido ~20% por prontidão em cautela (readiness)." : ""}${corrective ? ` ${corrective.why}` : ""}`,
    };
  };

  const workouts = [
    makeWorkout("Treino A - Base tecnica de membros inferiores", 1, "mobilidade, core, controle de quadril e força global leve", [
      { phase: "mobilidade", keywords: ["mobilidade tornozelo quadril", "alongamento", "tornozelo", "quadril"], sets: 2, reps: "8-10", rest: 30, rir: "4", cue: "Amplitude sem dor e respiração calma.", note: kneeRisk ? "Preparar tornozelo/quadril para reduzir estresse no joelho." : "Preparar amplitude antes da força." },
      { phase: "ativacao_core", keywords: ["prancha", "dead bug", "core", "pallof"], sets: 2, reps: "20-30s", rest: 45, rir: "3-4", cue: "Trave costelas e pelve, sem prender o ar.", note: "Aumenta estabilidade lombo-pélvica antes da carga." },
      { phase: "ativacao_especifica", keywords: ["gluteo medio", "gluteo", "abducao", "mini band"], sets: 2, reps: "12-15", rest: 45, rir: "3", cue: "Joelho alinhado ao pé, sem colapsar.", note: kneeRisk ? "Prioriza controle de valgo dinâmico." : "Ativa quadril para padrões de agachar." },
      { phase: "controle_motor", keywords: ["agachamento", "goblet", "squat", "caixa"], sets: 2, reps: "8-10", rest: 60, rir: "3-4", cue: "Desça até onde mantém pelve e joelho alinhados.", note: backRisk ? "Limitar amplitude para manter coluna neutra." : "Reforça padrão técnico antes de carga." },
      { phase: "forca_global", keywords: backRisk ? ["leg press", "hack", "maquina", "agachamento"] : ["agachamento", "leg press", "goblet", "squat"], sets: 3, reps: "8-10", rest: 90, rir: "2-3", cue: "Empurre o chão sem perder alinhamento.", note: "Força global com margem de segurança." },
      { phase: "forca_especifica", keywords: ["posterior", "mesa flexora", "isquiotibiais", "gluteo"], sets: 2, reps: "10-12", rest: 75, rir: "2-3", cue: "Controle a volta e evite compensar lombar.", note: "Equilibra cadeia posterior para proteger joelho/quadril." },
    ], { phase: "forca_especifica", keywords: ["cadeira extensora", "extensora", "quadriceps"], sets: 2, reps: "12-15", rest: 60, rir: "2-3", cue: "Extensão completa sem impulso.", note: "Acessório de quadríceps (nível avançado)." }),
    makeWorkout("Treino B - Postura, puxar e empurrar", 3, "mobilidade torácica, escápula, puxar e empurrar técnico", [
      { phase: "mobilidade", keywords: ["mobilidade toracica", "ombro", "shoulder", "toracica"], sets: 2, reps: "8-10", rest: 30, rir: "4", cue: "Movimento suave, sem forçar amplitude.", note: "Prepara ombro e coluna torácica para membros superiores." },
      { phase: "ativacao_core", keywords: ["pallof", "prancha", "core", "dead bug"], sets: 2, reps: "20-30s", rest: 45, rir: "3-4", cue: "Mantenha tronco estável.", note: "Estabilidade para puxadas e empurradas." },
      { phase: "ativacao_especifica", keywords: ["escapula", "face pull", "rotador", "manguito"], sets: 2, reps: "12-15", rest: 45, rir: "3", cue: "Ombros longe das orelhas.", note: "Melhora controle escapular." },
      { phase: "controle_motor", keywords: ["remada", "row", "puxada"], sets: 2, reps: "10", rest: 60, rir: "3", cue: "Puxe com cotovelos, sem jogar tronco.", note: "Ensina trajetória e controle escapular." },
      { phase: "forca_global", keywords: ["supino", "press", "empurrar", "chest"], sets: 3, reps: "8-10", rest: 90, rir: "2-3", cue: "Escápulas firmes e punho neutro.", note: "Empurrar global com controle." },
      { phase: "forca_especifica", keywords: ["remada", "puxada", "costas", "dorsal"], sets: 3, reps: "8-12", rest: 90, rir: "2-3", cue: "Controle a volta sem perder postura.", note: "Equilibra ombro e postura." },
    ], { phase: "forca_especifica", keywords: ["rosca", "biceps", "triceps", "polia"], sets: 2, reps: "10-12", rest: 60, rir: "2-3", cue: "Cotovelo fixo, controle na volta.", note: "Acessório de braço (nível avançado)." }),
    makeWorkout("Treino C - Corpo inteiro e unilateral leve", 5, "integração full body, unilateral e acessórios", [
      { phase: "mobilidade", keywords: ["mobilidade quadril", "tornozelo", "alongamento"], sets: 2, reps: "8-10", rest: 30, rir: "4", cue: "Busque amplitude confortável.", note: "Abre movimento antes do unilateral." },
      { phase: "ativacao_core", keywords: ["bird dog", "perdigueiro", "core", "prancha"], sets: 2, reps: "8-10 por lado", rest: 45, rir: "3-4", cue: "Quadril parado e coluna neutra.", note: "Controle anti-rotação." },
      { phase: "controle_motor", keywords: ["afundo", "lunge", "step", "unilateral"], sets: 2, reps: "8 por lado", rest: 60, rir: "3-4", cue: "Joelho acompanha o pé.", note: kneeRisk ? "Usar amplitude curta e sem dor." : "Integra equilíbrio e controle." },
      { phase: "forca_global", keywords: backRisk ? ["hip thrust", "gluteo", "ponte"] : ["terra romeno", "rdl", "levantamento", "hip hinge"], sets: 3, reps: "8-10", rest: 90, rir: "2-3", cue: "Dobre quadril sem arredondar lombar.", note: "Fortalece cadeia posterior com controle." },
      { phase: "forca_global", keywords: ["remada", "puxada", "costas"], sets: 3, reps: "10-12", rest: 75, rir: "2-3", cue: "Postura alta e controle de escápulas.", note: "Complementa postura e tronco." },
      { phase: "forca_especifica", keywords: ["panturrilha", "calf", "abdomen", "core"], sets: 2, reps: "12-15", rest: 60, rir: "2-3", cue: "Controle total da fase excêntrica.", note: "Acessório leve para suporte do ciclo." },
    ], { phase: "forca_especifica", keywords: ["elevacao lateral", "ombro", "lateral"], sets: 2, reps: "12-15", rest: 60, rir: "2-3", cue: "Suba até a linha do ombro, sem balanço.", note: "Acessório de ombro (nível avançado)." }),
    // Treino D — só quando o aluno tem 4 dias: ênfase glúteo/posterior + core (antes o 4º dia era ignorado).
    makeWorkout("Treino D - Posterior, glúteo e core", 6, "cadeia posterior, glúteo e estabilidade", [
      { phase: "mobilidade", keywords: ["mobilidade quadril", "alongamento posterior", "quadril"], sets: 2, reps: "8-10", rest: 30, rir: "4", cue: "Amplitude confortável e progressiva.", note: "Prepara quadril para dominantes de quadril." },
      { phase: "ativacao_core", keywords: ["prancha lateral", "pallof", "core"], sets: 2, reps: "20-30s", rest: 45, rir: "3-4", cue: "Quadril alinhado, sem girar.", note: "Anti-flexão lateral e anti-rotação." },
      { phase: "ativacao_especifica", keywords: ["gluteo", "ponte", "abducao", "mini band"], sets: 2, reps: "12-15", rest: 45, rir: "3", cue: "Aperte o glúteo no topo.", note: "Prioriza glúteo antes das dominantes de quadril." },
      { phase: "forca_global", keywords: backRisk ? ["hip thrust", "ponte", "gluteo"] : ["stiff", "terra romeno", "rdl", "posterior"], sets: 3, reps: "8-10", rest: 90, rir: "2-3", cue: "Quadril para trás, coluna neutra.", note: "Dominante de quadril com segurança." },
      { phase: "forca_global", keywords: ["elevacao pelvica", "hip thrust", "gluteo", "ponte"], sets: 3, reps: "10-12", rest: 90, rir: "2-3", cue: "Extensão completa de quadril sem hiperextender lombar.", note: "Glúteo como motor principal." },
      { phase: "forca_especifica", keywords: ["mesa flexora", "flexora", "isquiotibiais"], sets: 2, reps: "10-12", rest: 75, rir: "2-3", cue: "Controle a volta em 3 segundos.", note: "Isquiotibiais com ênfase excêntrica." },
    ], { phase: "forca_especifica", keywords: ["panturrilha", "calf"], sets: 2, reps: "12-15", rest: 60, rir: "2-3", cue: "Pausa de 1s no topo.", note: "Acessório de panturrilha (nível avançado)." }),
  ].slice(0, days);

  return {
    cycle_name: `Plano BN emergencial - ${clean(args.studentName || "Aluno")}`,
    objective: clean(args.objective || "base tecnica e consistencia"),
    duration_weeks: 6,
    block: "1",
    methodology_preset: {
      key: args.presetKey,
      label: args.selectedPreset.label,
      why_selected: "Fallback sem Anthropic; selecionado por objetivo, nivel, restricoes e avaliacao.",
    },
    generated_by: "bn_emergency_fallback",
    fallback_reason: args.fallbackReason,
    biomechanical_notes: "Plano conservador com técnica antes de carga, controle motor, RIR 2-4, sem pliometria e sem métodos avançados.",
    workouts,
    library_policy: {
      only_library_exercises: true,
      catalog_count: args.catalog.total,
      gaps: [],
    },
    periodization_blocks: progressionBlocksFor(clean(args.objective || "")),
    weekly_structure: `${workouts.length} sessões/semana alternadas, evitando dias consecutivos de MMII pesado.`,
    progression_protocol: "Progredir reps antes de carga; regredir amplitude/carga se dor > 3 ou perda técnica.",
    warnings: [
      "Plano emergencial gerado sem chamada Anthropic; professor deve revisar antes de usar em caso de dor importante.",
      "Sem pliometria e sem métodos avançados no início do ciclo.",
    ],
    bnito_after_generation: {
      intent: "notify_student_prescription_ready",
      question_to_teacher: "Quer que eu avise o aluno que a prescrição foi feita?",
      suggested_message: "Sua prescrição nova já está pronta no app. Comece leve, priorize técnica e me chame se quiser tirar dúvida de execução.",
    },
  };
}

// ─── SYSTEM PROMPT — METODOLOGIA BN MUSCULAÇÃO ───────────────────────────────
const SYSTEM_PROMPT = `
Você é o Expert de BN Musculação/Força e Biomecânica da BN Performance Training.
Seu papel é prescrever treinos de força utilizando biomecânica de precisão, controlando
a distribuição de torque articular e o alinhamento de vetores de força.

REGRA ZERO — BIBLIOTECA DE EXERCÍCIOS DO APP:
Toda prescrição deve usar EXCLUSIVAMENTE os exercícios fornecidos no contexto
"BIBLIOTECA DE EXERCÍCIOS DO APP". Não invente nomes, variações, máquinas ou exercícios.
Cada exercício deve conter exercise_id real copiado do catálogo e exercise_name exatamente igual ao nome da biblioteca.
É proibido traduzir, adaptar ou inferir exercício que não esteja no catálogo. Se não houver opção segura,
marque a lacuna em library_policy.gaps e use apenas uma alternativa já cadastrada. Nunca retorne
exercise_id vazio, inventado ou fora da lista.

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
  "methodology_preset": {
    "key": "preset recebido no contexto",
    "label": "nome do preset BN usado",
    "why_selected": "motivo tecnico ligado a objetivo, nivel, anamnese e avaliacao"
  },
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
          "exercise_id": "uuid exato da biblioteca",
          "exercise_name": "Nome exato do exercício na biblioteca",
          "library_exercise_name": "Nome exato do exercício na biblioteca",
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
  "library_policy": {
    "only_library_exercises": true,
    "catalog_count": N,
    "gaps": ["necessidades sem opção segura na biblioteca, se houver"]
  },
  "periodization_blocks": [
    {
      "weeks": "1-2",
      "stimulus": "base tecnica | volume | intensidade | consolidacao",
      "methods": ["metodos usados no bloco"],
      "progression_rule": "como progredir dentro do bloco"
    }
  ],
  "weekly_structure": "Descrição da estrutura semanal e ordem dos treinos",
  "progression_protocol": "Como progredir no próximo bloco",
  "warnings": ["Alertas específicos baseados nas limitações identificadas"],
  "bnito_after_generation": {
    "intent": "notify_student_prescription_ready",
    "question_to_teacher": "Quer que eu avise o aluno que a prescrição foi feita?",
    "suggested_message": "mensagem curta para o aluno, sem prometer nada fora do app"
  }
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
    const {
      student_id, student_name, company_id,
      objective,          // "hipertrofia" | "forca" | "emagrecimento" | "performance"
      fitness_level,      // "iniciante" | "intermediario" | "avancado"
      experience_months,  // experiência específica em musculação
      days_per_week,      // dias disponíveis para musculação
      duration_weeks,
      equipment,          // "academia_completa" | "casa_halteres" | "funcional"
      restrictions,       // lesões e restrições
      block_number,       // 1 | 2 | 3 (para liberar pliometria)
      is_endurance_athlete, // true/false — atleta de corrida/triathlon
      assessment_context,   // JSON da avaliação funcional BN
      anamnese_context,     // JSON bruto/resumido da anamnese
      prescription_integration, // resultado integrado anamnese + avaliação
      bnito_orchestration, // contrato do BNITO para sincronizar agentes
      running_days_context, // { days_per_week, sport } — anti-interferência
      anamnese_id,
      bundle_id,
      training_cycle_id,
      previous_plan_id,
      previous_plan_context,
      previous_performance_context,
      program_sequence,
      notes,
    } = await req.json();

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
      const { data: cycle, error: cycleError } = await supabase
        .from("training_cycles")
        .select("id, student_id, company_id, cycle_number, start_date, end_date")
        .eq("id", training_cycle_id)
        .maybeSingle();
      if (cycleError) throw new HttpError(500, `Falha ao validar ciclo: ${cycleError.message}`);
      if (!cycle || cycle.student_id !== student_id || cycle.company_id !== authorizedCompanyId) {
        throw new HttpError(403, "Forbidden: training cycle mismatch.");
      }
      cycleContext = cycle;
    }
    let effectivePreviousPlan = previous_plan_context ?? null;
    let authorizedPreviousPlanId: string | null = null;
    if (previous_plan_id != null && previous_plan_id !== "") {
      if (!isUuid(previous_plan_id)) throw new HttpError(400, "previous_plan_id inválido.");
      const { data: previous, error: previousError } = await supabase
        .from("ai_strength_plans")
        .select("id, plan")
        .eq("id", previous_plan_id)
        .eq("student_id", student_id)
        .eq("company_id", authorizedCompanyId)
        .maybeSingle();
      if (previousError) throw new HttpError(500, `Falha ao carregar plano anterior: ${previousError.message}`);
      if (!previous) throw new HttpError(403, "Forbidden: previous plan mismatch.");
      authorizedPreviousPlanId = previous.id;
      effectivePreviousPlan = previous.plan;
    }
    const effectiveProgramSequence = {
      ...(program_sequence && typeof program_sequence === "object" ? program_sequence : {}),
      sequence_number: cycleContext?.cycle_number ?? program_sequence?.sequence_number ?? block_number ?? 1,
      start_date: cycleContext?.start_date ?? program_sequence?.start_date ?? null,
      end_date: cycleContext?.end_date ?? program_sequence?.end_date ?? null,
    };
    const aiConfig = await loadCompanyAiConfig(supabase, authorizedCompanyId);
    const exerciseCatalog = await loadExerciseCatalog(supabase, authorizedCompanyId);
    const exerciseCatalogText = formatExerciseCatalog(exerciseCatalog);
    const adaptedPrescription = buildPrescriptionInputFromEdgePayload({
      payload: {
        student_name,
        objective,
        fitness_level,
        experience_months,
        days_per_week,
        duration_weeks,
        equipment,
        restrictions,
        injuries: (anamnese_context as any)?.injuries ?? restrictions,
        block_number,
        is_endurance_athlete,
        assessment_context,
        anamnese_context,
        prescription_integration,
        running_days_context,
        previous_plan_context: effectivePreviousPlan,
        previous_performance_context,
        program_sequence: effectiveProgramSequence,
        notes,
      },
      catalog: exerciseCatalog.exercises as any,
    });
    const effectiveFitnessLevel = adaptedPrescription.input.fitnessLevel;
    const effectiveExperienceMonths = adaptedPrescription.input.experienceMonths;
    const presetKey = selectMethodologyPreset(
      objective,
      effectiveFitnessLevel,
      restrictions,
      anamnese_context,
      is_endurance_athlete,
    );
    const selectedPreset = METHODOLOGY_PRESETS[presetKey as keyof typeof METHODOLOGY_PRESETS];

    const athleteContext = `
DADOS DO ATLETA:
Nome: ${clean(student_name || "não informado")}
Objetivo: ${clean(objective)}
Nível de musculação: ${clean(effectiveFitnessLevel)}
Experiência em musculação: ${effectiveExperienceMonths ?? "não informada"} meses
Dias disponíveis para força: ${days_per_week}
Duração do ciclo: ${duration_weeks} semanas
Bloco atual: ${block_number || 1} (pliometria ${block_number >= 2 ? "PERMITIDA" : "PROIBIDA"})
Equipamentos: ${clean(equipment || "academia completa")}
É atleta de endurance (corrida/triathlon): ${is_endurance_athlete ? "SIM — aplicar protocolo anti-interferência" : "NÃO"}
Restrições/Lesões: ${clean(restrictions || "nenhuma")}
Observações adicionais: ${clean(notes || "")}

PRESET BN OBRIGATORIO PARA ESTA PRESCRICAO:
${compactJson({ key: presetKey, ...selectedPreset }, 5000)}

RESULTADO INTEGRADO ANAMNESE + AVALIAÇÃO (PRIORIDADE MÁXIMA):
${prescription_integration
  ? compactJson(prescription_integration, 12000)
  : "Sem resultado integrado — usar anamnese e avaliação separadamente, com cautela."}

ORQUESTRAÇÃO BNITO — CONTRATO ENTRE AGENTES:
${bnito_orchestration
  ? compactJson(bnito_orchestration, 9000)
  : "Sem orquestracao explicita — ainda assim prescrever 6 semanas em 3 blocos de 2 semanas."}

ANAMNESE E CONTEXTO CLÍNICO/ROTINA:
${anamnese_context ? compactJson(anamnese_context, 8000) : "Sem anamnese estruturada adicional."}

BIBLIOTECA DE EXERCÍCIOS DO APP:
${exerciseCatalogText}

REGRA DE MAPA PARA O APP:
Use somente os exercícios acima. Para cada exercício prescrito, retorne exercise_id e exercise_name exatamente como aparecem na biblioteca.
Se a metodologia BN pedir um padrão que não exista na biblioteca, registre a lacuna em library_policy.gaps e escolha a alternativa mais segura já cadastrada quando houver.

INTEGRAÇÃO COM CORRIDA (anti-interferência):
${running_days_context
  ? `O atleta TAMBÉM tem ${running_days_context.days_per_week} dias/semana de ${running_days_context.sport}.
     REGRAS OBRIGATÓRIAS DE ANTI-INTERFERÊNCIA:
     1. NÃO agendar treino pesado de MMII (agachamento, terra, afundo) no mesmo dia nem no dia ANTERIOR a corridas longas
     2. Semana de deload da musculação = semana 4 de cada bloco (sincronizada com a corrida)
     3. Volume de MMII reduzido em 20% vs atleta sem corrida
     4. Preferir RIR 2-3 em todos os exercícios (preservar recuperação aeróbica)
     5. Separar força de MMII por no mínimo 6h de qualquer corrida Z4/Z5`
  : "Sem plano de corrida — prescrever sem restrições de anti-interferência"}


AVALIAÇÃO FUNCIONAL BN (PRIORIDADE MÁXIMA — adapte TODOS os exercícios):
${assessment_context ? JSON.stringify(assessment_context) : "Sem avaliação funcional disponível — presumir boa mobilidade, aplicar protocolo padrão"}

Se a avaliação trouxer "sequencia_bn_video", "direcionamento_protocolo",
"red_yellow_flags" ou "criterios_progressao_bn", esses campos têm prioridade
sobre inferências genéricas. Use o protocolo indicado para definir mobilidade,
ativação, controle motor, cautelas, restrições e liberação ou bloqueio de
pliometria/potência.

INSTRUÇÕES:
1. Comece pelo RESULTADO INTEGRADO: ele resolve conflitos entre objetivo, anamnese, dor, recuperação e avaliação funcional.
2. Analise a avaliação funcional e ajuste CADA exercício conforme as disfunções encontradas.
3. O ciclo deve ter EXATAMENTE 6 semanas, dividido em semanas 1-2, 3-4 e 5-6.
4. Troque o estimulo a cada 2 semanas: series, repeticoes, intensidade, descanso ou metodo.
5. Siga o PRESET BN OBRIGATORIO: ele define faixa de volume, reps/RIR e metodos por bloco.
6. Metodos avancados permitidos somente se coerentes com nivel/risco: up-set, piramide, cluster-set e drop-set seletivo. Nunca use metodo avancado em padrao doloroso ou instavel.
7. Siga obrigatoriamente a estrutura de 7 etapas em CADA sessão.
8. Pliometria apenas se block_number >= 2 E criterios_progressao_bn/liberações do resultado integrado permitirem.
9. Inclua cues técnicos específicos baseados nas falhas do OHS e nos riscos da anamnese.
10. Para atleta de endurance: preferir RIR 2-3, volume moderado, força excêntrica.
11. Use somente exercícios cadastrados na biblioteca do app.
12. Retorne exercise_id em todos os itens de treino.
13. Ao final, inclua bnito_after_generation com a intenção: "Quer que eu avise o aluno que a prescrição foi feita?"
14. Retorne APENAS o JSON, sem texto adicional, sem markdown.
15. Seja compacto: no máximo 6 exercícios por sessão, textos de cues/notas com até 140 caracteres, sem parágrafos longos.
16. Não explique a metodologia fora dos campos do JSON; priorize fechar JSON válido completo.
    `.trim();

    let planJson: any = null;
    let fallbackReason: string | null = null;
    try {
      const { input, warnings: adapterWarnings } = adaptedPrescription;
      const program = generateTrainingProgram(input);
      if (adapterWarnings.length) {
        program.warnings.push(...adapterWarnings);
        program.library_policy.gaps.push(...adapterWarnings.map((warning) => `input_adapter:${warning}`));
      }
      const engineOutput = adaptTrainingProgramForAiStrengthPlan({ program });
      planJson = engineOutput.plan;
      planJson.enrichment = {
        status: AI_FIRST && ANTHROPIC_API_KEY ? "deterministic_primary_ai_text_available" : "deterministic_only",
        generator: "bn_prescription_engine_v1",
        ai_text_refinement: "not_applied",
      };
      fallbackReason = "bn_prescription_engine_v1";
    } catch (engineError) {
      fallbackReason = `engine_v1_error: ${engineError instanceof Error ? engineError.message : String(engineError)}`;
      console.warn("ai-prescribe-workout legacy fallback", fallbackReason);
      planJson = buildEmergencyFallbackPlan({
        catalog: exerciseCatalog,
        presetKey,
        selectedPreset,
        studentName: student_name,
        objective,
        fitnessLevel: effectiveFitnessLevel,
        daysPerWeek: days_per_week,
        restrictions,
        assessmentContext: assessment_context,
        prescriptionIntegration: prescription_integration,
        bnitoOrchestration: bnito_orchestration,
        fallbackReason: fallbackReason || "anthropic_unavailable",
      });
    }

    const libraryValidation = validatePlanLibraryUsage(
      planJson,
      new Set(exerciseCatalog.exercises.map((exercise) => exercise.id)),
    );
    const legacyPreSaveValidation = validatePrescriptionPlan({
      plan: planJson,
      libraryValidation,
      catalog: exerciseCatalog,
      objective,
      fitnessLevel: effectiveFitnessLevel,
      restrictions,
      anamneseContext: anamnese_context,
      assessmentContext: assessment_context,
      durationWeeks: duration_weeks,
      blockNumber: block_number,
      isEnduranceAthlete: is_endurance_athlete,
    });
    const preSaveValidation = mergePreSaveValidation(
      isRecord(planJson.validator) ? planJson.validator.pre_save : null,
      legacyPreSaveValidation,
    );

    const existingGaps = isRecord(planJson.library_policy) && Array.isArray(planJson.library_policy.gaps)
      ? planJson.library_policy.gaps
      : [];
    planJson.library_policy = {
      ...(isRecord(planJson.library_policy) ? planJson.library_policy : {}),
      only_library_exercises: true,
      catalog_count: exerciseCatalog.total,
      validation: libraryValidation,
      gaps: [
        ...existingGaps,
        ...(libraryValidation?.missing?.length ? [`Itens sem exercise_id: ${libraryValidation.missing.join(", ")}`] : []),
        ...(libraryValidation?.invalid?.length ? [`Exercicios fora da biblioteca: ${libraryValidation.invalid.join(", ")}`] : []),
      ],
    };
    const deterministicPreset = planJson.generated_by === "bn_prescription_engine_v1"
      && isRecord(planJson.methodology_preset)
      ? planJson.methodology_preset
      : null;
    planJson.methodology_preset = deterministicPreset || {
      key: presetKey,
      label: selectedPreset.label,
      why_selected: "Selecionado pelo objetivo, nivel, restricoes/anamnese e contexto de endurance.",
      rules: selectedPreset,
    };
    planJson.validator = {
      pre_save: preSaveValidation,
    };
    planJson.bnito_after_generation = {
      ...(isRecord(planJson.bnito_after_generation) ? planJson.bnito_after_generation : {}),
      intent: "notify_student_prescription_ready",
      question_to_teacher: "Quer que eu avise o aluno que a prescrição foi feita?",
      suggested_message: planJson.bnito_after_generation?.suggested_message
        || "Sua prescrição nova já está pronta no app. Dá uma olhada com calma e me chama por aqui se quiser tirar dúvida de execução.",
    };

    // Comparação histórica opcional. O plano servido acima já vem do engine determinístico;
    // este bloco existe apenas para manter a telemetria antiga enquanto a flag estiver ativa.
    const engineFlag = (Deno.env.get("PRESCRIPTION_ENGINE_V1") ?? "off").trim().toLowerCase();
    if (engineFlag === "shadow" || engineFlag === "on") {
      const shadowStart = Date.now();
      try {
        const [{ buildPrescriptionInputFromEdgePayload }, { adaptTrainingProgramForAiStrengthPlan }, { generateTrainingProgram }, shadow] = await Promise.all([
          import("../_shared/prescription/adapters/inputAdapter.ts"),
          import("../_shared/prescription/adapters/outputAdapter.ts"),
          import("../_shared/prescription/engine.ts"),
          import("../_shared/prescription/shadow.ts"),
        ]);
        const mode = shadow.resolveEngineFlag(engineFlag) === "on" ? "on" : "shadow";
        const { input } = buildPrescriptionInputFromEdgePayload({
          payload: {
            student_name, objective, fitness_level: effectiveFitnessLevel,
            experience_months: effectiveExperienceMonths,
            days_per_week, duration_weeks,
            equipment, restrictions, block_number, is_endurance_athlete,
            assessment_context, anamnese_context, prescription_integration,
            running_days_context, previous_plan_context: effectivePreviousPlan,
            previous_performance_context, program_sequence: effectiveProgramSequence, notes,
          },
          catalog: exerciseCatalog.exercises as any,
        });
        const program = generateTrainingProgram(input);
        const output = adaptTrainingProgramForAiStrengthPlan({ program });
        const comparison = shadow.buildShadowComparison({
          mode,
          currentPlan: planJson,
          currentValidation: preSaveValidation,
          program,
          output,
          catalogIds: exerciseCatalog.exercises.map((e) => e.id),
          timingMs: Date.now() - shadowStart,
        });
        await supabase.from("ai_decision_logs").insert({
          student_id,
          company_id: authorizedCompanyId,
          source: shadow.SHADOW_LOG_SOURCE, // 'prescricao' (CHECK permite; discriminador no payload.kind)
          summary: `Shadow ${mode}: engine ${output.status}; blockers ${output.blockers.length}; handoff ${output.handoff}; split_changed ${comparison.diff.split_changed}.`,
          payload: comparison,
        });
      } catch (shadowError) {
        // Erro no shadow NUNCA quebra a prescrição atual — só registra (best-effort).
        try {
          await supabase.from("ai_decision_logs").insert({
            student_id,
            company_id: authorizedCompanyId,
            source: "prescricao",
            summary: "Shadow comparison falhou (sem impacto na prescricao atual).",
            payload: {
              kind: "shadow_comparison",
              engine: "bn_prescription_engine_v1",
              mode: engineFlag,
              error: shadowError instanceof Error ? shadowError.message : String(shadowError),
              created_by_edge: true,
            },
          });
        } catch (_logError) { /* swallow: log best-effort */ }
      }
    }
    // ── fim B5/B6 ──────────────────────────────────────────────────────────────

    await writeAiDecisionLog(supabase, {
      student_id,
      company_id: authorizedCompanyId,
      source: "prescricao",
      summary: `Preset ${selectedPreset.label}; validador ${preSaveValidation.status}; ${preSaveValidation.warnings.length} avisos; ${preSaveValidation.blockers.length} bloqueios.`,
      payload: {
        methodology_preset: planJson.methodology_preset,
        validator: preSaveValidation,
        library_policy: planJson.library_policy,
        biomechanical_notes: planJson.biomechanical_notes ?? null,
        bnito_after_generation: planJson.bnito_after_generation ?? null,
      },
    });

    if (preSaveValidation.status === "blocked") {
      return new Response(
        JSON.stringify({
          error: "Prescricao bloqueada pelo validador pre-salvar.",
          validator: preSaveValidation,
          plan: planJson,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    // Salva o plano de força gerado pela IA (JSON, desacoplado da execução)
    const { data: existingCyclePlan } = cycleContext
      ? await supabase.from("ai_strength_plans").select("id").eq("training_cycle_id", cycleContext.id).maybeSingle()
      : { data: null };
    const planId = existingCyclePlan?.id || crypto.randomUUID();
    const persistencePayload = {
      id: planId,
      company_id: authorizedCompanyId, student_id,
      cycle_name: planJson.cycle_name,
      objective: planJson.objective,
      duration_weeks: planJson.duration_weeks,
      biomechanical_notes: planJson.biomechanical_notes,
      plan: planJson,
      anamnese_id: anamnese_id ?? null,
      bundle_id: authorizedBundleId,
      training_cycle_id: cycleContext?.id ?? null,
      previous_plan_id: authorizedPreviousPlanId,
      sequence_number: Number(effectiveProgramSequence.sequence_number) || 1,
      sequence_phase: planJson.program_sequence?.phase ?? null,
    };
    if (existingCyclePlan?.id) {
      await supabase.from("ai_strength_plans").update(persistencePayload).eq("id", existingCyclePlan.id).throwOnError();
    } else {
      await supabase.from("ai_strength_plans").insert(persistencePayload).throwOnError();
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
