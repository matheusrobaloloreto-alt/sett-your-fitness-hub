// Public endpoint: load minimal student context and upsert anamnesis only after
// resolving an opaque invite or an authenticated tenant/owner relationship.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertTenantAccess, HttpError } from "../_shared/tenant-auth.ts";
import {
  assertInviteStudentTenant,
  resolvePublicAnamnesisAccess,
} from "../_shared/public-anamnesis-access.ts";
import { resolveAnamnesisDurations } from "../_shared/anamnesis-duration.ts";
import {
  consumeValidatedAnamnesisInvite,
  type RequiredAnamnesisField,
} from "../_shared/public-anamnesis-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const ALLOWED_FIELDS = [
  "modalities","training_days","available_days","session_duration","training_location",
  "available_equipment","goals","diseases","injuries","current_pain","nutrition",
  "profession","sleep_hours","restorative_sleep","aware_of_trilogy","feel_in_3_months",
  "biggest_obstacle","extra_comments","authorizes_plan","commits_communication",
];

const STUDIO_ANAMNESE_FIELDS = [
  "age", "body_fat_percent", "objective", "activity_level", "is_endurance_athlete",
  "training_modality", "days_per_week_strength", "days_per_week_cardio",
  "session_duration_min", "endurance_session_duration_min", "equipment", "experience_months", "sport", "fcmax",
  "fcrep", "current_volume_weekly", "current_volume_unit", "cardio_goal", "stress_score", "sleep_quality",
  "injuries", "food_restrictions", "nutrition_context", "budget_food",
  "meals_per_day", "has_kitchen", "notes",
  // Anamnese "viva" / condicional (gates por modalidade):
  "wants_strength", "wants_running", "wants_cycling", "wants_swimming", "wants_nutrition",
  "has_nutritionist", "has_endurance_coach", "shown_blocks",
];

function cleanText(value: unknown, maxLength = 2000) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E\u00C0-\u017F\n\r\t]/g, "")
    .slice(0, maxLength)
    .trim();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === "sim";
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => cleanText(item, 120)).filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((item) => cleanText(item, 120)).filter(Boolean);
  }
  return [];
}

function includesAny(values: string[], needles: string[]) {
  const source = values.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return needles.some((needle) => source.includes(needle));
}

function buildClinicalText(body: Record<string, any>) {
  const clinical = [
    body.clin_cardiac === "sim" && "histórico cardíaco/pressão alta",
    body.clin_chest_pain === "sim" && "RELATA dor no peito/tontura/falta de ar ao esforço",
    body.clin_surgery === "sim" && `cirurgia recente (<6 meses)${body.clin_surgery_detail ? ": " + cleanText(body.clin_surgery_detail, 120) : ""}`,
    body.clin_pregnant === "gravida" && `GESTANTE${body.clin_pregnant_detail ? " (" + cleanText(body.clin_pregnant_detail, 120) + ")" : ""}`,
    body.clin_pregnant === "posparto" && `pós-parto recente${body.clin_pregnant_detail ? " (" + cleanText(body.clin_pregnant_detail, 120) + ")" : ""}`,
    body.clin_smoke === "sim" && "fumante",
    body.clin_acute === "sim" && "doença aguda/febre no momento",
    body.clin_other && cleanText(body.clin_other),
  ].filter(Boolean);
  const clinicalText = clinical.length
    ? `TRIAGEM CLÍNICA: ${clinical.join("; ")}`
    : "";
  const evaParts = ([
    ["tornozelo", body.eva_tornozelo],
    ["joelho", body.eva_joelho],
    ["quadril", body.eva_quadril],
    ["lombar", body.eva_lombar],
    ["ombro", body.eva_ombro],
  ] as [string, unknown][])
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${key} ${value}`);
  const evaText = evaParts.length ? `DOR ARTICULAR AGORA (EVA 0-10): ${evaParts.join(", ")}` : "";
  return [clinicalText, evaText].filter(Boolean).join(" | ");
}

function buildNutritionContext(body: Record<string, any>) {
  if (body.nutrition_context) return cleanText(body.nutrition_context, 4000);
  const routineLabels: Record<string, string> = { fixa: "fixos", varia: "variam um pouco", muda: "mudam bastante" };
  const fastedLabels: Record<string, string> = { nunca: "nunca", asvezes: "às vezes", sempre: "sempre" };
  const appetiteLabels: Record<string, string> = { faminto: "com bastante fome", normal: "normal", sem_fome: "sem fome", enjoo: "enjoo/não come" };
  const mealTimes = Array.from({ length: 7 }, (_, index) => {
    const value = body[`meal_t${index + 1}`];
    return value ? `${index + 1}ª ${cleanText(value, 20)}` : null;
  }).filter(Boolean);
  return [
    body.nutrition && `Relato alimentar: ${cleanText(body.nutrition)}`,
    body.has_nutritionist !== undefined && `Acompanhamento com nutricionista: ${boolValue(body.has_nutritionist) ? "sim" : "não"}`,
    `Refeições/dia: ${body.meals_per_day || "não informado"}`,
    mealTimes.length && `Horários habituais: ${mealTimes.join(", ")}`,
    body.meal_routine && `Horários ${routineLabels[body.meal_routine] || body.meal_routine}`,
    body.train_time && `Treina no período: ${cleanText(body.train_time, 80)}`,
    body.train_fasted && `Treina em jejum: ${fastedLabels[body.train_fasted] || body.train_fasted}`,
    body.appetite_wake && `Fome ao acordar: ${appetiteLabels[body.appetite_wake] || body.appetite_wake}`,
    body.food_likes && `Gosta de: ${cleanText(body.food_likes)}`,
    body.food_dislikes && `NÃO gosta / evitar: ${cleanText(body.food_dislikes)}`,
    body.hydration && `Hidratação atual: ${cleanText(body.hydration, 60)}`,
    body.gi_sensitivities && `Desconfortos digestivos: ${cleanText(body.gi_sensitivities, 200)}`,
    body.fueling_strategy && `Nutrição em treino/prova longa: ${cleanText(body.fueling_strategy, 200)}`,
  ].filter(Boolean).join(" | ");
}

function mapLegacySubmitToStudioAnamnese(body: Record<string, any>, student: Record<string, any>) {
  const modalities = asArray(body.modalities);
  const allEquipment = asArray(body.available_equipment);
  const equipmentContext = [
    cleanText(body.training_location, 160),
    allEquipment.join(", "),
  ].filter(Boolean).join(" | ");
  const strength = body.interest_strength !== undefined
    ? boolValue(body.interest_strength)
    : includesAny(modalities, ["musculacao", "funcional", "crossfit"]);
  const running = body.interest_running !== undefined
    ? boolValue(body.interest_running)
    : includesAny(modalities, ["corrida", "triathlon"]);
  const swimming = body.interest_swimming !== undefined
    ? boolValue(body.interest_swimming)
    : includesAny(modalities, ["natacao", "natação", "triathlon"]);
  const cycling = body.interest_cycling !== undefined
    ? boolValue(body.interest_cycling)
    : includesAny(modalities, ["bike", "ciclismo", "triathlon"]);
  const nutrition = body.interest_nutrition === undefined
    ? true
    : boolValue(body.interest_nutrition);
  const practicedEndurance = includesAny(modalities, ["corrida", "natacao", "natação", "bike", "ciclismo", "triathlon"]);
  const durations = resolveAnamnesisDurations(body, {
    strength,
    endurance: running || swimming || cycling,
  });
  const clinicalText = buildClinicalText(body);
  const cardioDetail = [
    running && `CORRIDA: ${[
      body.run_where && cleanText(body.run_where, 120),
      body.run_best_time && "melhor tempo " + cleanText(body.run_best_time, 120),
    ].filter(Boolean).join(", ") || "detalhes não informados"}`,
    swimming && `NATAÇÃO: ${[
      body.swim_pool && "piscina " + cleanText(body.swim_pool, 80),
      body.swim_level && "nível " + cleanText(body.swim_level, 80),
      body.swim_volume && "volume " + cleanText(body.swim_volume, 120),
      body.swim_best && "melhor tempo/pace " + cleanText(body.swim_best, 80),
    ].filter(Boolean).join(", ") || "detalhes não informados"}`,
    cycling && `CICLISMO: ${[
      body.bike_type && cleanText(body.bike_type, 80),
      body.bike_volume && "volume " + cleanText(body.bike_volume, 120),
      body.bike_ftp && "FTP/potência " + cleanText(body.bike_ftp, 60),
      boolValue(body.bike_power) && "tem medidor de potência",
    ].filter(Boolean).join(", ") || "detalhes não informados"}`,
    body.perceived_recovery && `Recuperação percebida hoje: ${body.perceived_recovery}/10`,
    body.current_volume_weekly && `Volume atual: ${body.current_volume_weekly} ${body.current_volume_unit === "hours_week" ? "h/sem" : "km/sem"}`,
  ].filter(Boolean);

  const notes = [
    body.goals && `Metas: ${cleanText(body.goals)}`,
    body.training_days && `Dias atuais de treino: ${cleanText(body.training_days)}`,
    body.profession && `Profissão/rotina: ${cleanText(body.profession)}`,
    body.training_history && `Histórico: ${cleanText(body.training_history)}`,
    body.aware_of_trilogy !== undefined && `Consciência treino + alimentação + sono: ${boolValue(body.aware_of_trilogy) ? "sim" : "não"}`,
    body.feel_in_3_months && `Como quer se sentir em 3 meses: ${cleanText(body.feel_in_3_months)}`,
    body.biggest_obstacle && `Maior obstáculo: ${cleanText(body.biggest_obstacle)}`,
    body.sleep_hours && `Horas de sono: ${cleanText(body.sleep_hours, 80)}`,
    body.restorative_sleep !== undefined && `Sono reparador: ${boolValue(body.restorative_sleep) ? "sim" : "não"}`,
    body.supplements && `Suplementos: ${cleanText(body.supplements)}`,
    ...cardioDetail,
    body.extra_comments && `Comentários: ${cleanText(body.extra_comments)}`,
    body.preferred_contact_channel && `Contato preferido: ${cleanText(body.preferred_contact_channel, 80)}`,
    body.preferred_contact_period && `Melhor período para contato: ${cleanText(body.preferred_contact_period, 80)}`,
    body.notes && cleanText(body.notes),
  ].filter(Boolean).join("\n");

  return {
    student_id: student.id,
    company_id: student.company_id,
    age: numberOrNull(body.age),
    body_fat_percent: numberOrNull(body.body_fat_percent),
    objective: cleanText(body.objective || body.goals, 300),
    activity_level: cleanText(body.activity_level, 120),
    is_endurance_athlete: practicedEndurance,
    training_modality: cleanText(body.training_modality || modalities.filter((item) => !/^nenhum$/i.test(item.trim())).join(" + ") || "nenhum", 300),
    // Split por modalidade quando informado; senão usa o total disponível.
    days_per_week_strength: strength
      ? (numberOrNull(body.days_strength) ?? numberOrNull(body.days_available ?? body.available_days))
      : null,
    days_per_week_cardio: (running || swimming || cycling)
      ? (numberOrNull(body.days_cardio) ?? numberOrNull(body.days_available ?? body.available_days))
      : null,
    ...durations,
    equipment: cleanText(body.equipment || equipmentContext, 500),
    experience_months: numberOrNull(body.experience_months),
    sport: running ? "corrida" : swimming ? "natacao" : cycling ? "ciclismo" : cleanText(body.sport, 80) || null,
    fcmax: numberOrNull(body.fcmax),
    fcrep: numberOrNull(body.fcrep),
    current_volume_weekly: numberOrNull(body.current_volume_weekly),
    current_volume_unit: body.current_volume_unit === "hours_week" ? "hours_week" : "km_week",
    cardio_goal: cleanText(body.cardio_goal || body.sport_goal, 300),
    stress_score: numberOrNull(body.stress_score),
    sleep_quality: numberOrNull(body.sleep_quality),
    injuries: [
      cleanText(body.injuries),
      body.current_pain && `Dor atual: ${cleanText(body.current_pain)}`,
      body.diseases && `Doenças/remédios: ${cleanText(body.diseases)}`,
      body.medical_conditions && `Condições médicas: ${cleanText(body.medical_conditions)}`,
      body.medications && `Medicamentos: ${cleanText(body.medications)}`,
      clinicalText,
    ].filter(Boolean).join(" | "),
    food_restrictions: cleanText(body.food_restrictions || body.food_preferences, 1000),
    nutrition_context: buildNutritionContext(body),
    budget_food: cleanText(body.budget_food || "moderado", 80),
    meals_per_day: numberOrNull(body.meals_per_day) || null,
    has_kitchen: body.has_kitchen === undefined ? true : boolValue(body.has_kitchen),
    has_nutritionist: boolValue(body.has_nutritionist),
    wants_strength: strength,
    wants_running: running,
    wants_swimming: swimming,
    wants_cycling: cycling,
    wants_nutrition: nutrition,
    shown_blocks: [
      "dados",
      "objetivo",
      "treino",
      "saude",
      "clinica",
      nutrition && "nutricao",
      strength && "musculacao",
      running && "corrida",
      swimming && "natacao",
      cycling && "ciclismo",
    ].filter(Boolean),
    custom_answers: body.custom_answers,
    notes,
    updated_at: new Date().toISOString(),
  };
}

async function upsertStudioAnamnese(payload: Record<string, any>) {
  const { data: existing } = await supabase
    .from("student_anamneses")
    .select("id")
    .eq("student_id", payload.student_id)
    .maybeSingle();

  if (existing) {
    return await supabase.from("student_anamneses").update(payload).eq("id", existing.id).select("id").single();
  }
  return await supabase.from("student_anamneses").insert(payload).select("id").single();
}

function sanitizeStudentPatch(studentPatch: Record<string, any> | null | undefined) {
  const allowed: Record<string, any> = {};
  for (const key of ["full_name", "weight_kg", "height_cm", "gender"]) {
    if (studentPatch?.[key] !== undefined && studentPatch[key] !== "") allowed[key] = studentPatch[key];
  }
  return allowed;
}

function sanitizeStudioAnamnese(
  incoming: Record<string, any> | null | undefined,
  student: { id: string; company_id: string },
) {
  const source = incoming ?? {};
  const payload: Record<string, any> = {
    student_id: student.id,
    company_id: student.company_id,
    updated_at: new Date().toISOString(),
  };
  for (const key of STUDIO_ANAMNESE_FIELDS) {
    if (source[key] !== undefined) payload[key] = source[key];
  }
  if (source.custom_answers && typeof source.custom_answers === "object" && !Array.isArray(source.custom_answers)) {
    const customAnswers: Record<string, any> = {};
    for (const [key, rawValue] of Object.entries(source.custom_answers as Record<string, any>)) {
      if (typeof key !== "string" || !rawValue || typeof rawValue !== "object") continue;
      const label = typeof (rawValue as any).label === "string"
        ? (rawValue as any).label.slice(0, 200)
        : "";
      let value: any = (rawValue as any).value;
      if (Array.isArray(value)) value = value.slice(0, 50).map((item) => String(item).slice(0, 200));
      else if (value != null) value = String(value).slice(0, 2000);
      else value = "";
      customAnswers[key.slice(0, 80)] = { label, value };
    }
    if (Object.keys(customAnswers).length) payload.custom_answers = customAnswers;
  }
  return payload;
}

async function submitInviteAtomic(
  token: string,
  studentPatch: Record<string, any>,
  anamnesis: Record<string, any>,
) {
  return await supabase.rpc("submit_anamnesis_invite_atomic", {
    _token: token,
    _student_patch: studentPatch,
    _anamnese: anamnesis,
  });
}

async function getBranding(companyId: string | null) {
  if (!companyId) return null;
  const { data } = await supabase.from("platform_settings")
    .select("logo_url, platform_title, primary_color, background_color, card_color, text_color")
    .eq("company_id", companyId).maybeSingle();
  return data ?? null;
}

async function getCustomFields(companyId: string, requiredOnly = false) {
  let query = supabase
    .from("form_fields")
    .select("id, label, field_type, options, is_required, sort_order")
    .eq("form_type", "anamnesis")
    .is("field_key", null)
    .eq("is_active", true)
    .or(`company_id.eq.${companyId},company_id.is.null`);
  if (requiredOnly) query = query.eq("is_required", true);
  const { data, error } = await query.order("sort_order", { ascending: true });
  if (error) throw new HttpError(500, `Falha ao validar perguntas da anamnese: ${error.message}`);
  return (data || []).map((field: any) => ({
    ...field,
    options: Array.isArray(field.options) ? field.options : [],
  }));
}

async function getInvite(token: string | undefined) {
  if (!token) return null;
  const { data } = await supabase
    .from("anamnese_invites")
    .select("id, company_id, student_id, student_name, status, completed_at, expires_at")
    .eq("token", token)
    .maybeSingle();
  return data ?? null;
}

async function getAuthenticatedClaims(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await client.auth.getUser(authHeader.slice("Bearer ".length));
  if (error || !data?.user?.id) return null;
  return { sub: data.user.id };
}

async function runStudioSideEffects(
  incoming: Record<string, any>,
  invite: { company_id: string; student_id: string },
) {
  try {
    const race = incoming._race;
    if (race && race.date) {
      await supabase.from("student_goals").delete()
        .eq("student_id", invite.student_id).eq("kind", "prova").is("created_by", null);
      await supabase.from("student_goals").insert({
        company_id: invite.company_id,
        student_id: invite.student_id,
        title: String(race.name || "Prova").slice(0, 120),
        kind: "prova",
        target_date: race.date,
        status: "pending",
        description: "Cadastrada pela anamnese",
        created_by: null,
      });
    }
    const pain = incoming._pain || {};
    const severity = (score: number) => score >= 7 ? "severa" : score >= 4 ? "moderada" : "leve";
    const painRows = Object.entries(pain)
      .filter(([, value]) => Number(value) > 0)
      .map(([region, value]) => ({
        company_id: invite.company_id,
        student_id: invite.student_id,
        region,
        type: "dor",
        severity: severity(Number(value)),
        note: `Dor relatada na anamnese (EVA ${value}/10)`,
        source: "anamnese",
      }));
    await supabase.from("student_body_limitations").delete()
      .eq("student_id", invite.student_id).eq("source", "anamnese");
    if (painRows.length) await supabase.from("student_body_limitations").insert(painRows);
  } catch (error) {
    console.error("anamnese side-effects error", error);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body?.action as string;
    let cachedClaims: { sub: string } | null | undefined;
    const loadClaims = async () => {
      if (cachedClaims === undefined) cachedClaims = await getAuthenticatedClaims(req);
      return cachedClaims;
    };
    const access = await resolvePublicAnamnesisAccess(body, {
      findInvite: async (token) => await getInvite(token),
      getAuthenticatedClaims: loadClaims,
      assertStudentAccess: async (claims, requestedStudentId) => {
        const tenant = await assertTenantAccess(supabase, claims, { studentId: requestedStudentId });
        return { companyId: tenant.companyId };
      },
    });

    const { data: student } = await supabase
      .from("students")
      .select("id, full_name, company_id, gender, birth_date, weight_kg, height_cm")
      .eq("id", access.studentId)
      .eq("company_id", access.companyId)
      .maybeSingle();
    if (access.invite) {
      assertInviteStudentTenant(access.invite, student);
      const claims = await loadClaims();
      if (claims) {
        await assertTenantAccess(supabase, claims, {
          companyId: access.invite.company_id,
          studentId: access.invite.student_id,
        });
      }
    } else if (!student) {
      throw new HttpError(404, "Aluno não encontrado");
    }

    if (action === "context" || action === "studio_context") {
      if (action === "studio_context" && !access.invite) {
        throw new HttpError(400, "O fluxo Studio exige um convite válido.");
      }
      const branding = await getBranding(student.company_id);
      const customFields = access.invite ? await getCustomFields(student.company_id) : [];
      return new Response(JSON.stringify({
        invite: access.invite ?? undefined,
        student: {
          id: student.id,
          full_name: student.full_name,
          gender: student.gender,
          birth_date: student.birth_date,
          weight_kg: student.weight_kg,
          height_cm: student.height_cm,
        },
        branding,
        custom_fields: customFields,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "studio_submit") {
      if (!access.invite || typeof body?.token !== "string") {
        throw new HttpError(400, "O fluxo Studio exige um convite válido.");
      }
      const incoming = body?.anamnese ?? {};
      const payload = sanitizeStudioAnamnese(incoming, student);
      const requiredCustomFields = await getCustomFields(student.company_id, true) as RequiredAnamnesisField[];
      const { data, error } = await consumeValidatedAnamnesisInvite(
        incoming,
        requiredCustomFields,
        async () => await submitInviteAtomic(
          body.token,
          sanitizeStudentPatch(body?.student),
          payload,
        ),
      );
      if (error) throw new HttpError(409, error.message);
      await runStudioSideEffects(incoming, access.invite);
      return new Response(JSON.stringify({ ok: true, student_anamnese_id: data?.student_anamnese_id ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "submit") {
      const payload: Record<string, any> = {
        student_id: student.id,
        company_id: student.company_id,
      };
      for (const k of ALLOWED_FIELDS) if (body[k] !== undefined) payload[k] = body[k];

      const studentPatch = sanitizeStudentPatch(body);
      const studioPayload = sanitizeStudioAnamnese(
        mapLegacySubmitToStudioAnamnese(body, student),
        student,
      );
      if (access.invite) {
        const token = typeof body.accessKey === "string" ? body.accessKey : body.token;
        const requiredCustomFields = await getCustomFields(student.company_id, true) as RequiredAnamnesisField[];
        const { data, error } = await consumeValidatedAnamnesisInvite(
          body,
          requiredCustomFields,
          async () => await submitInviteAtomic(token, studentPatch, studioPayload),
        );
        if (error) throw new HttpError(409, error.message);
        return new Response(JSON.stringify({ ok: true, student_anamnese_id: data?.student_anamnese_id ?? null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase
        .from("anamnesis").select("id, version").eq("student_id", student.id)
        .order("version", { ascending: false }).limit(1).maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase.from("anamnesis").update({
          ...payload, version: (existing.version || 1) + 1, updated_at: new Date().toISOString(),
        }).eq("id", existing.id));
      } else {
        ({ error } = await supabase.from("anamnesis").insert(payload));
      }
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (Object.keys(studentPatch).length > 0) {
        await supabase.from("students").update(studentPatch).eq("id", student.id);
      }

      const { data: studioAnamnese, error: studioError } = await upsertStudioAnamnese(studioPayload);
      if (studioError) {
        return new Response(JSON.stringify({ error: studioError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, student_anamnese_id: studioAnamnese?.id ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro interno" }), {
      status: e instanceof HttpError ? e.status : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
