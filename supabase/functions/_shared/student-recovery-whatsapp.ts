import {
  evolutionTextRecipient,
  resolveVerifiedWhatsAppRecipient,
} from "./whatsappIdentity.ts";
import { providerErrorDetails } from "./provider-error-redaction.ts";
import { providerIssueFromResponse } from "./whatsappProviderState.ts";

export const RECOVERY_NEUTRAL_RESPONSE = {
  ok: true,
  message:
    "Se existir uma conta de aluna vinculada a esse e-mail, enviaremos as instrucoes pelos canais cadastrados.",
};

type RecoveryResult =
  | "accepted"
  | "reserved"
  | "disabled"
  | "invalid_request"
  | "rate_limited"
  | "identity_not_found"
  | "identity_ambiguous"
  | "auth_user_mismatch"
  | "inactive_student"
  | "trusted_whatsapp_missing"
  | "trusted_whatsapp_ambiguous"
  | "whatsapp_instance_unavailable"
  | "link_error"
  | "provider_error"
  | "internal_error";

type SupabaseAdminLike = {
  auth?: {
    admin?: {
      getUserById?: (
        id: string,
      ) => Promise<
        { data?: { user?: AuthUser | null } | null; error?: unknown }
      >;
      generateLink?: (
        params: any,
      ) => Promise<
        {
          data?: { properties?: { action_link?: string } | null } | null;
          error?: unknown;
        }
      >;
    };
  };
  rpc?: (name: string, params: Record<string, unknown>) => any;
  from: (table: string) => any;
};

type AuthUser = {
  id: string;
  email?: string | null;
  banned_until?: string | null;
};

type StudentRow = {
  id: string;
  company_id: string;
  user_id: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  country_code?: string | null;
  status?: string | null;
};

type TrustedRecipient = {
  companyId: string;
  studentId: string;
  chatId: string;
  remoteJid: string;
  instanceName: string;
};

export type RecoveryRuntimeConfig = {
  enabled: boolean;
  hashSecret: string;
  redirectTo?: string;
  provider?: {
    url: string;
    key: string;
  };
  now?: () => Date;
  fetch?: typeof fetch;
};

export type RecoveryRequestInput = {
  email: unknown;
  requestIp?: string | null;
  userAgent?: string | null;
};

type AttemptInsert = {
  requested_email_hash: string;
  request_ip_hash: string | null;
  user_agent_hash: string | null;
  company_id?: string | null;
  student_id?: string | null;
  result: RecoveryResult;
  provider_status?: number | null;
  provider_code?: string | null;
  metadata?: Record<string, unknown>;
};

const ACTIVE_STUDENT_STATUSES = new Set([
  "active",
  "awaiting_training",
  "awaiting_renewal",
  "trial",
  "pending",
]);

function neutral(status = 200) {
  return { status, body: RECOVERY_NEUTRAL_RESPONSE };
}

export function normalizeRecoveryEmail(value: unknown): string | null {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function safeString(value: unknown) {
  return String(value || "").trim();
}

async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

async function identityHashes(config: RecoveryRuntimeConfig, input: {
  email: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  if (!config.hashSecret || config.hashSecret.length < 24) {
    throw new Error("recovery_hash_secret_missing");
  }
  const requestIp = safeString(input.requestIp);
  const userAgent = safeString(input.userAgent).slice(0, 240);
  return {
    emailHash: await hmacSha256Hex(config.hashSecret, `email:${input.email}`),
    ipHash: requestIp
      ? await hmacSha256Hex(config.hashSecret, `ip:${requestIp}`)
      : null,
    userAgentHash: userAgent
      ? await hmacSha256Hex(config.hashSecret, `ua:${userAgent}`)
      : null,
  };
}

async function reserveAttempt(
  admin: SupabaseAdminLike,
  attempt: AttemptInsert,
) {
  if (!admin.rpc) throw new Error("recovery_reservation_unavailable");
  const result = await admin.rpc("reserve_student_recovery_whatsapp_attempt", {
    p_requested_email_hash: attempt.requested_email_hash,
    p_request_ip_hash: attempt.request_ip_hash,
    p_user_agent_hash: attempt.user_agent_hash,
  });
  if (result.error) throw new Error("recovery_reservation_unavailable");
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return {
    allowed: row?.allowed === true,
    attemptId: typeof row?.attempt_id === "string" ? row.attempt_id : null,
  };
}

async function bindAttempt(
  admin: SupabaseAdminLike,
  attemptId: string,
  companyId: string,
  studentId: string,
) {
  if (!admin.rpc) throw new Error("recovery_binding_unavailable");
  const result = await admin.rpc("bind_student_recovery_whatsapp_attempt", {
    p_attempt_id: attemptId,
    p_company_id: companyId,
    p_student_id: studentId,
  });
  if (result.error) throw new Error("recovery_binding_unavailable");
  return result.data === true;
}

async function finalizeAttempt(
  admin: SupabaseAdminLike,
  attemptId: string,
  attempt: Pick<
    AttemptInsert,
    "result" | "provider_status" | "provider_code" | "metadata"
  >,
) {
  const { error } = await admin
    .from("student_recovery_whatsapp_attempts")
    .update({
      result: attempt.result,
      provider_status: attempt.provider_status ?? null,
      provider_code: attempt.provider_code ?? null,
      metadata: attempt.metadata || {},
    })
    .eq("id", attemptId)
    .eq("result", "reserved");
  if (error) throw new Error("recovery_attempt_finalize_failed");
}

async function findStudentByAuthEmail(
  admin: SupabaseAdminLike,
  email: string,
): Promise<
  { ok: true; student: StudentRow; authEmail: string } | {
    ok: false;
    result: RecoveryResult;
  }
> {
  const studentsResult = await admin
    .from("students")
    .select(
      "id, company_id, user_id, email, phone, whatsapp, country_code, status",
    )
    .eq("email", email)
    .not("user_id", "is", null)
    .limit(3);
  if (studentsResult.error) throw new Error("student_lookup_failed");

  const candidates = (studentsResult.data || []) as StudentRow[];
  if (candidates.length === 0) {
    return { ok: false, result: "identity_not_found" };
  }
  if (candidates.length > 1) return { ok: false, result: "identity_ambiguous" };

  const student = candidates[0];
  if (!student.user_id) return { ok: false, result: "identity_not_found" };

  const authResult = await admin.auth?.admin?.getUserById?.(student.user_id);
  if (authResult?.error || !authResult?.data?.user) {
    return { ok: false, result: "auth_user_mismatch" };
  }

  const authUser = authResult.data.user;
  const authEmail = normalizeRecoveryEmail(authUser.email);
  if (!authEmail || authEmail !== email) {
    return { ok: false, result: "auth_user_mismatch" };
  }
  if (authUser.banned_until) return { ok: false, result: "inactive_student" };

  const status = String(student.status || "").trim();
  if (status && !ACTIVE_STUDENT_STATUSES.has(status)) {
    return { ok: false, result: "inactive_student" };
  }

  return { ok: true, student, authEmail };
}

async function resolveTrustedRecipient(
  admin: SupabaseAdminLike,
  student: StudentRow,
): Promise<
  { ok: true; recipient: TrustedRecipient } | {
    ok: false;
    result: RecoveryResult;
  }
> {
  const chatsResult = await admin
    .from("whatsapp_chats")
    .select(
      "id, company_id, instance_id, remote_jid, student_id, last_message_at",
    )
    .eq("company_id", student.company_id)
    .eq("student_id", student.id)
    .like("remote_jid", "%@s.whatsapp.net")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(5);
  if (chatsResult.error) throw new Error("trusted_chat_lookup_failed");

  const verified: Array<{ chat: any; remoteJid: string }> = [];
  for (const chat of chatsResult.data || []) {
    const resolved = resolveVerifiedWhatsAppRecipient({
      clientRemoteJid: chat.remote_jid,
      chatRemoteJid: chat.remote_jid,
      chatStudentId: chat.student_id,
      requestedStudentId: student.id,
      student,
    });
    if (resolved.ok) verified.push({ chat, remoteJid: resolved.remoteJid });
  }

  if (verified.length === 0) {
    return { ok: false, result: "trusted_whatsapp_missing" };
  }
  const distinctRecipients = new Set(verified.map((item) => item.remoteJid));
  if (distinctRecipients.size > 1) {
    return { ok: false, result: "trusted_whatsapp_ambiguous" };
  }

  const chat = verified[0].chat;
  if (!chat.instance_id) {
    return { ok: false, result: "whatsapp_instance_unavailable" };
  }

  const instanceResult = await admin
    .from("whatsapp_instances")
    .select("id, company_id, instance_name, status")
    .eq("id", chat.instance_id)
    .eq("company_id", student.company_id)
    .eq("status", "connected")
    .maybeSingle();
  if (instanceResult.error || !instanceResult.data?.instance_name) {
    return { ok: false, result: "whatsapp_instance_unavailable" };
  }

  return {
    ok: true,
    recipient: {
      companyId: student.company_id,
      studentId: student.id,
      chatId: chat.id,
      remoteJid: verified[0].remoteJid,
      instanceName: instanceResult.data.instance_name,
    },
  };
}

async function generateRecoveryLink(
  admin: SupabaseAdminLike,
  email: string,
  redirectTo?: string,
) {
  const options = redirectTo ? { redirectTo } : undefined;
  const result = await admin.auth?.admin?.generateLink?.({
    type: "recovery",
    email,
    ...(options ? { options } : {}),
  });
  if (result?.error) throw new Error("recovery_link_generation_failed");
  const actionLink = result?.data?.properties?.action_link;
  if (!actionLink || typeof actionLink !== "string") {
    throw new Error("recovery_link_generation_failed");
  }
  return actionLink;
}

function recoveryMessage(actionLink: string) {
  return [
    "Recebemos uma solicitacao de recuperacao de senha do SETT.",
    "",
    `Redefinir senha: ${actionLink}`,
    "",
    "Se voce nao pediu isso, ignore esta mensagem. Por seguranca, nunca encaminhe este link.",
  ].join("\n");
}

async function sendRecoveryMessage(args: {
  config: RecoveryRuntimeConfig;
  recipient: TrustedRecipient;
  actionLink: string;
}) {
  if (!args.config.provider?.url || !args.config.provider?.key) {
    return {
      ok: false as const,
      status: null,
      code: "whatsapp_provider_not_configured",
    };
  }
  const response = await (args.config.fetch || fetch)(
    `${args.config.provider.url}/message/sendText/${args.recipient.instanceName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: args.config.provider.key,
      },
      body: JSON.stringify({
        number: evolutionTextRecipient(args.recipient.remoteJid),
        text: recoveryMessage(args.actionLink),
      }),
    },
  );
  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    const providerCode = providerIssueFromResponse(response.status, rawBody);
    return { ok: false as const, status: response.status, code: providerCode };
  }
  return { ok: true as const };
}

export async function handleStudentRecoveryWhatsApp(
  admin: SupabaseAdminLike,
  config: RecoveryRuntimeConfig,
  input: RecoveryRequestInput,
) {
  const email = normalizeRecoveryEmail(input.email);

  let hashes: Awaited<ReturnType<typeof identityHashes>>;
  try {
    hashes = await identityHashes(config, {
      email: email ||
        `invalid:${safeString(input.email).toLowerCase().slice(0, 254)}`,
      requestIp: input.requestIp,
      userAgent: input.userAgent,
    });
  } catch (_error) {
    return neutral();
  }

  const baseAttempt = {
    requested_email_hash: hashes.emailHash,
    request_ip_hash: hashes.ipHash,
    user_agent_hash: hashes.userAgentHash,
  };

  try {
    const reservation = await reserveAttempt(admin, {
      ...baseAttempt,
      result: "reserved",
    });
    if (!reservation.allowed || !reservation.attemptId) return neutral();
    const attemptId = reservation.attemptId;

    if (!email) {
      await finalizeAttempt(admin, attemptId, { result: "invalid_request" });
      return neutral();
    }

    if (!config.enabled) {
      await finalizeAttempt(admin, attemptId, { result: "disabled" });
      return neutral();
    }

    const studentResolution = await findStudentByAuthEmail(admin, email);
    if (!studentResolution.ok) {
      await finalizeAttempt(admin, attemptId, {
        result: studentResolution.result,
      });
      return neutral();
    }

    const { student, authEmail } = studentResolution;
    const bound = await bindAttempt(
      admin,
      attemptId,
      student.company_id,
      student.id,
    );
    if (!bound) {
      await finalizeAttempt(admin, attemptId, { result: "rate_limited" });
      return neutral();
    }

    const recipientResolution = await resolveTrustedRecipient(admin, student);
    if (!recipientResolution.ok) {
      await finalizeAttempt(admin, attemptId, {
        result: recipientResolution.result,
      });
      return neutral();
    }

    let actionLink: string;
    try {
      actionLink = await generateRecoveryLink(
        admin,
        authEmail,
        config.redirectTo,
      );
    } catch (_error) {
      await finalizeAttempt(admin, attemptId, { result: "link_error" });
      return neutral();
    }

    const sendResult = await sendRecoveryMessage({
      config,
      recipient: recipientResolution.recipient,
      actionLink,
    });
    if (!sendResult.ok) {
      const details = sendResult.status
        ? providerErrorDetails(sendResult.status, sendResult.code)
        : sendResult.code;
      await finalizeAttempt(admin, attemptId, {
        result: "provider_error",
        provider_status: sendResult.status,
        provider_code: sendResult.code,
        metadata: { details },
      });
      return neutral();
    }

    await finalizeAttempt(admin, attemptId, { result: "accepted" });
    return neutral();
  } catch (_error) {
    return neutral();
  }
}
