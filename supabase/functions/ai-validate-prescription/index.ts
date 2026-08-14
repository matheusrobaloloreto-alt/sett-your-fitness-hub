import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, HttpError } from "../_shared/tenant-auth.ts";
import { targetVolumeFactor } from "../_shared/prescription/volumeRules.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WarningSeverity = "info" | "warning" | "blocker";

interface ValidationWarning {
  severity: WarningSeverity;
  code: string;
  message: string;
  recommendation: string;
  source: "biblioteca" | "volume" | "anamnese" | "avaliacao_funcional" | "objetivo" | "nivel" | "periodizacao" | "metodologia_bn";
}

interface ExerciseCatalogEntry {
  id: string;
  name: string;
  muscle_group: string | null;
  contraindications: string[];
  regressions: string[];
  progressions: string[];
  equivalent_substitutes: string[];
  pain_limitation_tags: string[];
  targets: Array<{ muscle_group: string; role: string | null; volume_percentage: number | null }>;
}

const clean = (value: unknown) => String(value ?? "").replace(/[^\x20-\x7E\u00C0-\u017F\n\r\t]/g, "");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return clean(raw).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

async function selectByExerciseIdChunks(supabase: any, table: string, columns: string, exerciseIds: string[]) {
  const rows: any[] = [];
  for (const ids of chunkArray(exerciseIds, 80)) {
    const { data, error } = await supabase.from(table).select(columns).in("exercise_id", ids);
    if (error) return { data: rows, error };
    rows.push(...((data ?? []) as any[]));
  }
  return { data: rows, error: null };
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return null;
  return data.claims;
}

async function loadExerciseCatalog(supabase: any, companyId: string | null) {
  // Catálogo paginado (espelha o catalogAdapter do motor) — .limit(700) truncava a
  // biblioteca (917+ exercícios) e deixava exercícios novos invisíveis pra validação.
  const CATALOG_PAGE_SIZE = 1000;
  const makeQuery = (from: number, to: number) => {
    const q = supabase
      .from("exercise_library")
      .select("id, name, muscle_group, is_global, company_id")
      .order("muscle_group", { ascending: true })
      .order("name", { ascending: true })
      .range(from, to);
    return companyId ? q.or(`is_global.eq.true,company_id.eq.${companyId}`) : q.eq("is_global", true);
  };
  const exerciseRows: any[] = [];
  for (let from = 0; ; from += CATALOG_PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + CATALOG_PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao carregar biblioteca de exercicios: ${error.message}`);
    const page = (data ?? []) as any[];
    if (page.length === 0) break;
    exerciseRows.push(...page);
    if (page.length < CATALOG_PAGE_SIZE) break;
  }
  const exerciseIds = exerciseRows.map((exercise) => exercise.id as string).filter(Boolean);
  const [targetsResult, groupsResult, metadataResult] = await Promise.all([
    exerciseIds.length
      ? selectByExerciseIdChunks(
          supabase,
          "exercise_muscle_targets",
          "exercise_id, muscle_group_id, role, volume_percentage",
          exerciseIds,
        )
      : Promise.resolve({ data: [], error: null }),
    supabase.from("muscle_groups").select("id, name"),
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
  if (metadataResult.error) {
    console.warn("exercise_metadata skipped:", metadataResult.error.message);
  }

  const groupNames = new Map<string, string>();
  for (const group of ((groupsResult.data ?? []) as any[])) groupNames.set(group.id as string, group.name as string);

  const targetsByExercise = new Map<string, ExerciseCatalogEntry["targets"]>();
  for (const target of ((targetsResult.data ?? []) as any[])) {
    const exerciseId = target.exercise_id as string;
    const targets = targetsByExercise.get(exerciseId) ?? [];
    targets.push({
      muscle_group: groupNames.get(target.muscle_group_id as string) ?? (target.muscle_group_id as string),
      role: (target.role as string | null) ?? null,
      volume_percentage: (target.volume_percentage as number | null) ?? null,
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

  return exerciseRows.map((exercise) => ({
    id: exercise.id as string,
    name: exercise.name as string,
    muscle_group: (exercise.muscle_group as string | null) ?? null,
    contraindications: metadataByExercise.get(exercise.id as string)?.contraindications ?? [],
    regressions: metadataByExercise.get(exercise.id as string)?.regressions ?? [],
    progressions: metadataByExercise.get(exercise.id as string)?.progressions ?? [],
    equivalent_substitutes: metadataByExercise.get(exercise.id as string)?.equivalent_substitutes ?? [],
    pain_limitation_tags: metadataByExercise.get(exercise.id as string)?.pain_limitation_tags ?? [],
    targets: targetsByExercise.get(exercise.id as string) ?? [],
  }));
}

function validateLibraryUsage(plan: unknown, validExerciseIds: Set<string>) {
  const missing: string[] = [];
  const invalid: string[] = [];
  if (!isRecord(plan) || !Array.isArray(plan.workouts)) return { valid: true, missing, invalid };

  plan.workouts.forEach((workout, workoutIndex) => {
    if (!isRecord(workout) || !Array.isArray(workout.exercises)) return;
    workout.exercises.forEach((exercise, exerciseIndex) => {
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

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

function buildVolumeSummary(plan: unknown, catalog: ExerciseCatalogEntry[]) {
  const exerciseMap = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const weeklySets = new Map<string, number>();
  if (!isRecord(plan) || !Array.isArray(plan.workouts)) return [];

  for (const workout of plan.workouts) {
    if (!isRecord(workout) || !Array.isArray(workout.exercises)) continue;
    for (const exercise of workout.exercises) {
      if (!isRecord(exercise)) continue;
      const sets = typeof exercise.sets === "number" ? exercise.sets : Number(exercise.sets || 0);
      if (!Number.isFinite(sets) || sets <= 0) continue;
      const catalogExercise = exerciseMap.get(String(exercise.exercise_id || ""));
      const targets = catalogExercise?.targets?.length
        ? catalogExercise.targets
        : [{ muscle_group: clean(exercise.muscle_group || catalogExercise?.muscle_group || "nao_informado"), role: "primary", volume_percentage: 100 }];
      for (const target of targets) {
        const multiplier = targetVolumeFactor(target);
        weeklySets.set(target.muscle_group, (weeklySets.get(target.muscle_group) ?? 0) + sets * multiplier);
      }
    }
  }

  return Array.from(weeklySets.entries()).map(([muscle_group, weekly_sets]) => ({
    muscle_group,
    weekly_sets: Math.round(weekly_sets * 10) / 10,
  }));
}

function extractOhsCompensations(assessmentContext: unknown) {
  if (!isRecord(assessmentContext)) return [];
  const direct = assessmentContext.ohs_compensations;
  const nested = isRecord(assessmentContext.prescription_context) ? assessmentContext.prescription_context.ohs_compensations : null;
  return (Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : []).filter((item) => isRecord(item) && item.presente);
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

function validatePrescription(args: {
  plan: unknown;
  catalog: ExerciseCatalogEntry[];
  objective: unknown;
  fitness_level: unknown;
  anamnese_context: unknown;
  assessment_context: unknown;
  block_number: unknown;
}) {
  const warnings: ValidationWarning[] = [];
  const blockers: ValidationWarning[] = [];
  const add = (warning: ValidationWarning) => {
    if (warning.severity === "blocker") blockers.push(warning);
    else warnings.push(warning);
  };

  const planRecord = isRecord(args.plan) ? args.plan : null;
  const workouts = planRecord && Array.isArray(planRecord.workouts) ? planRecord.workouts : [];
  if (!planRecord || workouts.length === 0) {
    add({
      severity: "blocker",
      code: "empty_training_plan",
      message: "O plano não contém nenhum treino.",
      recommendation: "Inclua ao menos um treino com exercícios válidos da biblioteca antes de salvar.",
      source: "metodologia_bn",
    });
  }

  workouts.forEach((workout, workoutIndex) => {
    const exercises = isRecord(workout) && Array.isArray(workout.exercises) ? workout.exercises : [];
    if (exercises.length === 0) {
      add({
        severity: "blocker",
        code: `empty_workout_${workoutIndex + 1}`,
        message: `O treino ${workoutIndex + 1} não contém exercícios.`,
        recommendation: "Remova o treino vazio ou inclua exercícios válidos da biblioteca.",
        source: "metodologia_bn",
      });
    }
  });

  const library = validateLibraryUsage(args.plan, new Set(args.catalog.map((exercise) => exercise.id)));
  if (!library.valid) {
    add({
      severity: "blocker",
      code: "library_contract_failed",
      message: "Ha exercicios sem exercise_id ou fora da biblioteca do app.",
      recommendation: "Salvar somente depois de trocar por exercicios cadastrados ou registrar lacuna para cadastro.",
      source: "biblioteca",
    });
  }

  const plan = isRecord(args.plan) ? args.plan : {};
  const duration = Number(plan.duration_weeks || 0);
  if (duration && duration !== 6) {
    add({
      severity: "warning",
      code: "duration_not_6_weeks",
      message: "A periodizacao nao esta em 6 semanas.",
      recommendation: "Ajustar para 6 semanas em blocos 1-2, 3-4 e 5-6.",
      source: "periodizacao",
    });
  }

  const text = normalizeText({ plan, anamnese: args.anamnese_context, assessment: args.assessment_context });
  const levelText = normalizeText(args.fitness_level);
  const objectiveText = normalizeText(args.objective);
  const painActive = /(dor|eva\s*[4-9]|eva\s*10|joelho|lombar|ombro|tornozelo|quadril|lesao|lesoes)/.test(text);
  const exerciseMap = new Map(args.catalog.map((exercise) => [exercise.id, exercise]));

  if (Number(args.block_number || 1) < 2 && /(pliometr|salto|jump|hop|bound)/.test(text)) {
    add({
      severity: "warning",
      code: "plyometrics_too_early",
      message: "Pliometria apareceu em bloco inicial.",
      recommendation: "Remover pliometria no primeiro bloco e priorizar mobilidade, ativacao, controle motor e forca tecnica.",
      source: "metodologia_bn",
    });
  }

  if ((levelText.includes("inic") || painActive) && /(drop[- ]?set|cluster[- ]?set|piramide|up[- ]?set|rest[- ]?pause)/.test(text)) {
    add({
      severity: "warning",
      code: "advanced_method_risky",
      message: "Metodo avancado em aluno iniciante ou com dor/lesao.",
      recommendation: "Usar progressao dupla ou metodo apenas em isolador estavel, sem dor e com justificativa.",
      source: "nivel",
    });
  }

  const compensations = extractOhsCompensations(args.assessment_context);
  if (compensations.length && !/(mobilidade|ativacao|controle motor)/.test(normalizeText(plan))) {
    add({
      severity: "warning",
      code: "assessment_not_reflected",
      message: "Compensacoes da avaliacao nao aparecem refletidas no treino.",
      recommendation: "Inserir mobilidade/ativacao/controle motor conectado aos achados antes da forca global.",
      source: "avaliacao_funcional",
    });
  }

  const volume_review = buildVolumeSummary(args.plan, args.catalog).map((item) => {
    const highLimit = levelText.includes("inic") ? 12 : 16;
    const lowLimit = objectiveText.includes("hipertrof") ? 8 : 6;
    return {
      ...item,
      status: item.weekly_sets < lowLimit ? "baixo" : item.weekly_sets > highLimit ? "alto" : "ok",
      note: item.weekly_sets < lowLimit
        ? "Volume baixo se este grupo for prioridade."
        : item.weekly_sets > highLimit
          ? "Volume alto; revisar tolerancia, recuperacao e dor."
          : "Volume dentro de faixa conservadora.",
    };
  });

  for (const item of volume_review) {
    if (item.status === "alto") {
      add({
        severity: "warning",
        code: `high_volume_${normalizeText(item.muscle_group).replace(/\s+/g, "_")}`,
        message: `${item.muscle_group}: ${item.weekly_sets} series/semana estimadas.`,
        recommendation: levelText.includes("inic") ? "Reduzir para <=12 series/semana." : "Reduzir para <=16 series/semana na versao atual da metodologia.",
        source: "volume",
      });
    }
  }

  if (painActive) {
    add({
      severity: "warning",
      code: "pain_requires_conservative_adjustment",
      message: "Contexto indica dor, lesao ou regiao sensivel.",
      recommendation: "Nao progredir padrao doloroso; reduzir amplitude/carga/braco de momento e avisar o professor se houver piora.",
      source: "anamnese",
    });

    for (const exercise of collectPlanExercises(args.plan)) {
      const exerciseId = typeof exercise.exercise_id === "string" ? exercise.exercise_id : "";
      const catalogExercise = exerciseMap.get(exerciseId);
      if (!metadataMatchesRisk(catalogExercise, text)) continue;

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

  return {
    status: blockers.length ? "blocked" : warnings.some((item) => item.severity === "warning") ? "warnings" : "ok",
    blockers,
    warnings,
    library,
    volume_review,
    checked_at: new Date().toISOString(),
  };
}

async function resolveValidationCompanyId(supabase: any, claims: any, body: any) {
  if (body.company_id || body.student_id) {
    const authz = await assertTenantAccess(supabase, claims, {
      companyId: body.company_id,
      studentId: body.student_id,
      requireStaff: true,
    });
    return authz.companyId;
  }

  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (!userId) throw new HttpError(401, "Unauthorized");

  const [{ data: isMaster, error: masterError }, { data: userCompanyId, error: companyError }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "master" }),
    supabase.rpc("get_user_company_id", { _user_id: userId }),
  ]);

  if (masterError) throw new HttpError(503, `Falha ao validar permissões do usuário: ${masterError.message}`);
  if (companyError) throw new HttpError(503, `Falha ao resolver empresa do usuário: ${companyError.message}`);
  if (userCompanyId) {
    const authz = await assertTenantAccess(supabase, claims, {
      companyId: userCompanyId,
      requireStaff: true,
    });
    return authz.companyId;
  }
  if (isMaster) return null;

  throw new HttpError(400, "Empresa não informada para validar a prescrição.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const claims = await requireUser(req);
  if (!claims) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const companyId = await resolveValidationCompanyId(supabase, claims, body);
    const catalog = await loadExerciseCatalog(supabase, companyId);
    const result = validatePrescription({
      plan: body.plan ?? { workouts: body.workouts ?? [] },
      catalog,
      objective: body.objective,
      fitness_level: body.fitness_level,
      anamnese_context: body.anamnese_context,
      assessment_context: body.assessment_context,
      block_number: body.block_number,
    });

    return jsonResponse({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
