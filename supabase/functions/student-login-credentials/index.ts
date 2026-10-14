// student-login-credentials
// Gera/redefine a credencial de acesso do ALUNO e devolve {email, password} para o professor
// copiar/enviar (WhatsApp). Funciona tanto para conta nova quanto para aluno já vinculado
// (nesse caso REDEFINE a senha para um valor conhecido). Autorização por empresa (staff/master).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, HttpError } from "../_shared/tenant-auth.ts";
import { createStudentAccount, ensureStudentAccountMembership, getLinkedStudentAccount } from "../_shared/student-account-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// senha forte, legível e fácil de digitar no celular (sem caracteres ambíguos)
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let core = "";
  for (const b of bytes) core += alphabet[b % alphabet.length];
  return core + "@7a"; // garante símbolo + dígito + minúscula → passa em qualquer policy
}

export async function handleStudentLoginCredentials(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims || claimsData.claims.is_anonymous === true) return json(401, { error: "Unauthorized" });
    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { student_id } = await req.json().catch(() => ({}));
    if (!student_id) return json(400, { error: "student_id required" });

    // Autorização por empresa (master ou staff da mesma empresa do aluno)
    const tenant = await assertTenantAccess(adminClient, claimsData.claims, { studentId: student_id, requireStaff: true });
    const { data: callerRoles, error: callerRolesError } = await adminClient.from("user_roles").select("role").eq("user_id", callerId);
    if (callerRolesError || !Array.isArray(callerRoles)) return json(503, { error: "Unable to validate staff role" });
    const roles = (callerRoles || []).map((r: any) => r.role);
    if (!roles.some((r: string) => ["admin", "master", "coordinator", "trainer"].includes(r))) {
      return json(403, { error: "Forbidden" });
    }

    const { data: student, error: studentError } = await adminClient
      .from("students")
      .select("id, email, full_name, user_id, company_id")
      .eq("id", student_id)
      .eq("company_id", tenant.companyId)
      .single();
    if (studentError || !student) return json(404, { error: "Student not found" });
    if (!student.email) return json(400, { error: "Aluno precisa ter um email cadastrado" });

    const password = generatePassword();
    const identity = await getLinkedStudentAccount(adminClient, student);
    let userId: string;
    if (identity) {
      await ensureStudentAccountMembership(adminClient, student, identity);
      const { data, error } = await adminClient.auth.admin.updateUserById(identity.userId, { password, email_confirm: true });
      if (error || data?.user?.id !== identity.userId) {
        return json(503, { error: "Nao foi possivel redefinir o acesso do aluno" });
      }
      userId = identity.userId;
    } else {
      userId = await createStudentAccount(adminClient, student, password);
    }

    return json(200, { email: student.email, password, user_id: userId });
  } catch (err) {
    const status = err instanceof HttpError ? (err as HttpError).status : 500;
    return json(status, { error: err instanceof HttpError ? err.message : "Nao foi possivel liberar o acesso do aluno" });
  }
}

if (import.meta.main) Deno.serve(handleStudentLoginCredentials);
