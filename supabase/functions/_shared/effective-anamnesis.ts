type Answers = Record<string, unknown>;
export type AnamnesisScope = { companyId: string; studentId: string };

export const INTERCYCLE_ANSWER_COLUMNS = "id, company_id, student_id, prescription_evaluation, goals_continue, new_goals, availability_changed, available_days, session_duration_minutes, training_location, available_equipment, pain_present, pain_location, pain_eva, pain_started_at, pain_movement, additional_information, sensitive_consent, consent_text_version, consented_at, submitted_at";

const answered = (value: unknown) => value != null
  && (typeof value !== "string" || value.trim() !== "")
  && (!Array.isArray(value) || value.length > 0);
const availabilityKeys = ["available_days", "session_duration_minutes", "training_location", "available_equipment"];
const painKeys = ["pain_location", "pain_eva", "pain_started_at", "pain_movement"];

export const STAFF_LEAD_FIELD_TIMES = "_staff_anamnesis_field_updated_at";
const staffKeys: Record<string, string> = {
  objective: "objective",
  days_strength: "available_days", days_per_week_strength: "available_days", days_available: "available_days", available_days: "available_days",
  session_duration: "session_duration_minutes", session_duration_min: "session_duration_minutes",
  training_location: "training_location", equipment: "available_equipment", available_equipment: "available_equipment",
  current_pain: "current_pain",
};
const mappedGoals = new Set(["forca", "hipertrofia", "emagrecimento", "recomposicao", "performance", "saude"]);
export function classifiedAnamnesisObjective(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return mappedGoals.has(normalized) ? normalized : undefined;
}

export function staffCorrectionTimes(existing: unknown, editedFields: string[], now: string): Answers {
  const result = { ...record(existing) };
  for (const field of editedFields) {
    if (Object.hasOwn(staffKeys, field)) result[staffKeys[field]] = now;
  }
  return result;
}

export function anamnesisStaffCorrectionTimes(base: Answers | null) {
  const staff = record(record(base?.custom_answers)?.staff_pre_registration);
  return record(staff?.field_updated_at ?? base?.[STAFF_LEAD_FIELD_TIMES]) ?? {};
}

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dayKeys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const fullDays = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function normalizeIntercycleDays(values: unknown[]) {
  return [...new Set(values.map(value => {
    const key = normalizeText(value).replace(/\.$/, "").replace(/[- ]feira$/, "");
    const index = dayKeys.includes(key) ? dayKeys.indexOf(key) : fullDays.indexOf(key);
    // Preserve unknown tokens so the strength policy can reject invalid input.
    return dayLabels[index] ?? String(value).trim();
  }))];
}

export function splitLegacyClinicalHistory(value: unknown) {
  if (typeof value !== "string") return { injuries: value, currentPain: undefined };
  const history: string[] = [];
  const pain: string[] = [];
  for (const entry of value.split(/\s*\|\s*/)) {
    const match = /^dor atual:\s*(.+)$/i.exec(entry.trim());
    if (match) pain.push(match[1]);
    else history.push(entry);
  }
  return {
    injuries: pain.length ? history.filter(Boolean).join(" | ") || null : value,
    currentPain: pain.length ? pain.join(" | ") : undefined,
  };
}

export function separateCurrentPain(base: Answers): Answers {
  const staff = record(record(base.custom_answers)?.staff_pre_registration);
  const saved = record(staff?.answers);
  const legacy = splitLegacyClinicalHistory(base.injuries);
  const currentPain = saved?.current_pain ?? base.current_pain ?? legacy.currentPain;
  if (currentPain === undefined) return base;
  return { ...base, ...(Object.hasOwn(base, "injuries") ? { injuries: legacy.injuries } : {}), current_pain: currentPain };
}

export function intercycleProjection(scope: AnamnesisScope, rows: Answers[], base: Answers | null = null) {
  const update: Answers = {};
  const staffTimes = anamnesisStaffCorrectionTimes(base);
  let mappedObjective: string | undefined;
  let goalNeedsReview = false;
  const staff = record(record(base?.custom_answers)?.staff_pre_registration);
  let location = normalizeText(record(staff?.answers)?.training_location ?? base?.training_location).replace(/\s+/g, " ");
  let locationTime = -Infinity;
  let equipmentTime = Date.parse(String(staffTimes?.available_equipment ?? "")) || -Infinity;
  const ordered = rows.filter(row => row.company_id === scope.companyId && row.student_id === scope.studentId
    && row.sensitive_consent === true)
    .sort((a, b) => Date.parse(String(a.submitted_at)) - Date.parse(String(b.submitted_at))
      || String(a.id).localeCompare(String(b.id)));
  if (!ordered.length) return null;

  for (const row of ordered) {
    const submitted = Date.parse(String(row.submitted_at));
    const afterStaff = (field: string) => {
      const corrected = Date.parse(String(staffTimes?.[field] ?? ""));
      return !Number.isFinite(corrected) || submitted > corrected;
    };
    const copy = (keys: string[]) => {
      for (const key of keys) if (answered(row[key])) update[key] = row[key];
    };
    copy(["prescription_evaluation", "goals_continue", "availability_changed", "additional_information", "submitted_at"]);
    if (afterStaff("objective") && (row.goals_continue ?? update.goals_continue) === false && typeof row.new_goals === "string" && row.new_goals.trim()) {
      update.new_goals = row.new_goals;
      const goal = classifiedAnamnesisObjective(row.new_goals);
      goalNeedsReview = goal == null;
      if (goal) mappedObjective = goal;
    }
    if ((row.availability_changed ?? update.availability_changed) === true) {
      copy(availabilityKeys.filter(afterStaff));
      if (afterStaff("training_location") && answered(row.training_location)) {
        const reported = normalizeText(row.training_location).replace(/\s+/g, " ");
        if (reported !== location) locationTime = submitted;
        location = reported;
      }
      if (afterStaff("available_equipment") && answered(row.available_equipment)) equipmentTime = submitted;
    }
    // Staff notes and historical injuries cannot supersede a submitted EVA.
    if (typeof row.pain_present === "boolean") update.pain_present = row.pain_present;
    if (row.pain_present === false) {
      for (const key of painKeys) delete update[key];
    } else if (update.pain_present === true) {
      copy(painKeys);
    }
  }

  const patch: Answers = {};
  if (mappedObjective) patch.objective = mappedObjective;
  if (Array.isArray(update.available_days)) {
    const days = normalizeIntercycleDays(update.available_days);
    update.available_days = days;
    patch.available_days = days;
    patch.days_per_week_strength = days.length;
  }
  if (answered(update.session_duration_minutes)) {
    patch.session_duration_min = update.session_duration_minutes;
    patch.endurance_session_duration_min = update.session_duration_minutes;
  }
  if (answered(update.training_location)) patch.training_location = update.training_location;
  if (answered(update.available_equipment)) patch.equipment = update.available_equipment;
  if (update.pain_present === false) patch.current_pain = false;
  if (update.pain_present === true) {
    patch.current_pain = [update.pain_location, answered(update.pain_eva) ? `EVA ${update.pain_eva}` : null, update.pain_movement]
      .filter(answered).join(" ");
  }
  return { scope, patch, update, goalNeedsReview, equipmentNeedsReview: locationTime > equipmentTime };
}

const effectiveAliases: Record<string, string[]> = {
  objective: ["goals"],
  available_days: ["days_available", "days_strength"],
  session_duration_min: ["session_duration", "session_duration_minutes"],
  endurance_session_duration_min: ["endurance_session_duration"],
  equipment: ["available_equipment"],
  current_pain: ["pain_present", ...painKeys],
};

export function applyIntercycleFields(base: Answers, patch: Answers): Answers {
  const effective = { ...base };
  for (const key of Object.keys(patch)) {
    for (const alias of effectiveAliases[key] ?? []) delete effective[alias];
  }
  return { ...effective, ...patch };
}

function record(value: unknown): Answers | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Answers : null;
}

export function mergeEffectiveAnamnesis(base: Answers | null, projection: ReturnType<typeof intercycleProjection>) {
  const separated = base ? separateCurrentPain(base) : null;
  if (!projection && !Object.hasOwn(separated ?? {}, STAFF_LEAD_FIELD_TIMES)) return separated;
  const effective = applyIntercycleFields(separated ?? {
    id: null, source: "intercycle", company_id: projection?.scope.companyId, student_id: projection?.scope.studentId,
  }, projection?.patch ?? {});
  delete effective[STAFF_LEAD_FIELD_TIMES];
  if (!projection) return effective;
  for (const key of ["raw_answers", "answers", "responses"]) {
    const nested = record(effective[key]);
    if (nested) effective[key] = applyIntercycleFields(nested, projection.patch);
  }
  const custom = record(effective.custom_answers);
  const staff = record(custom?.staff_pre_registration);
  const staffAnswers = record(staff?.answers);
  if (staffAnswers) {
    effective.custom_answers = { ...custom, staff_pre_registration: { ...staff, answers: applyIntercycleFields(staffAnswers, projection.patch) } };
  }
  const staffPain = record(record(record(base?.custom_answers)?.staff_pre_registration)?.answers)?.current_pain;
  return {
    ...effective,
    ...(Object.hasOwn(projection.patch, "current_pain") && answered(staffPain) ? { staff_current_pain: staffPain } : {}),
    intercycle_update: {
      ...projection.update, status: "completed", sensitive_consent: true,
      goal_needs_review: projection.goalNeedsReview, equipment_needs_review: projection.equipmentNeedsReview,
    },
  };
}

export async function readIntercycleAnswers(db: any, scope: AnamnesisScope) {
  if (!scope.companyId || !scope.studentId) throw new Error("Empresa e aluno são obrigatórios para carregar a anamnese.");
  const rows: Answers[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("intercycle_anamneses").select(INTERCYCLE_ANSWER_COLUMNS)
      .eq("company_id", scope.companyId).eq("student_id", scope.studentId)
      .order("submitted_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message || "Falha ao carregar a anamnese interciclos.");
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function readCanonicalAnamnesis(db: any, scope: AnamnesisScope, columns = "*"): Promise<Answers | null> {
  if (!scope.companyId || !scope.studentId) throw new Error("Empresa e aluno são obrigatórios para carregar a anamnese.");
  const { data, error } = await db.from("student_anamneses").select(columns)
    .eq("company_id", scope.companyId).eq("student_id", scope.studentId).maybeSingle();
  if (error) throw new Error(error.message || "Falha ao carregar a anamnese canônica.");
  return data;
}
