import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveAnamnesisDurations } from "../_shared/anamnesis-duration.ts";
import { assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";
import { preRegistrationResponseDeadline } from "../_shared/pre-registration-confirmation.ts";
import { validatePreRegistrationSubmission } from "../_shared/pre-registration-validation.ts";
import { countryAwareFiscalFields, fiscalRegistrationValidation, normalizeCountryCode, normalizeFiscalDocument, supportsAsaasBilling } from "../_shared/fiscal-registration.ts";
import {
  buildFiscalRegistrationMessage,
  buildPaymentLinkMessage,
  sendFunnelWhatsAppMessage,
} from "../_shared/sales-funnel.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || "https://www.settapp.com.br").replace(/\/+$/, "");
const supabase = createClient(
  SUPABASE_URL,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveCompany(slug: string | null) {
  if (slug) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new HttpError(500, `Falha ao localizar empresa: ${error.message}`);
    return data;
  }
  const { data } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

async function resolveCompanyById(companyId: unknown) {
  if (!isUuid(companyId)) return null;
  const { data } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("id", companyId)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

async function getBranding(companyId: string) {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("logo_url, platform_title, primary_color, background_color, card_color, text_color")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, `Falha ao carregar identidade visual: ${error.message}`);
  return data ?? null;
}

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const onlyDigits = (value: unknown) =>
  typeof value === "string" ? value.replace(/\D/g, "") : "";
const cleanText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, "\\$&");

function cleanLongText(value: unknown, maxLength = 2000) {
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
  if (Array.isArray(value)) return value.map((item) => cleanLongText(item, 120)).filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((item) => cleanLongText(item, 120)).filter(Boolean);
  }
  return [];
}

function includesAny(values: string[], needles: string[]) {
  const source = values.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return needles.some((needle) => source.includes(needle));
}

function buildClinicalText(body: Record<string, unknown>) {
  const clinical = [
    body.clin_cardiac === "sim" && "histórico cardíaco/pressão alta",
    body.clin_chest_pain === "sim" && "RELATA dor no peito/tontura/falta de ar ao esforço",
    body.clin_surgery === "sim" && `cirurgia recente (<6 meses)${body.clin_surgery_detail ? ": " + cleanLongText(body.clin_surgery_detail, 120) : ""}`,
    body.clin_pregnant === "gravida" && `GESTANTE${body.clin_pregnant_detail ? " (" + cleanLongText(body.clin_pregnant_detail, 120) + ")" : ""}`,
    body.clin_pregnant === "posparto" && `pós-parto recente${body.clin_pregnant_detail ? " (" + cleanLongText(body.clin_pregnant_detail, 120) + ")" : ""}`,
    body.clin_smoke === "sim" && "fumante",
    body.clin_acute === "sim" && "doença aguda/febre no momento",
    body.clin_other && cleanLongText(body.clin_other),
  ].filter(Boolean);
  const evaParts = ([
    ["tornozelo", body.eva_tornozelo],
    ["joelho", body.eva_joelho],
    ["quadril", body.eva_quadril],
    ["lombar", body.eva_lombar],
    ["ombro", body.eva_ombro],
  ] as [string, unknown][])
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${key} ${value}`);
  return [
    clinical.length ? `TRIAGEM CLÍNICA: ${clinical.join("; ")}` : "",
    evaParts.length ? `DOR ARTICULAR AGORA (EVA 0-10): ${evaParts.join(", ")}` : "",
  ].filter(Boolean).join(" | ");
}

function buildNutritionContext(body: Record<string, unknown>) {
  if (body.nutrition_context) return cleanLongText(body.nutrition_context, 4000);
  const routineLabels: Record<string, string> = { fixa: "fixos", varia: "variam um pouco", muda: "mudam bastante" };
  const fastedLabels: Record<string, string> = { nunca: "nunca", asvezes: "às vezes", sempre: "sempre" };
  const appetiteLabels: Record<string, string> = { faminto: "com bastante fome", normal: "normal", sem_fome: "sem fome", enjoo: "enjoo/não come" };
  const mealTimes = Array.from({ length: 7 }, (_, index) => {
    const value = body[`meal_t${index + 1}`];
    return value ? `${index + 1}ª ${cleanLongText(value, 20)}` : null;
  }).filter(Boolean);
  return [
    body.nutrition && `Relato alimentar: ${cleanLongText(body.nutrition)}`,
    body.has_nutritionist !== undefined && `Acompanhamento com nutricionista: ${boolValue(body.has_nutritionist) ? "sim" : "não"}`,
    `Refeições/dia: ${body.meals_per_day || "não informado"}`,
    mealTimes.length && `Horários habituais: ${mealTimes.join(", ")}`,
    body.meal_routine && `Horários ${routineLabels[String(body.meal_routine)] || body.meal_routine}`,
    body.train_time && `Treina no período: ${cleanLongText(body.train_time, 80)}`,
    body.train_fasted && `Treina em jejum: ${fastedLabels[String(body.train_fasted)] || body.train_fasted}`,
    body.appetite_wake && `Fome ao acordar: ${appetiteLabels[String(body.appetite_wake)] || body.appetite_wake}`,
    body.food_likes && `Gosta de: ${cleanLongText(body.food_likes)}`,
    body.food_dislikes && `NÃO gosta / evitar: ${cleanLongText(body.food_dislikes)}`,
    body.hydration && `Hidratação atual: ${cleanLongText(body.hydration, 60)}`,
    body.gi_sensitivities && `Desconfortos digestivos: ${cleanLongText(body.gi_sensitivities, 200)}`,
    body.fueling_strategy && `Nutrição em treino/prova longa: ${cleanLongText(body.fueling_strategy, 200)}`,
  ].filter(Boolean).join(" | ");
}

async function findExistingStudent(companyId: string, student: Record<string, unknown>) {
  const email = normalizeEmail(student.email);
  const countryCode = normalizeCountryCode(student.country_code);
  const cpf = normalizeFiscalDocument(student.cpf, countryCode);
  if (email) {
    const { data } = await supabase
      .from("students")
      .select("id, full_name, status")
      .eq("company_id", companyId)
      .ilike("email", escapeLikePattern(email))
      .maybeSingle();
    if (data?.id) return data;
  }
  if (cpf) {
    if (countryCode === "BR") {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, status")
        .eq("company_id", companyId)
        .eq("cpf", cpf)
        .maybeSingle();
      if (data?.id) return data;
    } else {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, status, cpf, country_code")
        .eq("company_id", companyId)
        .eq("country_code", countryCode)
        .not("cpf", "is", null)
        .limit(2000);
      const match = (data || []).find((candidate) =>
        normalizeFiscalDocument(candidate.cpf, candidate.country_code) === cpf
      );
      if (match?.id) return match;
    }
  }
  return null;
}

async function requireStaff(req: Request, studentId: unknown) {
  if (!isUuid(studentId)) throw new HttpError(400, "studentId inválido.");
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "Unauthorized");
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(
    authHeader.slice("Bearer ".length),
  );
  if (userError || !userData?.user?.id) throw new HttpError(401, "Unauthorized");
  const tenant = await assertTenantAccess(supabase, { sub: userData.user.id }, { studentId });
  const roles = await Promise.all(
    ["master", "admin", "coordinator", "trainer"].map((role) =>
      supabase.rpc("has_role", { _user_id: tenant.userId, _role: role })
    ),
  );
  const roleError = roles.find((result) => result.error)?.error;
  if (roleError) throw new HttpError(503, `Falha ao validar função: ${roleError.message}`);
  if (!roles.some((result) => result.data === true)) throw new HttpError(403, "Forbidden");
  return tenant;
}

async function requireCompanyStaff(req: Request, companyId: unknown) {
  if (!isUuid(companyId)) throw new HttpError(400, "companyId inválido.");
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "Unauthorized");
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(
    authHeader.slice("Bearer ".length),
  );
  if (userError || !userData?.user?.id) throw new HttpError(401, "Unauthorized");
  const userId = userData.user.id;
  const tenant = await assertTenantAccess(
    supabase,
    { sub: userId },
    { companyId, requireStaff: true },
  );
  const roleResults = await Promise.all(
    ["master", "admin", "coordinator", "trainer"].map((role) =>
      supabase.rpc("has_role", { _user_id: userId, _role: role })
    ),
  );
  const roleError = roleResults.find((result) => result.error)?.error;
  if (roleError) throw new HttpError(503, `Falha ao validar função: ${roleError.message}`);
  if (!roleResults.some((result) => result.data === true)) throw new HttpError(403, "Forbidden");
  return { userId, companyId: tenant.companyId };
}

async function preRegister(body: Record<string, unknown>) {
  const validated = validatePreRegistrationSubmission(body);
  const company = await resolveCompanyById(body.companyId) || await resolveCompany(cleanText(body.slug) || null);
  if (!company) throw new HttpError(400, "Empresa inválida.");
  const { fullName, phone, budgetRange, preferredContactPeriod, answers } = validated;

  const submittedAt = new Date().toISOString();
  const leadPayload = {
    company_id: company.id,
    full_name: fullName,
    phone,
    source: "public_pre_registration",
    stage: "interested",
    budget_range: budgetRange,
    preferred_contact_period: preferredContactPeriod,
    pre_registration_answers: answers,
    submitted_at: submittedAt,
    updated_at: submittedAt,
  };
  const { data: existing, error: existingError } = await supabase
    .from("leads")
    .select("id, stage")
    .eq("company_id", company.id)
    .eq("phone", phone)
    .is("converted_to_student_id", null)
    .maybeSingle();
  if (existingError) throw new HttpError(500, `Falha ao consultar pré-cadastro: ${existingError.message}`);

  let leadId: string;
  if (existing?.id) {
    const updatePayload = existing.stage === "contacted" ? { ...leadPayload, stage: "contacted" } : leadPayload;
    const updated = await supabase.from("leads").update(updatePayload).eq("id", existing.id).select("id").single();
    if (updated.error || !updated.data) throw new HttpError(500, `Falha ao atualizar pré-cadastro: ${updated.error?.message || "erro desconhecido"}`);
    leadId = updated.data.id;
  } else {
    const created = await supabase.from("leads").insert(leadPayload).select("id").single();
    if (created.error || !created.data) throw new HttpError(500, `Falha ao salvar pré-cadastro: ${created.error?.message || "erro desconhecido"}`);
    leadId = created.data.id;
  }

  return { leadId, firstName: fullName.split(/\s+/)[0], deadline: preRegistrationResponseDeadline() };
}

async function loadLeadForStaff(req: Request, leadId: unknown) {
  if (!isUuid(leadId)) throw new HttpError(400, "leadId inválido.");
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) throw new HttpError(500, `Falha ao carregar interessado: ${error.message}`);
  if (!lead) throw new HttpError(404, "Interessado não encontrado.");
  const tenant = await requireCompanyStaff(req, lead.company_id);
  return { lead, tenant };
}

async function markLeadContacted(req: Request, leadId: unknown, outcome: unknown = "in_conversation") {
  const { lead, tenant } = await loadLeadForStaff(req, leadId);
  const contactOutcome = cleanText(outcome) || "in_conversation";
  if (!["in_conversation", "no_response", "follow_up", "qualified", "not_fit"].includes(contactOutcome)) {
    throw new HttpError(422, "Classificação de contato inválida.");
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("leads").update({
    stage: "contacted",
    contact_outcome: contactOutcome,
    contacted_at: lead.contacted_at || now,
    last_contact_at: now,
    assigned_to: lead.assigned_to || tenant.userId,
    updated_at: now,
  }).eq("id", lead.id).eq("company_id", tenant.companyId).select("id, stage, contact_outcome, contacted_at").single();
  if (error) throw new HttpError(500, `Falha ao registrar contato: ${error.message}`);
  return data;
}

function anamnesisFromLead(lead: Record<string, unknown>, studentId: string) {
  const answers = lead.pre_registration_answers && typeof lead.pre_registration_answers === "object"
    ? lead.pre_registration_answers as Record<string, unknown>
    : {};
  const modalities = asArray(answers.modalities);
  const allEquipment = asArray(answers.available_equipment);
  const equipmentContext = [
    cleanLongText(answers.training_location, 160),
    allEquipment.join(", "),
  ].filter(Boolean).join(" | ");
  const strength = answers.interest_strength !== undefined
    ? boolValue(answers.interest_strength)
    : includesAny(modalities, ["musculacao", "funcional", "crossfit"]);
  const running = answers.interest_running !== undefined
    ? boolValue(answers.interest_running)
    : includesAny(modalities, ["corrida", "triathlon"]);
  const swimming = answers.interest_swimming !== undefined
    ? boolValue(answers.interest_swimming)
    : includesAny(modalities, ["natacao", "natação", "triathlon"]);
  const cycling = answers.interest_cycling !== undefined
    ? boolValue(answers.interest_cycling)
    : includesAny(modalities, ["bike", "ciclismo", "triathlon"]);
  const nutrition = answers.interest_nutrition === undefined
    ? true
    : boolValue(answers.interest_nutrition);
  const practicedEndurance = includesAny(modalities, ["corrida", "natacao", "natação", "bike", "ciclismo", "triathlon"]);
  const durations = resolveAnamnesisDurations(answers, {
    strength,
    endurance: running || swimming || cycling,
  });
  const clinicalText = buildClinicalText(answers);
  const cardioDetail = [
    running && `CORRIDA: ${[
      answers.run_where && cleanLongText(answers.run_where, 120),
      answers.run_best_time && "melhor tempo " + cleanLongText(answers.run_best_time, 120),
    ].filter(Boolean).join(", ") || "detalhes não informados"}`,
    swimming && `NATAÇÃO: ${[
      answers.swim_pool && "piscina " + cleanLongText(answers.swim_pool, 80),
      answers.swim_level && "nível " + cleanLongText(answers.swim_level, 80),
      answers.swim_volume && "volume " + cleanLongText(answers.swim_volume, 120),
      answers.swim_best && "melhor tempo/pace " + cleanLongText(answers.swim_best, 80),
    ].filter(Boolean).join(", ") || "detalhes não informados"}`,
    cycling && `CICLISMO: ${[
      answers.bike_type && cleanLongText(answers.bike_type, 80),
      answers.bike_volume && "volume " + cleanLongText(answers.bike_volume, 120),
      answers.bike_ftp && "FTP/potência " + cleanLongText(answers.bike_ftp, 60),
      boolValue(answers.bike_power) && "tem medidor de potência",
    ].filter(Boolean).join(", ") || "detalhes não informados"}`,
    answers.perceived_recovery && `Recuperação percebida hoje: ${answers.perceived_recovery}/10`,
    answers.current_volume_weekly && `Volume atual: ${answers.current_volume_weekly} ${answers.current_volume_unit === "hours_week" ? "h/sem" : "km/sem"}`,
  ].filter(Boolean);
  const notes = [
    answers.goals && `Metas: ${cleanLongText(answers.goals)}`,
    answers.training_days && `Dias atuais de treino: ${cleanLongText(answers.training_days)}`,
    answers.profession && `Profissão/rotina: ${cleanLongText(answers.profession)}`,
    answers.aware_of_trilogy !== undefined && `Consciência treino + alimentação + sono: ${boolValue(answers.aware_of_trilogy) ? "sim" : "não"}`,
    answers.feel_in_3_months && `Como quer se sentir em 3 meses: ${cleanLongText(answers.feel_in_3_months)}`,
    answers.biggest_obstacle && `Maior obstáculo: ${cleanLongText(answers.biggest_obstacle)}`,
    answers.sleep_hours && `Horas de sono: ${cleanLongText(answers.sleep_hours, 80)}`,
    answers.restorative_sleep !== undefined && `Sono reparador: ${boolValue(answers.restorative_sleep) ? "sim" : "não"}`,
    answers.supplements && `Suplementos: ${cleanLongText(answers.supplements)}`,
    ...cardioDetail,
    answers.extra_comments && `Comentários: ${cleanLongText(answers.extra_comments)}`,
    `Investimento mensal em saúde: ${cleanText(lead.budget_range) || "não informado"}`,
    `Melhor horário para contato: ${cleanText(lead.preferred_contact_period) || "não informado"}`,
  ].filter(Boolean).join("\n");
  return {
    student_id: studentId,
    company_id: lead.company_id,
    age: numberOrNull(answers.age),
    body_fat_percent: numberOrNull(answers.body_fat_percent),
    objective: cleanLongText(answers.objective || answers.goals, 300) || null,
    activity_level: cleanLongText(answers.activity_level, 120) || null,
    is_endurance_athlete: practicedEndurance,
    training_modality: cleanLongText(modalities.filter((item) => !/^nenhum$/i.test(item.trim())).join(" + ") || "nenhum", 300) || null,
    days_per_week_strength: strength
      ? (numberOrNull(answers.days_strength) ?? numberOrNull(answers.available_days))
      : null,
    days_per_week_cardio: (running || swimming || cycling)
      ? (numberOrNull(answers.days_cardio) ?? numberOrNull(answers.available_days))
      : null,
    ...durations,
    equipment: cleanLongText(answers.equipment || equipmentContext, 500) || null,
    experience_months: numberOrNull(answers.experience_months),
    sport: running ? "corrida" : swimming ? "natacao" : cycling ? "ciclismo" : null,
    fcmax: numberOrNull(answers.fcmax),
    fcrep: numberOrNull(answers.fcrep),
    current_volume_weekly: numberOrNull(answers.current_volume_weekly),
    current_volume_unit: answers.current_volume_unit === "hours_week" ? "hours_week" : "km_week",
    cardio_goal: cleanLongText(answers.cardio_goal || answers.sport_goal, 300) || null,
    stress_score: numberOrNull(answers.stress_score),
    sleep_quality: numberOrNull(answers.sleep_quality),
    injuries: [
      cleanLongText(answers.injuries),
      answers.current_pain && `Dor atual: ${cleanLongText(answers.current_pain)}`,
      answers.diseases && `Doenças/remédios: ${cleanLongText(answers.diseases)}`,
      answers.medical_conditions && `Condições médicas: ${cleanLongText(answers.medical_conditions)}`,
      answers.medications && `Medicamentos: ${cleanLongText(answers.medications)}`,
      clinicalText,
    ].filter(Boolean).join(" | ") || null,
    food_restrictions: cleanLongText(answers.food_restrictions || answers.food_preferences, 1000) || null,
    nutrition_context: buildNutritionContext(answers) || null,
    budget_food: cleanLongText(answers.budget_food || "moderado", 80) || null,
    meals_per_day: numberOrNull(answers.meals_per_day),
    has_kitchen: answers.has_kitchen === undefined ? true : boolValue(answers.has_kitchen),
    has_nutritionist: boolValue(answers.has_nutritionist),
    notes,
    wants_strength: strength,
    wants_running: running,
    wants_swimming: swimming,
    wants_cycling: cycling,
    wants_nutrition: nutrition,
    shown_blocks: [
      "pré-cadastro",
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
    updated_at: new Date().toISOString(),
  };
}

async function convertLeadToFiscal(req: Request, leadId: unknown) {
  const { lead, tenant } = await loadLeadForStaff(req, leadId);
  let studentId = lead.converted_to_student_id as string | null;
  if (!studentId) {
    const phone = onlyDigits(lead.phone);
    const { data: matchingStudent } = await supabase.from("students")
      .select("id")
      .eq("company_id", tenant.companyId)
      .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
      .limit(1)
      .maybeSingle();
    studentId = matchingStudent?.id || null;
    if (!studentId) {
      const created = await supabase.from("students").insert({
        company_id: tenant.companyId,
        full_name: lead.full_name,
        phone,
        whatsapp: phone,
        status: "interested",
        sales_stage: "fiscal_registration_pending",
      }).select("id").single();
      if (created.error || !created.data) throw new HttpError(500, `Falha ao iniciar cadastro fiscal: ${created.error?.message || "erro desconhecido"}`);
      studentId = created.data.id;
    }
    if (!studentId) throw new HttpError(500, "Falha ao identificar o aluno.");
    const answers = lead.pre_registration_answers && typeof lead.pre_registration_answers === "object"
      ? lead.pre_registration_answers as Record<string, unknown>
      : {};
    const demographics: Record<string, unknown> = {};
    const gender = cleanText(answers.gender).toUpperCase();
    if (["M", "F"].includes(gender)) demographics.gender = gender;
    const weightKg = numberOrNull(answers.weight_kg);
    const heightCm = numberOrNull(answers.height_cm);
    if (weightKg != null) demographics.weight_kg = weightKg;
    if (heightCm != null) demographics.height_cm = heightCm;
    if (Object.keys(demographics).length) {
      const demographicUpdate = await supabase.from("students")
        .update(demographics)
        .eq("id", studentId)
        .eq("company_id", tenant.companyId);
      if (demographicUpdate.error) {
        throw new HttpError(500, `Falha ao integrar dados físicos: ${demographicUpdate.error.message}`);
      }
    }
    const anamnesis = await supabase.from("student_anamneses")
      .upsert(anamnesisFromLead(lead, studentId), { onConflict: "student_id" });
    if (anamnesis.error) throw new HttpError(500, `Falha ao integrar pré-cadastro: ${anamnesis.error.message}`);
  }
  if (!studentId) throw new HttpError(500, "Falha ao identificar o aluno.");

  const now = new Date().toISOString();
  const leadUpdate = await supabase.from("leads").update({
    stage: "fiscal_registration",
    contact_outcome: "qualified",
    converted_to_student_id: studentId,
    fiscal_invited_at: now,
    updated_at: now,
  }).eq("id", lead.id).eq("company_id", tenant.companyId);
  if (leadUpdate.error) throw new HttpError(500, `Falha ao avançar interessado: ${leadUpdate.error.message}`);

  // Conversion only prepares the fiscal registration. Sending is a separate,
  // explicit action so a Kanban move or profile open can never contact a lead.
  const registration = await createRegistrationLink(req, studentId);
  const registrationUrl = `${APP_URL}/cadastro-fiscal/${registration.token}`;
  return {
    leadId: lead.id,
    studentId,
    token: registration.token,
    expiresAt: registration.expires_at,
    registrationUrl,
    messageSent: false,
  };
}

type RegistrationLink = {
  id: string;
  student_id: string;
  company_id: string;
  expires_at: string;
  completed_at: string | null;
};

async function resolveRegistrationToken(token: unknown): Promise<RegistrationLink> {
  if (!isUuid(token)) throw new HttpError(404, "Link de cadastro inválido.");
  const { data, error } = await supabase
    .from("public_registration_links")
    .select("id, student_id, company_id, expires_at, completed_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new HttpError(500, `Falha ao validar link: ${error.message}`);
  if (!data) throw new HttpError(404, "Link de cadastro inválido.");
  if (data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    throw new HttpError(410, "Este link de cadastro expirou. Solicite um novo link.");
  }
  if (data.completed_at) {
    throw new HttpError(410, "Este cadastro já foi concluído. Solicite um novo link para alterar os dados.");
  }
  await supabase.from("public_registration_links")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return data;
}

async function createRegistrationLink(req: Request, studentId: unknown) {
  const tenant = await requireStaff(req, studentId);
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, full_name, status, sales_stage, phone, whatsapp, country_code")
    .eq("id", studentId)
    .eq("company_id", tenant.companyId)
    .maybeSingle();
  if (studentError) throw new HttpError(500, `Falha ao carregar interessado: ${studentError.message}`);
  if (!student) throw new HttpError(404, "Interessado não encontrado.");

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("public_registration_links")
    .select("id, token, company_id, expires_at")
    .eq("student_id", student.id)
    .eq("company_id", tenant.companyId)
    .is("revoked_at", null)
    .is("completed_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new HttpError(500, `Falha ao consultar link: ${existingError.message}`);

  let link = existing;
  if (!link) {
    const created = await supabase.from("public_registration_links").insert({
      student_id: student.id,
      company_id: tenant.companyId,
      created_by: tenant.userId,
    }).select("id, token, company_id, expires_at").single();
    if (created.error || !created.data) {
      throw new HttpError(500, `Falha ao criar link: ${created.error?.message || "erro desconhecido"}`);
    }
    link = created.data;
  }

  const activeStudent = ["active", "awaiting_renewal"].includes(student.status || "");
  const update: Record<string, unknown> = activeStudent
    ? {}
    : { sales_stage: "fiscal_registration_pending", status: "interested" };
  if (Object.keys(update).length === 0) return { ...link, student };
  const { error: updateError } = await supabase.from("students")
    .update(update)
    .eq("id", student.id)
    .eq("company_id", tenant.companyId);
  if (updateError) throw new HttpError(500, `Falha ao atualizar interessado: ${updateError.message}`);

  return { ...link, student };
}

async function sendRegistrationLink(req: Request, studentId: unknown, attemptId?: unknown) {
  const registration = await createRegistrationLink(req, studentId);
  const student = registration.student as {
    id: string;
    full_name: string;
    phone: string | null;
    whatsapp: string | null;
    country_code: string | null;
  };
  const registrationUrl = `${APP_URL}/cadastro-fiscal/${registration.token}`;
  const phoneCandidates = [student.phone, student.whatsapp]
    .map((value) => onlyDigits(value))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const eventAttempt = isUuid(attemptId) ? String(attemptId) : registration.token;
  const sendResult = await sendFunnelWhatsAppMessage({
    admin: supabase,
    studentId: student.id,
    companyId: registration.company_id,
    fullName: student.full_name,
    phone: phoneCandidates[0] || null,
    countryCode: student.country_code,
    text: buildFiscalRegistrationMessage(student.full_name, registrationUrl),
    eventType: "fiscal_registration_link_sent",
    eventKey: `fiscal_registration_link_sent:${eventAttempt}`,
    payload: {
      registration_link_id: registration.id,
      registration_token: registration.token,
    },
  });

  return {
    ...registration,
    registrationUrl,
    messageSent: sendResult.sent,
    messageError: sendResult.sent ? null : sendResult.reason || "Falha ao enviar cadastro fiscal.",
  };
}

async function createPaymentLink(studentId: string, companyId: string) {
  const now = new Date().toISOString();
  const existing = await supabase.from("public_payment_links")
    .select("id, token, expires_at")
    .eq("student_id", studentId)
    .eq("company_id", companyId)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new HttpError(500, `Falha ao consultar checkout: ${existing.error.message}`);
  if (existing.data) return existing.data;
  const created = await supabase.from("public_payment_links").insert({
    student_id: studentId,
    company_id: companyId,
  }).select("id, token, expires_at").single();
  if (created.error || !created.data) {
    throw new HttpError(500, `Falha ao criar checkout: ${created.error?.message || "erro desconhecido"}`);
  }
  return created.data;
}

const allowedStudentFields = [
  "birth_date", "email", "phone", "cpf", "cep", "address", "address_number",
  "neighborhood", "city", "state", "whatsapp", "country_code",
] as const;

function fiscalPayload(student: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const key of allowedStudentFields) {
    if (student[key] !== undefined) payload[key] = student[key];
  }
  payload.email = normalizeEmail(student.email);
  Object.assign(payload, countryAwareFiscalFields(student));
  payload.whatsapp = onlyDigits(student.whatsapp || student.phone);
  payload.phone = onlyDigits(student.phone || student.whatsapp);
  return payload;
}

async function completeFiscalRegistration(link: RegistrationLink, studentInput: Record<string, unknown>) {
  const missing = fiscalRegistrationValidation(studentInput);
  if (missing.length) throw new HttpError(422, `Complete os dados fiscais: ${missing.join(", ")}.`);

  const { data: currentStudent, error: studentError } = await supabase.from("students")
    .select("id, full_name, status, whatsapp, phone, country_code")
    .eq("id", link.student_id)
    .eq("company_id", link.company_id)
    .maybeSingle();
  if (studentError) throw new HttpError(500, `Falha ao carregar cadastro: ${studentError.message}`);
  if (!currentStudent) throw new HttpError(404, "Cadastro não encontrado.");

  const completedAt = new Date().toISOString();
  const activeStudent = ["active", "awaiting_renewal"].includes(currentStudent.status || "");
  const payload: Record<string, unknown> = {
    ...fiscalPayload(studentInput),
    status: activeStudent ? currentStudent.status : "pending",
    sales_stage: activeStudent ? "active" : "payment_pending",
    fiscal_completed_at: completedAt,
  };
  const { error: updateError } = await supabase.from("students")
    .update(payload)
    .eq("id", currentStudent.id)
    .eq("company_id", link.company_id);
  if (updateError) throw new HttpError(500, `Falha ao salvar cadastro: ${updateError.message}`);

  await supabase.from("public_registration_links")
    .update({ completed_at: link.completed_at || completedAt })
    .eq("id", link.id);

  if (!supportsAsaasBilling(studentInput.country_code)) {
    return {
      studentId: currentStudent.id,
      manualPaymentRequired: true,
      paymentMessageSent: false,
    };
  }

  const paymentLink = await createPaymentLink(currentStudent.id, link.company_id);
  const paymentUrl = `${APP_URL}/pagamento/${paymentLink.token}`;
  const phone = String(payload.whatsapp || currentStudent.whatsapp || currentStudent.phone || "");
  const sendResult = await sendFunnelWhatsAppMessage({
    admin: supabase,
    studentId: currentStudent.id,
    companyId: link.company_id,
    fullName: currentStudent.full_name,
    phone,
    countryCode: String(payload.country_code || currentStudent.country_code || "BR"),
    text: buildPaymentLinkMessage(currentStudent.full_name, paymentUrl),
    eventType: "payment_link_sent",
    eventKey: `payment_link_sent:${paymentLink.id}`,
    payload: { payment_link_id: paymentLink.id },
  });
  if (sendResult.sent) {
    await supabase.from("students")
      .update({ payment_link_sent_at: new Date().toISOString() })
      .eq("id", currentStudent.id);
  }
  return {
    studentId: currentStudent.id,
    paymentToken: paymentLink.token,
    paymentUrl,
    paymentMessageSent: sendResult.sent,
  };
}

async function legacyRegistration(companyId: string, student: Record<string, unknown>) {
  if (!isUuid(companyId) || !cleanText(student.full_name)) {
    throw new HttpError(400, "Dados obrigatórios ausentes.");
  }
  const { data: company } = await supabase.from("companies")
    .select("id").eq("id", companyId).eq("is_active", true).maybeSingle();
  if (!company) throw new HttpError(400, "Empresa inválida.");
  const missing = fiscalRegistrationValidation(student);
  if (missing.length) throw new HttpError(422, `Complete os dados fiscais: ${missing.join(", ")}.`);

  const payload = {
    ...fiscalPayload(student),
    full_name: cleanText(student.full_name),
    company_id: companyId,
    status: "pending",
    sales_stage: "payment_pending",
    fiscal_completed_at: new Date().toISOString(),
  };
  const existing = await findExistingStudent(companyId, payload);
  let studentId = existing?.id as string | undefined;
  if (studentId) {
    const keepActive = ["active", "awaiting_renewal"].includes(existing?.status || "");
    const { error } = await supabase.from("students").update({
      ...payload,
      status: keepActive ? existing?.status : "pending",
    }).eq("id", studentId).eq("company_id", companyId);
    if (error) throw new HttpError(500, `Falha ao atualizar cadastro: ${error.message}`);
  } else {
    const created = await supabase.from("students").insert(payload).select("id").single();
    if (created.error || !created.data) {
      const status = created.error?.code === "23505" ? 409 : 400;
      throw new HttpError(status, created.error?.message || "Falha ao cadastrar.");
    }
    studentId = created.data.id;
  }
  if (!studentId) throw new HttpError(500, "Falha ao identificar o cadastro criado.");
  if (!supportsAsaasBilling(student.country_code)) {
    return {
      studentId,
      existing: !!existing,
      manualPaymentRequired: true,
      paymentMessageSent: false,
    };
  }
  const paymentLink = await createPaymentLink(studentId, companyId);
  return {
    studentId,
    existing: !!existing,
    paymentToken: paymentLink.token,
    paymentUrl: `${APP_URL}/pagamento/${paymentLink.token}`,
    paymentMessageSent: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "create-link") {
      return json(await createRegistrationLink(req, body.studentId));
    }

    if (action === "send-link") {
      return json(await sendRegistrationLink(req, body.studentId, body.attemptId));
    }

    if (action === "pre-register") {
      return json(await preRegister(body));
    }

    if (action === "mark-lead-contacted") {
      return json(await markLeadContacted(req, body.leadId, body.outcome));
    }

    if (action === "convert-lead") {
      return json(await convertLeadToFiscal(req, body.leadId));
    }

    if (action === "context") {
      if (body.token) {
        const link = await resolveRegistrationToken(body.token);
        const [{ data: student, error: studentError }, { data: company, error: companyError }, branding] =
          await Promise.all([
            supabase.from("students")
              .select("id, full_name, birth_date, email, phone, cpf, cep, address, address_number, neighborhood, city, state, whatsapp, country_code")
              .eq("id", link.student_id).eq("company_id", link.company_id).maybeSingle(),
            supabase.from("companies")
              .select("id, name, slug").eq("id", link.company_id).eq("is_active", true).maybeSingle(),
            getBranding(link.company_id),
          ]);
        if (studentError || companyError) throw new HttpError(500, "Falha ao carregar cadastro.");
        if (!student || !company) throw new HttpError(404, "Cadastro não encontrado.");
        return json({ mode: "fiscal", student, company, branding, expiresAt: link.expires_at });
      }

      const company = await resolveCompany(body.slug ?? null);
      if (!company) throw new HttpError(404, "Empresa não encontrada.");
      return json({ mode: "public", company, branding: await getBranding(company.id) });
    }

    if (action === "complete") {
      const link = await resolveRegistrationToken(body.token);
      return json(await completeFiscalRegistration(link, body.student || {}));
    }

    if (action === "register") {
      return json(await legacyRegistration(body.companyId, body.student || {}));
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    console.error("public-registration:", error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erro interno";
    return json({ error: message }, status);
  }
});
