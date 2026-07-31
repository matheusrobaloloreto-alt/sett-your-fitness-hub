import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function loadEnvFile(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.SETT_AUDIT_EMAIL;
const password = process.env.SETT_AUDIT_PASSWORD;
const companySlug = process.env.SETT_AUDIT_COMPANY_SLUG || "bn-performance-training";

if (!supabaseUrl || !publishableKey) {
  throw new Error("Supabase URL/chave publica ausentes. Carregue .env.local antes da auditoria.");
}
if (!email || !password) {
  throw new Error("Defina SETT_AUDIT_EMAIL e SETT_AUDIT_PASSWORD para uma conta admin/master.");
}
if (!supabaseUrl.includes("zshrcgbyhzxpnlccssyz")) {
  throw new Error(`Backend divergente: ${supabaseUrl}`);
}

const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: publishableKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const authPayload = await authResponse.json();
if (!authResponse.ok || !authPayload.access_token) {
  throw new Error(`Falha no login de auditoria (${authResponse.status}).`);
}

const headers = {
  apikey: publishableKey,
  Authorization: `Bearer ${authPayload.access_token}`,
};

async function rows(table, select, filters = {}) {
  const query = new URLSearchParams({ select });
  for (const [key, value] of Object.entries(filters)) query.set(key, value);
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { ...headers, Range: "0-4999", "Range-Unit": "items" },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${table}: ${payload.message || payload.error || response.statusText}`);
  }
  return payload;
}

const companies = await rows("companies", "id,name,slug", { slug: `eq.${companySlug}` });
const company = companies[0];
if (!company) throw new Error(`Empresa nao encontrada para slug ${companySlug}.`);
const companyFilter = { company_id: `eq.${company.id}` };

const [
  students,
  chats,
  enrollments,
  anamneses,
  legacyAnamneses,
  assessments,
  cycles,
  workouts,
  strengthPlans,
  cardioPlans,
  nutritionPlans,
  bundles,
  decisionLogs,
  aiConfigs,
  instances,
  automationFlows,
  flowSessions,
] = await Promise.all([
  rows("students", "id,status,sales_stage,assigned_trainer_id,user_id,weekly_contact_enabled,assessment_due_at,onboarding_instructions_sent_at", companyFilter),
  rows("whatsapp_chats", "id,student_id,unread_count,remote_jid", companyFilter),
  rows("enrollments", "id,student_id,status,start_date,end_date", companyFilter),
  rows("student_anamneses", "id,student_id,wants_strength,wants_running,wants_swimming,wants_cycling,wants_nutrition", companyFilter),
  rows("anamnesis", "id,student_id,created_at,modalities,training_days,available_days,session_duration,goals,health_conditions,injuries,current_pain,pain_areas,restrictions,physical_activity_level,sleep_quality,stress_level,nutrition,food_allergies,available_equipment,experience_level,additional_notes", companyFilter),
  rows("functional_assessments", "id,student_id,status,created_at", companyFilter),
  rows("training_cycles", "id,enrollment_id,status,start_date,end_date,prescribed_offline_at,workouts", companyFilter),
  rows("workouts", "id,cycle_id,exercises", companyFilter),
  rows("ai_strength_plans", "id,student_id,anamnese_id,bundle_id,created_at", companyFilter),
  rows("running_plans", "id,student_id,anamnese_id,bundle_id,sport,created_at", companyFilter),
  rows("nutrition_plans", "id,student_id,company_id,created_at", companyFilter),
  rows("prescription_bundles", "id,student_id,status,created_at", companyFilter),
  rows("ai_decision_logs", "id,student_id,source,created_at", companyFilter),
  rows("company_ai_config", "company_id,assistant_name,onboarding_completed", companyFilter),
  rows("whatsapp_instances", "id,status,instance_name,updated_at", companyFilter),
  rows("automation_flows", "id,trigger_type,is_active", companyFilter),
  rows("flow_sessions", "id,flow_id,status,context,created_at"),
]);

const studentIds = new Set(students.map((student) => student.id));
const activeStudents = students.filter((student) => ["active", "awaiting_renewal"].includes(student.status));
const activeStudentIds = new Set(activeStudents.map((student) => student.id));
const activeEnrollments = enrollments.filter((enrollment) => ["active", "awaiting_training", "awaiting_renewal"].includes(enrollment.status));
const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
const activeEnrollmentStudents = new Set(activeEnrollments.map((enrollment) => enrollment.student_id));
const anamnesisStudents = new Set(anamneses.map((anamnesis) => anamnesis.student_id));
const legacyAnamnesisStudents = new Set(legacyAnamneses.map((anamnesis) => anamnesis.student_id));
const anyAnamnesisStudents = new Set([...anamnesisStudents, ...legacyAnamnesisStudents]);
const assessmentStudents = new Set(assessments.map((assessment) => assessment.student_id));
const linkedChatStudents = new Set(chats.map((chat) => chat.student_id).filter(Boolean));
const materializedCycleIds = new Set(
  workouts
    .filter((workout) => Array.isArray(workout.exercises) && workout.exercises.length > 0)
    .map((workout) => workout.cycle_id),
);
const todayYmd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const statusActiveCycles = cycles.filter((cycle) => cycle.status === "active");
const currentCycles = statusActiveCycles.filter((cycle) => (
  (!cycle.start_date || cycle.start_date <= todayYmd)
  && (!cycle.end_date || cycle.end_date >= todayYmd)
));
const currentCycleStudents = new Set(
  currentCycles
    .map((cycle) => enrollmentById.get(cycle.enrollment_id)?.student_id)
    .filter(Boolean),
);
const embeddedCycleIds = new Set(
  cycles
    .filter((cycle) => Array.isArray(cycle.workouts) && cycle.workouts.length > 0)
    .map((cycle) => cycle.id),
);

const chatCountByStudent = new Map();
for (const chat of chats) {
  if (!chat.student_id) continue;
  chatCountByStudent.set(chat.student_id, (chatCountByStudent.get(chat.student_id) || 0) + 1);
}

const now = Date.now();
const sevenDays = 7 * 86400000;
const renewalDueStudents = new Set(
  activeEnrollments
    .filter((enrollment) => enrollment.end_date && new Date(`${enrollment.end_date}T23:59:59Z`).getTime() - now <= sevenDays)
    .map((enrollment) => enrollment.student_id),
);

const companyFlowIds = new Set(automationFlows.map((flow) => flow.id));
const weeklySessions = flowSessions.filter((session) => (
  companyFlowIds.has(session.flow_id) && session.context?.trigger_type === "weekly_contact"
));
const issues = [];
function issue(code, count, detail) {
  if (count > 0) issues.push({ code, count, detail });
}

issue(
  "chat_student_cross_reference",
  chats.filter((chat) => chat.student_id && !studentIds.has(chat.student_id)).length,
  "Conversa aponta para aluno inexistente ou fora da empresa.",
);
issue(
  "active_without_enrollment",
  activeStudents.filter((student) => !activeEnrollmentStudents.has(student.id)).length,
  "Aluno ativo sem matricula operacional ativa.",
);
issue(
  "active_without_anamnesis",
  activeStudents.filter((student) => !anyAnamnesisStudents.has(student.id)).length,
  "Aluno ativo sem anamnese canonica nem registro legado disponivel.",
);
issue(
  "legacy_anamnesis_not_normalized",
  activeStudents.filter((student) => legacyAnamnesisStudents.has(student.id) && !anamnesisStudents.has(student.id)).length,
  "Aluno ativo ainda depende da tabela de anamnese legada; normalizar antes de prescrever novamente.",
);
issue(
  "active_without_assessment",
  activeStudents.filter((student) => !assessmentStudents.has(student.id)).length,
  "Aluno ativo sem avaliacao funcional registrada.",
);
issue(
  "current_cycle_without_workout",
  currentCycles.filter((cycle) => !materializedCycleIds.has(cycle.id) && !embeddedCycleIds.has(cycle.id) && !cycle.prescribed_offline_at).length,
  "Ciclo vigente sem treino materializado e sem marcacao de prescricao externa.",
);
issue(
  "duplicate_student_chat_links",
  [...chatCountByStudent.values()].filter((count) => count > 1).length,
  "Aluno ligado a mais de uma conversa; pode ser telefone + LID e exige reconciliacao no webhook.",
);
issue(
  "active_without_app_access",
  activeStudents.filter((student) => !student.user_id).length,
  "Aluno ativo sem user_id para entrar no portal.",
);

const output = {
  audited_at: new Date().toISOString(),
  backend: "zshrcgbyhzxpnlccssyz",
  company: { id: company.id, name: company.name, slug: company.slug },
  counts: {
    students: students.length,
    active_students: activeStudents.length,
    active_enrollments: activeEnrollments.length,
    whatsapp_chats: chats.length,
    chats_linked_to_students: chats.filter((chat) => chat.student_id).length,
    active_students_with_chat: activeStudents.filter((student) => linkedChatStudents.has(student.id)).length,
    renewal_due_within_7d: renewalDueStudents.size,
    canonical_anamneses: anamneses.length,
    legacy_anamneses: legacyAnamneses.length,
    active_students_with_any_anamnesis: activeStudents.filter((student) => anyAnamnesisStudents.has(student.id)).length,
    functional_assessments: assessments.length,
    active_status_cycles: statusActiveCycles.length,
    current_cycles: currentCycles.length,
    current_cycle_students: currentCycleStudents.size,
    materialized_workouts: workouts.filter((workout) => Array.isArray(workout.exercises) && workout.exercises.length > 0).length,
    cycles_with_embedded_workouts: embeddedCycleIds.size,
    strength_plans: strengthPlans.length,
    cardio_plans: cardioPlans.length,
    nutrition_plans: nutritionPlans.length,
    prescription_bundles: bundles.length,
    ai_decision_logs: decisionLogs.length,
    company_ai_config: aiConfigs.length,
    connected_whatsapp_instances: instances.filter((instance) => instance.status === "connected").length,
    weekly_contact_enabled_students: students.filter((student) => student.weekly_contact_enabled).length,
    weekly_contact_flows: automationFlows.filter((flow) => flow.trigger_type === "weekly_contact" && flow.is_active).length,
    weekly_contact_sessions: weeklySessions.length,
  },
  filter_sources: {
    active: "students.status + students.sales_stage + enrollments.end_date",
    renewal: "students.status=awaiting_renewal OU matricula termina em ate 7 dias",
    leads: "students.sales_stage interested/contacted",
    pending: "students.status/sales_stage fiscal_registration_pending/payment_pending",
    assessment: "students.sales_stage active_onboarding",
  },
  legacy_anamnesis_field_coverage: Object.fromEntries(
    [
      "modalities", "training_days", "available_days", "session_duration", "goals",
      "health_conditions", "injuries", "current_pain", "pain_areas", "restrictions",
      "physical_activity_level", "sleep_quality", "stress_level", "nutrition",
      "food_allergies", "available_equipment", "experience_level", "additional_notes",
    ].map((field) => [field, legacyAnamneses.filter((row) => row[field] != null && String(row[field]).trim() !== "").length]),
  ),
  issues,
};

console.log(JSON.stringify(output, null, 2));
