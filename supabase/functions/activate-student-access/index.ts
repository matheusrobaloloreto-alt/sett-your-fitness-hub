import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
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
    if (claimsError || !claimsData?.claims) {
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
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const roles = callerRoles?.map((r: any) => r.role) || [];
    if (!roles.some((r: string) => ["admin", "master", "coordinator", "trainer"].includes(r))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { student_id } = await req.json();
    if (!student_id) {
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

    if (student.user_id) {
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

    let userId: string;
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: student.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: student.full_name },
    });

    if (createError) {
      console.error("createUser error", createError);
      if (createError.message?.includes("already been registered") || createError.message?.includes("already registered")) {
        const { data: { users } } = await adminClient.auth.admin.listUsers();
        const existingUser = users?.find((u: any) => u.email === student.email);
        if (!existingUser) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = existingUser.id;
      } else {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      userId = newUser.user.id;
    }

    // Assign student role
    const { error: roleError } = await adminClient
      .from("user_roles")
      .upsert({ user_id: userId, role: "student" }, { onConflict: "user_id,role" });
    if (roleError) console.error("user_roles upsert error", roleError);

    // Link student record to user
    const { error: linkError } = await adminClient
      .from("students")
      .update({ user_id: userId })
      .eq("id", student_id);
    if (linkError) console.error("students update error", linkError);

    // Add to company_members if student has company_id
    if (student.company_id) {
      const { error: cmError } = await adminClient
        .from("company_members")
        .upsert(
          { user_id: userId, company_id: student.company_id },
          { onConflict: "user_id" }
        );
      if (cmError) console.error("company_members upsert error", cmError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: userId,
      temp_password: tempPassword,
      message: "Student access activated. Temporary password generated."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("activate-student-access fatal", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
