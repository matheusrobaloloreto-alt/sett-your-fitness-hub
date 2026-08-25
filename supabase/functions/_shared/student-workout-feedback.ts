import {
  directWhatsAppJidVariants,
  normalizeWhatsAppPhoneKey,
  sameWhatsAppRecipient,
} from "./whatsappIdentity.ts";

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

export async function persistWorkoutFeedbackOnce({
  db,
  record,
}: {
  db: any;
  record: Record<string, unknown> & {
    student_id: string;
    workout_session_id?: string | null;
  };
}): Promise<{ id: string; duplicate: boolean }> {
  const { data, error } = await db.from("workout_feedback")
    .insert(record)
    .select("id")
    .single();
  if (!error && data?.id) return { id: data.id, duplicate: false };

  if (error?.code === "23505" && record.workout_session_id) {
    const { data: existing, error: existingError } = await db
      .from("workout_feedback")
      .select("id")
      .eq("student_id", record.student_id)
      .eq("workout_session_id", record.workout_session_id)
      .single();
    if (!existingError && existing?.id) {
      return { id: existing.id, duplicate: true };
    }
  }

  throw new Error(
    `Falha ao registrar feedback: ${error?.message || "registro não retornado"}`,
  );
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
    const phoneKeys = new Set(
      [student.whatsapp, student.phone]
        .map(normalizeWhatsAppPhoneKey)
        .filter((value): value is string => Boolean(value)),
    );
    if (phoneKeys.size !== 1) return { delivered: false };

    const canonicalRemoteJid = `55${[...phoneKeys][0]}@s.whatsapp.net`;
    const { data: linkedChat, error: linkedChatError } = await db
      .from("whatsapp_chats")
      .select("id, unread_count, student_id, remote_jid, instance_id")
      .eq("student_id", studentId)
      .eq("company_id", student.company_id)
      .order("last_message_at", { ascending: false })
      .maybeSingle();
    if (linkedChatError) throw linkedChatError;
    if (
      linkedChat &&
      !sameWhatsAppRecipient(linkedChat.remote_jid, canonicalRemoteJid)
    ) return { delivered: false };
    let chat = linkedChat;

    let instanceQuery = db.from("whatsapp_instances")
      .select("id")
      .eq("company_id", student.company_id)
      .eq("status", "connected");
    if (linkedChat?.instance_id) {
      instanceQuery = instanceQuery.eq("id", linkedChat.instance_id);
    }
    const { data: inst, error: instanceError } = await instanceQuery
      .maybeSingle();
    if (instanceError) throw instanceError;
    if (!inst?.id) return { delivered: false };

    if (!chat) {
      const { data: phoneChat, error: phoneChatError } = await db
        .from("whatsapp_chats")
        .select("id, unread_count, student_id, remote_jid")
        .eq("company_id", student.company_id)
        .eq("instance_id", inst.id)
        .in("remote_jid", directWhatsAppJidVariants(canonicalRemoteJid))
        .order("last_message_at", { ascending: false })
        .maybeSingle();
      if (phoneChatError) throw phoneChatError;

      if (
        phoneChat?.student_id && String(phoneChat.student_id) !== studentId
      ) return { delivered: false };
      chat = phoneChat;
    }

    if (!chat) {
      const { data: created, error: createChatError } = await db
        .from("whatsapp_chats")
        .insert({
          company_id: student.company_id,
          instance_id: inst.id,
          remote_jid: canonicalRemoteJid,
          student_id: studentId,
          contact_name: student.full_name,
        })
        .select("id, unread_count")
        .maybeSingle();
      if (createChatError) throw createChatError;
      chat = created;
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
