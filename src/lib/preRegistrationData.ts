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

const LEAD_SELECT = "pre_registration_answers, budget_range, preferred_contact_period, submitted_at, created_at";

export async function resolveStudioAnamnesis({
  studentId,
  companyId,
  phone,
  db = supabase as any,
  loadPreRegistration = loadStudioPreRegistrationFallback,
}: ResolveStudioAnamnesisInput): Promise<Record<string, unknown> | null> {
  if (!studentId) return null;

  let query = db.from("student_anamneses").select("*").eq("student_id", studentId);
  if (companyId) query = query.eq("company_id", companyId);
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
      answers,
      budgetRange: lead.budget_range || null,
      preferredContactPeriod: lead.preferred_contact_period || null,
      submittedAt: lead.submitted_at || lead.created_at || null,
      source: "lead",
    };
  }

  const canonicalAnswers = canonicalAnamnesisToPreRegistrationAnswers(anamnesisResult.data);
  if (Object.keys(canonicalAnswers).length === 0) return null;
  return {
    answers: canonicalAnswers,
    budgetRange: null,
    preferredContactPeriod: null,
    submittedAt: (anamnesisResult.data as Record<string, unknown>)?.updated_at as string || null,
    source: "student_anamnesis",
  };
}
