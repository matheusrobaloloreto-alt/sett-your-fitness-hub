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

interface WorkoutFeedbackStudent {
  company_id: string;
  full_name: string | null;
  whatsapp: string | null;
  phone: string | null;
}

interface DeliverWorkoutFeedbackToWhatsappArgs {
  db: any;
  studentId: string;
  student: WorkoutFeedbackStudent;
  content: string;
  nowIso?: () => string;
  log?: (message: string, details?: unknown) => void;
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

export async function deliverWorkoutFeedbackToWhatsapp({
  db,
  studentId,
  student,
  content,
  nowIso = () => new Date().toISOString(),
  log = console.warn,
}: DeliverWorkoutFeedbackToWhatsappArgs): Promise<{ delivered: boolean }> {
  try {
    const { data: existingChat, error: chatLookupError } = await db
      .from("whatsapp_chats")
      .select("id, unread_count")
      .eq("student_id", studentId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (chatLookupError) throw chatLookupError;
    let chat = existingChat;

    if (!chat) {
      const digits = String(student.whatsapp || student.phone || "").replace(/\D/g, "");
      const { data: inst, error: instanceError } = await db
        .from("whatsapp_instances")
        .select("id")
        .eq("company_id", student.company_id)
        .order("status")
        .limit(1)
        .maybeSingle();
      if (instanceError) throw instanceError;

      if (digits && inst?.id) {
        const remoteJid = `${digits.startsWith("55") ? digits : "55" + digits}@s.whatsapp.net`;
        const { data: created, error: createChatError } = await db
          .from("whatsapp_chats")
          .insert({
            company_id: student.company_id,
            instance_id: inst.id,
            remote_jid: remoteJid,
            student_id: studentId,
            contact_name: student.full_name,
          })
          .select("id, unread_count")
          .maybeSingle();
        if (createChatError) throw createChatError;
        chat = created;
      }
    }

    if (!chat?.id) {
      return { delivered: false };
    }

    const sentAt = nowIso();
    const { error: messageError } = await db.from("whatsapp_messages").insert({
      chat_id: chat.id,
      company_id: student.company_id,
      content,
      type: "text",
      source: "incoming",
      is_from_me: false,
      status: "received",
      timestamp: sentAt,
      sender_id: studentId,
    });
    if (messageError) throw messageError;

    const { error: chatError } = await db
      .from("whatsapp_chats")
      .update({
        unread_count: (Number(chat.unread_count) || 0) + 1,
        last_message: content.slice(0, 120),
        last_message_at: sentAt,
      })
      .eq("id", chat.id);
    if (chatError) throw chatError;

    return { delivered: true };
  } catch (error) {
    log("Workout feedback WhatsApp mirror failed after persistence", error);
    return { delivered: false };
  }
}
