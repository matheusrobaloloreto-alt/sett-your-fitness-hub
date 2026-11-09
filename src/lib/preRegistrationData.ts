import { classifiedAnamnesisObjective, intercycleProjection, mergeEffectiveAnamnesis, readCanonicalAnamnesis, readIntercycleAnswers, separateCurrentPain, splitLegacyClinicalHistory, staffCorrectionTimes, STAFF_LEAD_FIELD_TIMES } from "../../supabase/functions/_shared/effective-anamnesis.ts";
import { supabase } from "@/integrations/supabase/client";
import {
  canonicalAnamnesisToPreRegistrationAnswers,
  isPreRegistrationRecord,
  preRegistrationPhoneCandidates,
  preRegistrationToStudioAnamnesis,
  type PreRegistrationData,
} from "@/lib/preRegistration";

export type LoadStudentPreRegistrationInput = {
  studentId?: string | null;
  companyId?: string | null;
  phone?: string | null;
  includeCanonicalAnamnesis?: boolean;
  throwOnError?: boolean;
  includeIntercycle?: boolean;
};

export type ResolveStudioAnamnesisInput = LoadStudentPreRegistrationInput & {
  db?: any;
  loadPreRegistration?: (input: LoadStudentPreRegistrationInput) => Promise<PreRegistrationData | null>;
};

const LEAD_SELECT = "id, pre_registration_answers, budget_range, preferred_contact_period, interest_notes, submitted_at, created_at";

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalBoolean(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  throw new Error("Resposta booleana inválida na anamnese.");
}

export function canonicalAnamnesisUpdateFromPreRegistration(
  data: PreRegistrationData,
  existingCustomAnswers: unknown = {},
  existingInjuries?: unknown,
) {
  const answers = data.editedFields
    ? Object.fromEntries(data.editedFields.map(key => [key, data.answers[key]]))
    : data.answers;
  const update: Record<string, unknown> = {
    notes: optionalText(data.manualNotes),
    updated_at: new Date().toISOString(),
  };
  const has = (...keys: string[]) => keys.some((key) => Object.prototype.hasOwnProperty.call(answers, key));
  const mappedKeys = new Set(["notes", "custom_answers"]);
  const assign = (column: string, value: unknown, ...keys: string[]) => {
    keys.forEach((key) => mappedKeys.add(key));
    if (has(...keys)) update[column] = value;
  };

  assign("age", optionalNumber(answers.age), "age");
  assign("body_fat_percent", optionalNumber(answers.body_fat_percent), "body_fat_percent");
  assign("objective", optionalText(answers.objective), "objective");
  assign("activity_level", optionalText(answers.activity_level), "activity_level");
  assign("training_modality", optionalText(answers.training_modality ?? answers.modalities), "training_modality", "modalities");
  assign("days_per_week_strength", optionalNumber(answers.days_strength ?? answers.days_per_week_strength), "days_strength", "days_per_week_strength");
  assign("days_per_week_cardio", optionalNumber(answers.days_cardio ?? answers.days_per_week_cardio), "days_cardio", "days_per_week_cardio");
  assign("session_duration_min", optionalNumber(answers.session_duration_min ?? answers.session_duration), "session_duration_min", "session_duration");
  assign("equipment", optionalText(answers.equipment ?? answers.available_equipment), "equipment", "available_equipment");
  assign("experience_months", optionalNumber(answers.experience_months), "experience_months");
  assign("sport", optionalText(answers.sport ?? answers.sport_goal), "sport", "sport_goal");
  assign("fcmax", optionalNumber(answers.fcmax), "fcmax");
  assign("fcrep", optionalNumber(answers.fcrep), "fcrep");
  assign("current_volume_weekly", optionalNumber(answers.current_volume_weekly), "current_volume_weekly");
  assign("current_volume_unit", answers.current_volume_unit === "hours_week" ? "hours_week" : "km_week", "current_volume_unit");
  assign("cardio_goal", optionalText(answers.cardio_goal), "cardio_goal");
  assign("stress_score", optionalNumber(answers.stress_score), "stress_score");
  assign("sleep_quality", optionalNumber(answers.sleep_quality), "sleep_quality");
  assign("injuries", optionalText(answers.injuries), "injuries");
  assign("food_restrictions", optionalText(answers.food_restrictions), "food_restrictions");
  assign("nutrition_context", optionalText(answers.nutrition_context ?? answers.nutrition), "nutrition_context", "nutrition");
  assign("budget_food", optionalText(answers.budget_food), "budget_food");
  assign("meals_per_day", optionalNumber(answers.meals_per_day), "meals_per_day");
  assign("endurance_session_duration_min", optionalNumber(answers.endurance_session_duration_min), "endurance_session_duration_min");
  assign("has_kitchen", optionalBoolean(answers.has_kitchen), "has_kitchen");

  const custom = isPreRegistrationRecord(existingCustomAnswers) ? existingCustomAnswers : {};
  const incomingCustom = isPreRegistrationRecord(answers.custom_answers) ? answers.custom_answers : {};
  const previous = isPreRegistrationRecord(custom.staff_pre_registration) ? custom.staff_pre_registration : {};
  const previousAnswers = isPreRegistrationRecord(previous.answers) ? previous.answers : {};
  // Keep the displayed modalities array authoritative even when an old alias column exists.
  const extraAnswers = Object.fromEntries(Object.entries(answers).filter(([key]) => !mappedKeys.has(key) || key === "modalities"));
  const legacyPain = has("injuries") && !has("current_pain") && !Object.hasOwn(previousAnswers, "current_pain")
    ? splitLegacyClinicalHistory(existingInjuries).currentPain : undefined;
  update.custom_answers = {
    ...custom,
    ...incomingCustom,
    staff_pre_registration: {
      ...previous,
      answers: {
        ...previousAnswers,
        ...(legacyPain !== undefined ? { current_pain: legacyPain } : {}),
        ...extraAnswers,
      },
      ...(data.editedFields?.length ? {
        field_updated_at: staffCorrectionTimes(previous.field_updated_at, data.editedFields, String(update.updated_at)),
      } : {}),
      budgetRange: data.budgetRange,
      preferredContactPeriod: data.preferredContactPeriod,
    },
  };
  return update;
}

export function canonicalPreRegistrationData(row: Record<string, unknown> | null): PreRegistrationData | null {
  if (!row) return null;
  row = separateCurrentPain(row);
  const custom = isPreRegistrationRecord(row.custom_answers) ? row.custom_answers : {};
  const extension = isPreRegistrationRecord(custom.staff_pre_registration) ? custom.staff_pre_registration : {};
  const extensionAnswers = isPreRegistrationRecord(extension.answers) ? extension.answers : {};
  const visibleCustom = { ...custom };
  delete visibleCustom.staff_pre_registration;
  const answers: Record<string, unknown> = {
    ...canonicalAnamnesisToPreRegistrationAnswers(row),
    ...(row.current_pain !== undefined ? { current_pain: row.current_pain } : {}),
    ...(row.endurance_session_duration_min != null ? { endurance_session_duration_min: row.endurance_session_duration_min } : {}),
    ...(Object.keys(visibleCustom).length ? { custom_answers: visibleCustom } : {}),
    ...extensionAnswers,
  };
  // Notes have a dedicated editor; a duplicate answer editor would be ignored on save.
  delete answers.notes;
  if (Object.keys(answers).length === 0 && !row.notes) return null;
  return {
    recordId: row.id as string,
    source: "student_anamnesis",
    answers,
    budgetRange: typeof extension.budgetRange === "string" ? extension.budgetRange : null,
    preferredContactPeriod: typeof extension.preferredContactPeriod === "string" ? extension.preferredContactPeriod : null,
    submittedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    manualNotes: String(row.notes || ""),
  };
}

export async function updateStudentPreRegistration(data: PreRegistrationData): Promise<PreRegistrationData> {
  if (!data.recordId || data.source === "intercycle") throw new Error("Registro da anamnese não identificado.");
  if (data.intercycleGoalNeedsReview && data.editedFields?.includes("objective")) {
    const objective = classifiedAnamnesisObjective(data.answers.objective);
    if (!objective) throw new Error("Classifique o objetivo como força, hipertrofia, emagrecimento, recomposição, performance ou saúde.");
    data = { ...data, answers: { ...data.answers, objective } };
  }
  const db = supabase as any;
  const updatedAt = new Date().toISOString();
  const manualNotes = data.manualNotes?.trim() || "";
  const scope = data.effectiveScope;
  const canonicalId = data.source === "student_anamnesis" ? data.recordId : data.canonicalRecordId;
  const scoped = (query: any, table: string) => {
    if (!scope) return query;
    query = query.eq("company_id", scope.companyId);
    if (scope.studentId) query = query.eq(table === "leads" ? "converted_to_student_id" : "student_id", scope.studentId);
    return query;
  };
  const write = async (table: string, id: string, payload: Record<string, unknown>, revision: unknown) => {
    let query = scoped(db.from(table).update(payload).eq("id", id), table);
    if (scope) {
      query = revision == null ? query.is("updated_at", null) : query.eq("updated_at", revision);
      const result = await query.select("id").maybeSingle();
      if (!result.error && !result.data) throw new Error("O registro mudou. Recarregue a anamnese antes de salvar.");
      return result;
    }
    return query;
  };
  let canonicalUpdate: Record<string, unknown> | undefined;
  let canonicalRevision: unknown;
  if (canonicalId) {
    const { data: existing, error } = await scoped(db.from("student_anamneses")
      .select("custom_answers, updated_at, injuries").eq("id", canonicalId), "student_anamneses").maybeSingle();
    if (error) throw new Error(error.message || "Falha ao carregar respostas existentes.");
    if (!existing) throw new Error("Anamnese não encontrada para atualização.");
    canonicalRevision = existing.updated_at;
    canonicalUpdate = canonicalAnamnesisUpdateFromPreRegistration(data, existing.custom_answers, existing.injuries);
  }

  if (data.source === "lead") {
    let previousAnswers = data.answers;
    let leadRevision: unknown;
    if (scope) {
      const { data: existing, error } = await scoped(db.from("leads")
        .select("pre_registration_answers, updated_at").eq("id", data.recordId), "leads").maybeSingle();
      if (error || !existing) throw new Error(error?.message || "Pré-cadastro não encontrado para atualização.");
      previousAnswers = isPreRegistrationRecord(existing.pre_registration_answers) ? existing.pre_registration_answers : {};
      leadRevision = existing.updated_at;
    }
    const changes = data.editedFields
      ? Object.fromEntries(data.editedFields.filter(key => key !== "__form").map(key => [key, data.answers[key]]))
      : data.answers;
    const answers: Record<string, unknown> = {
      ...previousAnswers,
      ...changes,
      ...(manualNotes ? { notes: manualNotes } : {}),
    };
    if (data.editedFields?.length) {
      answers[STAFF_LEAD_FIELD_TIMES] = staffCorrectionTimes(previousAnswers[STAFF_LEAD_FIELD_TIMES], data.editedFields, updatedAt);
    }
    if (!manualNotes) delete answers.notes;
    const writes = [
      write("leads", data.recordId, {
        pre_registration_answers: answers,
        budget_range: data.budgetRange,
        preferred_contact_period: data.preferredContactPeriod,
        interest_notes: optionalText(manualNotes),
        updated_at: updatedAt,
      }, leadRevision),
    ];
    if (data.canonicalRecordId && canonicalUpdate) {
      writes.push(write("student_anamneses", data.canonicalRecordId, canonicalUpdate, canonicalRevision));
    }
    const results = await Promise.all(writes);
    const failed = results.find((result) => result.error)?.error;
    if (failed) throw new Error(failed.message || "Falha ao atualizar o pré-cadastro.");
    if (scope) return await reloadEffectiveAfterSave(scope);
    return { ...data, answers, manualNotes };
  }

  const { error } = await write("student_anamneses", data.recordId, canonicalUpdate!, canonicalRevision);
  if (error) throw new Error(error.message || "Falha ao atualizar a anamnese.");
  if (scope) return await reloadEffectiveAfterSave(scope);
  return { ...data, manualNotes };
}

async function reloadEffectiveAfterSave(scope: NonNullable<PreRegistrationData["effectiveScope"]>) {
  const refreshed = await loadStudentPreRegistration({ ...scope, includeIntercycle: true }).catch(() => null);
  if (!refreshed) throw new Error("Alteração salva, mas não foi possível recarregar a anamnese efetiva. Reabra o registro.");
  return refreshed;
}

export function studioAnamnesisGenerationBlockReason({
  loading,
  loadError,
}: {
  loading: boolean;
  loadError: string;
}): string | null {
  if (loading) return "Aguarde o carregamento da anamnese antes de gerar a prescrição.";
  if (loadError) return "Não foi possível carregar a anamnese. Recarregue os dados antes de prescrever.";
  return null;
}

export async function resolveStudioAnamnesis({
  studentId,
  companyId,
  phone,
  db = supabase as any,
  loadPreRegistration = loadStudioPreRegistrationFallback,
}: ResolveStudioAnamnesisInput): Promise<Record<string, unknown> | null> {
  if (!studentId) return null;
  if (!companyId) throw new Error("Empresa não definida para carregar anamnese do Studio.");

  const scope = { studentId, companyId };
  const [canonical, intercycleRows] = await Promise.all([
    readCanonicalAnamnesis(db, scope),
    readIntercycleAnswers(db, scope),
  ]);
  if (canonical) return mergeEffectiveAnamnesis(canonical, intercycleProjection(scope, intercycleRows, canonical));

  const preRegistration = await loadPreRegistration({ studentId, companyId, phone });
  const lead = preRegistration ? preRegistrationToStudioAnamnesis(preRegistration, scope) : null;
  return mergeEffectiveAnamnesis(lead, intercycleProjection(scope, intercycleRows, lead));
}

export async function loadStudioPreRegistrationFallback(
  input: LoadStudentPreRegistrationInput,
): Promise<PreRegistrationData | null> {
  return loadStudentPreRegistration({
    ...input,
    includeCanonicalAnamnesis: false,
    throwOnError: true,
  });
}

export async function loadStudentPreRegistration({
  studentId,
  companyId,
  phone,
  includeCanonicalAnamnesis = true,
  throwOnError = false,
  includeIntercycle = false,
}: LoadStudentPreRegistrationInput): Promise<PreRegistrationData | null> {
  const db = supabase as any;
  if (includeIntercycle && !companyId) throw new Error("Empresa não definida para carregar a anamnese.");
  const scope = studentId && companyId ? { studentId, companyId } : null;
  const history = includeIntercycle && scope ? readIntercycleAnswers(db, scope) : Promise.resolve([]);
  const phoneCandidates = preRegistrationPhoneCandidates(phone);

  const leadByStudentPromise = studentId
    ? (() => {
        let query = db.from("leads")
          .select(LEAD_SELECT)
          .eq("converted_to_student_id", studentId);
        if (companyId) query = query.eq("company_id", companyId);
        return query.order("submitted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      })()
    : Promise.resolve({ data: null, error: null });

  const leadByPhonePromise = !studentId && phoneCandidates.length > 0
    ? (() => {
        let query = db.from("leads")
          .select(LEAD_SELECT)
          .in("phone", phoneCandidates);
        if (companyId) query = query.eq("company_id", companyId);
        return query.order("submitted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      })()
    : Promise.resolve({ data: null, error: null });

  const anamnesisPromise = studentId && includeCanonicalAnamnesis
    ? (() => {
        let query = db.from("student_anamneses").select("*").eq("student_id", studentId);
        if (companyId) query = query.eq("company_id", companyId);
        return query.maybeSingle();
      })()
    : Promise.resolve({ data: null, error: null });

  const [leadByStudent, leadByPhone, anamnesisResult, intercycleRows] = await Promise.all([
    leadByStudentPromise,
    leadByPhonePromise,
    anamnesisPromise,
    history,
  ]);

  if (throwOnError || includeIntercycle) {
    const error = leadByStudent.error || leadByPhone.error || anamnesisResult.error;
    if (error) throw new Error(error.message || "Falha ao carregar pré-cadastro do aluno.");
  }

  const lead = leadByStudent.data || leadByPhone.data;
  const canonical = canonicalPreRegistrationData(anamnesisResult.data);
  const leadAnswers = isPreRegistrationRecord(lead?.pre_registration_answers) ? lead.pre_registration_answers : {};
  const intercycle = scope ? intercycleProjection(scope, intercycleRows,
    canonical ? anamnesisResult.data : leadAnswers) : null;
  const withEffectiveAnswers = (data: PreRegistrationData): PreRegistrationData => ({
    ...data,
    ...(includeIntercycle && companyId ? { effectiveScope: { companyId, studentId, phone } } : {}),
    ...(intercycle ? {
      intercycleAnswers: {
        ...intercycle.update, ...intercycle.patch,
        ...(Object.hasOwn(intercycle.patch, "current_pain") && Object.hasOwn(data.answers, "current_pain")
          ? { staff_current_pain: data.answers.current_pain } : {}),
      },
      intercycleGoalNeedsReview: intercycle.goalNeedsReview,
    } : {}),
  });
  if (canonical) {
    return withEffectiveAnswers({
      ...canonical,
      budgetRange: canonical.budgetRange ?? lead?.budget_range ?? null,
      preferredContactPeriod: canonical.preferredContactPeriod ?? lead?.preferred_contact_period ?? null,
      submittedAt: lead?.submitted_at ?? lead?.created_at ?? canonical.submittedAt,
    });
  }
  if (lead) {
    const { [STAFF_LEAD_FIELD_TIMES]: _fieldTimes, ...answers } = leadAnswers;
    if (includeIntercycle) delete answers.__form;
    if (!includeIntercycle && !includeCanonicalAnamnesis && _fieldTimes) answers[STAFF_LEAD_FIELD_TIMES] = _fieldTimes;
    return withEffectiveAnswers({
      recordId: lead.id,
      canonicalRecordId: (anamnesisResult.data as Record<string, unknown> | null)?.id as string | undefined,
      answers,
      budgetRange: lead.budget_range || null,
      preferredContactPeriod: lead.preferred_contact_period || null,
      submittedAt: lead.submitted_at || lead.created_at || null,
      manualNotes: lead.interest_notes || String(answers.notes || ""),
      source: "lead",
    });
  }

  return intercycle ? withEffectiveAnswers({
    source: "intercycle", answers: {}, budgetRange: null, preferredContactPeriod: null,
    submittedAt: String(intercycle.update.submitted_at ?? "") || null,
  }) : null;
}
