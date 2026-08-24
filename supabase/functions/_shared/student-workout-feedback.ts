export interface NormalizedWorkoutFeedbackPayload {
  perception: "Difícil" | "Bom" | "Ótimo" | null;
  reflection: string;
  workoutTitle: string | null;
  workoutSessionId: string | null;
}

interface BuildRecordArgs {
  studentId: string;
  companyId: string;
  payload: NormalizedWorkoutFeedbackPayload;
}

const PERCEPTION_TO_DIFFICULTY: Record<string, number> = {
  "Difícil": 8,
  "Bom": 5,
  "Ótimo": 3,
};

const PAIN_TERMS = ["joelho", "lombar", "ombro", "quadril", "tornozelo", "punho", "cotovelo", "pescoço"];

function compactText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function hasTextualContent(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function normalizePerception(value: unknown): NormalizedWorkoutFeedbackPayload["perception"] {
  const text = compactText(value, 40);
  if (text === "Difícil" || text === "Bom" || text === "Ótimo") return text;
  return null;
}

export function normalizeWorkoutFeedbackPayload(body: Record<string, unknown>): NormalizedWorkoutFeedbackPayload {
  const reflection = compactText(body.reflection ?? body.feedback, 1000);
  const perception = normalizePerception(body.perception ?? body.rating);
  if (reflection && !hasTextualContent(reflection)) {
    throw new Error("Escreva um texto curto para enviar o feedback.");
  }
  if (!reflection && !perception) {
    throw new Error("Informe como foi o treino antes de enviar.");
  }

  const workoutTitle = compactText(body.workout_title, 120) || null;
  const workoutSessionId = typeof body.workout_session_id === "string" && body.workout_session_id.trim()
    ? body.workout_session_id.trim()
    : null;

  return { perception, reflection, workoutTitle, workoutSessionId };
}

export function buildWorkoutFeedbackRecord({ studentId, companyId, payload }: BuildRecordArgs) {
  const painAreas = PAIN_TERMS.filter((area) => payload.reflection.toLocaleLowerCase("pt-BR").includes(area));
  return {
    student_id: studentId,
    company_id: companyId,
    workout_session_id: payload.workoutSessionId,
    workout_title: payload.workoutTitle,
    difficulty: payload.perception ? PERCEPTION_TO_DIFFICULTY[payload.perception] : null,
    pain_areas: painAreas,
    notes: [
      payload.perception ? `Percepção: ${payload.perception}` : null,
      payload.reflection || null,
    ].filter(Boolean).join("\n") || null,
  };
}

export function buildWorkoutFeedbackMessage({
  firstName,
  payload,
}: {
  firstName: string;
  payload: NormalizedWorkoutFeedbackPayload;
}) {
  const ratingLine = payload.perception ? `Percepção: ${payload.perception}\n` : "";
  const titleLine = payload.workoutTitle ? ` (${payload.workoutTitle.slice(0, 60)})` : "";
  return `Feedback de treino${titleLine} — ${firstName}\n${ratingLine}${payload.reflection || "(sem comentário adicional)"}`;
}
