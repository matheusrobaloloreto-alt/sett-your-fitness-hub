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

export function canonicalAnamnesisUpdateFromPreRegistration(data: PreRegistrationData) {
  const answers = data.answers;
  const update: Record<string, unknown> = {
    notes: optionalText(data.manualNotes),
    updated_at: new Date().toISOString(),
  };
  const has = (...keys: string[]) => keys.some((key) => Object.prototype.hasOwnProperty.call(answers, key));
  const assign = (column: string, value: unknown, ...keys: string[]) => {
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
  assign("injuries", optionalText(answers.injuries ?? answers.current_pain), "injuries", "current_pain");
  assign("food_restrictions", optionalText(answers.food_restrictions), "food_restrictions");
  assign("nutrition_context", optionalText(answers.nutrition_context ?? answers.nutrition), "nutrition_context", "nutrition");
  assign("budget_food", optionalText(answers.budget_food), "budget_food");
  assign("meals_per_day", optionalNumber(answers.meals_per_day), "meals_per_day");
  return update;
}

export async function updateStudentPreRegistration(data: PreRegistrationData): Promise<PreRegistrationData> {
  if (!data.recordId) throw new Error("Registro da anamnese não identificado.");
  const db = supabase as any;
  const updatedAt = new Date().toISOString();
  const manualNotes = data.manualNotes?.trim() || "";

  if (data.source === "lead") {
    const answers = {
      ...data.answers,
      ...(manualNotes ? { notes: manualNotes } : {}),
    };
    if (!manualNotes) delete answers.notes;
    const writes = [
      db.from("leads").update({
        pre_registration_answers: answers,
        budget_range: data.budgetRange,
        preferred_contact_period: data.preferredContactPeriod,
        interest_notes: optionalText(manualNotes),
        updated_at: updatedAt,
      }).eq("id", data.recordId),
    ];
    if (data.canonicalRecordId) {
      writes.push(
        db.from("student_anamneses")
          .update(canonicalAnamnesisUpdateFromPreRegistration({ ...data, answers, manualNotes }))
          .eq("id", data.canonicalRecordId),
      );
    }
    const results = await Promise.all(writes);
    const failed = results.find((result) => result.error)?.error;
    if (failed) throw new Error(failed.message || "Falha ao atualizar o pré-cadastro.");
    return { ...data, answers, manualNotes };
  }

  const { error } = await db.from("student_anamneses")
    .update(canonicalAnamnesisUpdateFromPreRegistration(data))
    .eq("id", data.recordId);
  if (error) throw new Error(error.message || "Falha ao atualizar a anamnese.");
  return { ...data, manualNotes };
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

  let query = db.from("student_anamneses").select("*").eq("student_id", studentId);
  query = query.eq("company_id", companyId);
  const { data: canonical, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message || "Falha ao carregar anamnese canônica do aluno.");
  }
  if (canonical) return canonical;

  const preRegistration = await loadPreRegistration({ studentId, companyId, phone });
  if (!preRegistration) return null;
  return preRegistrationToStudioAnamnesis(preRegistration, { studentId, companyId: companyId ?? null });
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
}: LoadStudentPreRegistrationInput): Promise<PreRegistrationData | null> {
  const db = supabase as any;
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

  const leadByPhonePromise = phoneCandidates.length > 0
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

  const [leadByStudent, leadByPhone, anamnesisResult] = await Promise.all([
    leadByStudentPromise,
    leadByPhonePromise,
    anamnesisPromise,
  ]);

  if (throwOnError) {
    const error = leadByStudent.error || leadByPhone.error || anamnesisResult.error;
    if (error) throw new Error(error.message || "Falha ao carregar pré-cadastro do aluno.");
  }

  const lead = leadByStudent.data || leadByPhone.data;
  if (lead) {
    const answers = isPreRegistrationRecord(lead.pre_registration_answers)
      ? lead.pre_registration_answers
      : {};
    return {
      recordId: lead.id,
      canonicalRecordId: (anamnesisResult.data as Record<string, unknown> | null)?.id as string | undefined,
      answers,
      budgetRange: lead.budget_range || null,
      preferredContactPeriod: lead.preferred_contact_period || null,
      submittedAt: lead.submitted_at || lead.created_at || null,
      manualNotes: lead.interest_notes || String(answers.notes || ""),
      source: "lead",
    };
  }

  const canonicalAnswers = canonicalAnamnesisToPreRegistrationAnswers(anamnesisResult.data);
  if (Object.keys(canonicalAnswers).length === 0) return null;
  return {
    recordId: (anamnesisResult.data as Record<string, unknown>).id as string,
    answers: canonicalAnswers,
    budgetRange: null,
    preferredContactPeriod: null,
    submittedAt: (anamnesisResult.data as Record<string, unknown>)?.updated_at as string || null,
    manualNotes: String((anamnesisResult.data as Record<string, unknown>)?.notes || ""),
    source: "student_anamnesis",
  };
}
