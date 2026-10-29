// student-login-credentials
// Gera/redefine a credencial de acesso do ALUNO e devolve {email, password} para o professor
// copiar/enviar (WhatsApp). Funciona tanto para conta nova quanto para aluno já vinculado
// (nesse caso REDEFINE a senha para um valor conhecido). Autorização por empresa (staff/master).
import {
  claimStudentLoginGeneration,
  completeStudentLoginClaim,
  issueStudentLoginToken,
  loadStudentLoginSnapshot,
  LoginPreflightError,
  verifyStudentLoginToken,
} from "../_shared/student-login-credentials.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, HttpError } from "../_shared/tenant-auth.ts";
import {
  createStudentAccount,
  ensureStudentAccountMembership,
  getLinkedStudentAccount,
} from "../_shared/student-account-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

// senha forte, legível e fácil de digitar no celular (sem caracteres ambíguos)
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let core = "";
  for (const b of bytes) core += alphabet[b % alphabet.length];
  return core + "@7a"; // garante símbolo + dígito + minúscula → passa em qualquer policy
}

export async function handleStudentLoginCredentials(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth
      .getClaims(token);
    if (
      claimsError || !claimsData?.claims ||
      claimsData.claims.is_anonymous === true
    ) return json(401, { error: "Unauthorized" });
    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { student_id, company_id, chat_id, remote_jid, preflight_token } =
      body;
    if (
      body.action !== "generate-login-credentials" || !student_id ||
      !company_id || !preflight_token
    ) {
      return json(400, {
        error: "Confirme a geração do acesso após validar o contato.",
        code: "student_login_preflight_required",
      });
    }

    // Autorização por empresa (master ou staff da mesma empresa do aluno)
    const tenant = await assertTenantAccess(adminClient, claimsData.claims, {
      studentId: student_id,
      companyId: company_id,
      requireStaff: true,
    });
    const { data: callerRoles, error: callerRolesError } = await adminClient
      .from("user_roles").select("role").eq("user_id", callerId);
    if (callerRolesError || !Array.isArray(callerRoles)) {
      return json(503, { error: "Unable to validate staff role" });
    }
    const roles = (callerRoles || []).map((r: any) => r.role);
    if (
      !roles.some((r: string) =>
        ["admin", "master", "coordinator", "trainer"].includes(r)
      )
    ) {
      return json(403, { error: "Forbidden" });
    }

    const destination = {
      companyId: tenant.companyId,
      studentId: student_id,
      chatId: chat_id ?? null,
      remoteJid: remote_jid ?? null,
    };
    const snapshot = await loadStudentLoginSnapshot(adminClient, destination);
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const state = await verifyStudentLoginToken(
      preflight_token,
      snapshot,
      callerId,
      secret,
    );
    const student = snapshot.student;
    // Account identity lookups are reads. Do not repair membership or mutate Auth before
    // durable nonce consumption and a second, fresh destination comparison.
    const identity = await getLinkedStudentAccount(adminClient, student);
    const fresh = await loadStudentLoginSnapshot(adminClient, destination);
    await verifyStudentLoginToken(preflight_token, fresh, callerId, secret);
    await claimStudentLoginGeneration(adminClient, fresh, state);
    const password = generatePassword();
    let userId: string;
    if (identity) {
      await ensureStudentAccountMembership(adminClient, student, identity);
      const immediatelyBeforeReset = await loadStudentLoginSnapshot(
        adminClient,
        destination,
      );
      await verifyStudentLoginToken(
        preflight_token,
        immediatelyBeforeReset,
        callerId,
        secret,
      );
      const { data, error } = await adminClient.auth.admin.updateUserById(
        identity.userId,
        { password, email_confirm: true },
      );
      if (error || data?.user?.id !== identity.userId) {
        return json(503, {
          error: "Nao foi possivel redefinir o acesso do aluno",
        });
      }
      userId = identity.userId;
    } else {
      userId = await createStudentAccount(adminClient, student, password);
    }

    const after = await loadStudentLoginSnapshot(adminClient, destination);
    if (
      after.contactHash !== fresh.contactHash ||
      after.student.user_id !== userId
    ) {
      throw new LoginPreflightError(
        "student_login_state_changed_after_generation",
      );
    }
    await completeStudentLoginClaim(adminClient, after, state);
    const send = await issueStudentLoginToken(after, callerId, secret, "send");
    return json(200, {
      email: student.email,
      password,
      user_id: userId,
      companyId: after.companyId,
      studentId: after.studentId,
      chatId: after.chatId,
      remoteJid: after.remoteJid,
      stateFingerprint: after.stateHash,
      loginSendToken: send.token,
      expiresAt: send.expiresAt,
    });
  } catch (err) {
    if (err instanceof LoginPreflightError) {
      return json(err.status, {
        error:
          "O contato ou o pedido de acesso mudou. Valide novamente antes de gerar ou enviar.",
        code: err.code,
      });
    }
    const status = err instanceof HttpError ? (err as HttpError).status : 500;
    return json(status, {
      error: err instanceof HttpError
        ? err.message
        : "Nao foi possivel liberar o acesso do aluno",
    });
  }
}

if (import.meta.main) Deno.serve(handleStudentLoginCredentials);
