// Existing login flow only: read-only identity snapshot and short-lived, actor-bound state tokens.
// No credentials, provider calls or writes belong in a preflight.
import { HttpError, isUuid } from "./tenant-auth.ts";
import { resolveVerifiedWhatsAppRecipient } from "./whatsappIdentity.ts";

type Client = {
  from(table: string): any;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};
export type LoginDestination = {
  companyId: string;
  studentId: string;
  chatId?: string | null;
  remoteJid?: string | null;
};
export type LoginSnapshot = {
  companyId: string;
  studentId: string;
  chatId: string | null;
  remoteJid: string;
  student: {
    id: string;
    company_id: string;
    phone: string | null;
    whatsapp: string | null;
    country_code: string | null;
    updated_at: string;
    email: string;
    user_id: string | null;
    full_name: string;
  };
  chat: {
    id: string;
    student_id: string | null;
    remote_jid: string;
    instance_id: string | null;
  } | null;
  stateHash: string;
  contactHash: string;
};
export class LoginPreflightError extends HttpError {
  constructor(public code: string, status = 409) {
    super(status, code);
  }
}
function fail(code: string, status = 409): never {
  throw new LoginPreflightError(code, status);
}
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-")
    .replace(/\//g, "_");
const decode = (value: string) =>
  Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
async function hash(value: unknown) {
  return encode(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(JSON.stringify(value)),
      ),
    ),
  );
}
export async function loadStudentLoginSnapshot(
  client: Client,
  input: LoginDestination,
): Promise<LoginSnapshot> {
  if (
    !isUuid(input.companyId) || !isUuid(input.studentId) ||
    (input.chatId != null && !isUuid(input.chatId))
  ) fail("student_login_scope_invalid", 400);
  const { data: student, error } = await client.from("students").select(
    "id,company_id,phone,whatsapp,country_code,updated_at,email,user_id,full_name",
  ).eq("id", input.studentId).eq("company_id", input.companyId).maybeSingle();
  if (error) fail("student_login_preflight_unavailable", 503);
  if (
    !student || student.id !== input.studentId ||
    student.company_id !== input.companyId
  ) fail("whatsapp_student_not_found", 404);
  if (
    typeof student.updated_at !== "string" || !student.updated_at ||
    typeof student.email !== "string" || !student.email.trim()
  ) fail("student_login_contact_incomplete");
  let query = client.from("whatsapp_chats").select(
    "id,company_id,student_id,remote_jid,instance_id",
  ).eq("company_id", input.companyId);
  const result = input.chatId
    ? await query.eq("id", input.chatId).maybeSingle()
    : await query.eq("student_id", input.studentId).limit(2);
  if (result.error) fail("student_login_preflight_unavailable", 503);
  const rows = input.chatId ? (result.data ? [result.data] : []) : result.data;
  if (!Array.isArray(rows)) fail("student_login_preflight_unavailable", 503);
  if ((input.chatId && rows.length !== 1) || rows.length > 1) {
    fail("student_login_chat_ambiguous");
  }
  const chat = rows[0] || null;
  if (input.chatId && chat?.id !== input.chatId) {
    fail("student_login_chat_ambiguous");
  }
  if (
    chat &&
    (chat.company_id !== input.companyId || chat.student_id !== input.studentId)
  ) fail("whatsapp_student_mismatch");
  const verified = resolveVerifiedWhatsAppRecipient({
    student,
    requestedStudentId: input.studentId,
    chatStudentId: chat?.student_id,
    chatRemoteJid: chat?.remote_jid,
    clientRemoteJid: input.remoteJid || chat?.remote_jid || student.whatsapp ||
      student.phone,
  });
  if (!verified.ok) fail(verified.code);
  // A partial default PostgREST page cannot prove exclusive phone ownership.
  const candidates: any[] = [];
  for (let offset = 0;; offset += 500) {
    const page = await client.from("students").select(
      "id,company_id,phone,whatsapp,country_code",
    )
      .eq("company_id", input.companyId).order("id", { ascending: true }).range(
        offset,
        offset + 499,
      );
    if (page.error || !Array.isArray(page.data)) {
      fail("student_login_preflight_unavailable", 503);
    }
    candidates.push(...page.data);
    if (page.data.length < 500) break;
  }
  const owners = candidates.filter((candidate: any) =>
    candidate.company_id === input.companyId &&
    resolveVerifiedWhatsAppRecipient({
      student: candidate,
      requestedStudentId: candidate.id,
      clientRemoteJid: verified.remoteJid,
    }).ok
  );
  if (owners.length !== 1 || owners[0].id !== input.studentId) {
    fail("student_login_contact_ownership_conflict");
  }
  if (chat?.instance_id) {
    const { data: instance, error: instanceError } = await client.from(
      "whatsapp_instances",
    ).select("id,company_id").eq("id", chat.instance_id).eq(
      "company_id",
      input.companyId,
    ).maybeSingle();
    if (instanceError) fail("student_login_preflight_unavailable", 503);
    if (!instance || instance.company_id !== input.companyId) {
      fail("student_login_instance_mismatch");
    }
  }
  const contact = {
    companyId: input.companyId,
    studentId: input.studentId,
    phone: student.phone,
    whatsapp: student.whatsapp,
    country_code: student.country_code,
    email: student.email,
    chat: chat
      ? {
        id: chat.id,
        student_id: chat.student_id,
        remote_jid: chat.remote_jid,
        instance_id: chat.instance_id,
      }
      : null,
  };
  return {
    companyId: input.companyId,
    studentId: input.studentId,
    chatId: chat?.id || null,
    remoteJid: verified.remoteJid,
    student,
    chat: chat
      ? {
        id: chat.id,
        student_id: chat.student_id,
        remote_jid: chat.remote_jid,
        instance_id: chat.instance_id,
      }
      : null,
    contactHash: await hash(contact),
    stateHash: await hash({
      ...contact,
      updated_at: student.updated_at,
      user_id: student.user_id,
    }),
  };
}
type StateToken = {
  v: 1;
  purpose: "generate" | "send";
  actor: string;
  companyId: string;
  studentId: string;
  chatId: string | null;
  remoteJid: string;
  stateHash: string;
  nonce: string;
  expires: number;
};
async function signingKey(secret: string) {
  if (!secret) fail("student_login_preflight_unavailable", 503);
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode("sett.student-login.state.v1\0" + secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function issueStudentLoginToken(
  snapshot: LoginSnapshot,
  actor: string,
  secret: string,
  purpose: StateToken["purpose"] = "generate",
) {
  if (!isUuid(actor)) fail("student_login_scope_invalid", 401);
  const state: StateToken = {
    v: 1,
    purpose,
    actor,
    companyId: snapshot.companyId,
    studentId: snapshot.studentId,
    chatId: snapshot.chatId,
    remoteJid: snapshot.remoteJid,
    stateHash: snapshot.stateHash,
    nonce: crypto.randomUUID(),
    expires: Date.now() + 120000,
  };
  const payload = encode(encoder.encode(JSON.stringify(state)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(payload),
  );
  return {
    token: payload + "." + encode(new Uint8Array(signature)),
    expiresAt: new Date(state.expires).toISOString(),
  };
}
export async function verifyStudentLoginToken(
  token: unknown,
  snapshot: LoginSnapshot,
  actor: string,
  secret: string,
  purpose: StateToken["purpose"] = "generate",
): Promise<StateToken> {
  if (typeof token !== "string" || token.length > 4096) {
    fail("student_login_preflight_required", 400);
  }
  try {
    const [payload, signature, ...extra] = token.split(".");
    if (
      !payload || !signature || extra.length ||
      !await crypto.subtle.verify(
        "HMAC",
        await signingKey(secret),
        decode(signature),
        encoder.encode(payload),
      )
    ) fail("student_login_preflight_stale");
    const state = JSON.parse(
      new TextDecoder().decode(decode(payload)),
    ) as StateToken;
    if (
      state.v !== 1 || state.purpose !== purpose || state.actor !== actor ||
      state.companyId !== snapshot.companyId ||
      state.studentId !== snapshot.studentId ||
      state.chatId !== snapshot.chatId ||
      state.remoteJid !== snapshot.remoteJid ||
      state.stateHash !== snapshot.stateHash || !isUuid(state.nonce) ||
      !Number.isFinite(state.expires) || state.expires <= Date.now() ||
      state.expires > Date.now() + 120000
    ) fail("student_login_preflight_stale");
    return state;
  } catch (error) {
    if (error instanceof LoginPreflightError) throw error;
    fail("student_login_preflight_stale");
  }
}
export async function claimStudentLoginGeneration(
  client: Client,
  snapshot: LoginSnapshot,
  state: StateToken,
) {
  const { data, error } = await client.rpc(
    state.purpose === "send"
      ? "claim_student_login_send_v1"
      : "claim_student_login_generation_v1",
    {
      p_actor_id: state.actor,
      p_company_id: snapshot.companyId,
      p_student_id: snapshot.studentId,
      p_chat_id: snapshot.chatId,
      p_nonce: state.nonce,
      p_expected_student_updated_at: snapshot.student.updated_at,
      p_expected_remote_jid: snapshot.chat?.remote_jid ?? null,
      p_expected_chat_student_id: snapshot.chat?.student_id ?? null,
      p_expected_instance_id: snapshot.chat?.instance_id ?? null,
    },
  );
  if (error) fail("student_login_generation_claim_unavailable", 503);
  if (data !== true) fail("student_login_preflight_used_or_stale");
}

export async function completeStudentLoginClaim(
  client: Client,
  snapshot: LoginSnapshot,
  state: StateToken,
) {
  const { data, error } = await client.rpc("complete_student_login_claim_v1", {
    p_actor_id: state.actor,
    p_company_id: snapshot.companyId,
    p_student_id: snapshot.studentId,
    p_nonce: state.nonce,
    p_expected_student_updated_at: snapshot.student.updated_at,
    p_expected_user_id: snapshot.student.user_id,
  });
  if (error || data !== true) {
    fail("student_login_claim_completion_uncertain", 503);
  }
}
