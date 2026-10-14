import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError, isUuid } from "../_shared/tenant-auth.ts";
import { createStudentAccount, getLinkedStudentAccount } from "../_shared/student-account-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export async function handleActivateStudentAccess(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims || claimsData.claims.is_anonymous === true) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check caller is admin/master/coordinator/trainer
    const { data: callerRoles, error: callerRolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    if (callerRolesError || !Array.isArray(callerRoles)) {
      throw new HttpError(503, "Unable to validate staff role");
    }

    const roles = callerRoles?.map((r: any) => r.role) || [];
    if (!roles.some((r: string) => ["admin", "master", "coordinator", "trainer"].includes(r))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { student_id } = await req.json();
    if (!isUuid(student_id)) {
      return new Response(JSON.stringify({ error: "student_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get student
    const { data: student, error: studentError } = await adminClient
      .from("students")
      .select("id, email, full_name, user_id, company_id")
      .eq("id", student_id)
      .single();

    if (studentError || !student) {
      return new Response(JSON.stringify({ error: "Student not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!student.company_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isStaff, error: staffError } = await adminClient.rpc("is_company_staff", {
      _user_id: callerId,
      _company_id: student.company_id,
    });
    if (staffError) {
      return new Response(JSON.stringify({ error: "Unable to validate company access" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (isStaff !== true) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const identity = await getLinkedStudentAccount(adminClient, student);
    if (identity) {
      return new Response(JSON.stringify({ error: "Student already has access", user_id: student.user_id }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!student.email) {
      return new Response(JSON.stringify({ error: "Student has no email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user with a temporary password (student will reset via email)
    const tempPassword = crypto.randomUUID().slice(0, 12) + "Aa1!";

    const userId = await createStudentAccount(adminClient, student, tempPassword);

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: userId,
      temp_password: tempPassword,
      message: "Student access activated. Temporary password generated."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof HttpError ? err.message : "Nao foi possivel liberar o acesso do aluno" }), {
      status: err instanceof HttpError ? err.status : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) Deno.serve(handleActivateStudentAccess);
