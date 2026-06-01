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

    // Verify caller identity using getClaims
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await anonClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;

    // Check caller has admin or master role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const roles = callerRoles?.map((r: any) => r.role) || [];
    if (!roles.includes("admin") && !roles.includes("master")) {
      return new Response(JSON.stringify({ error: "Forbidden: admin or master role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    const isMaster = roles.includes("master");
    const isAdmin = roles.includes("admin");

    // Resolve caller's company once. Admins are ALWAYS scoped to their own company —
    // body.company_id is ignored for admins. Only master may target another company.
    const { data: callerCompany } = await adminClient
      .from("company_members")
      .select("company_id")
      .eq("user_id", callerId)
      .limit(1)
      .maybeSingle();

    const callerCompanyId: string | null = callerCompany?.company_id ?? null;

    const resolveTargetCompanyId = (requestCompanyId?: string | null): string | null => {
      if (isMaster) return requestCompanyId ?? callerCompanyId ?? null;
      // admin (or any non-master): always their own company, never trust body
      return callerCompanyId;
    };

    // Helper: ensure a target user belongs to the caller's company (admins only).
    // Master bypasses. Returns true if allowed.
    const assertSameCompany = async (targetUserId: string): Promise<boolean> => {
      if (isMaster) return true;
      if (!callerCompanyId) return false;
      const { data: m } = await adminClient
        .from("company_members")
        .select("company_id")
        .eq("user_id", targetUserId)
        .eq("company_id", callerCompanyId)
        .maybeSingle();
      return !!m;
    };

    if (action === "create") {
      const { full_name, email, password, role, company_id: requestCompanyId } = body;

      if (!full_name || !email || !password || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const validRoles = ["admin", "coordinator", "trainer"];
      if (!validRoles.includes(role)) {
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try to create user
      let userId: string;
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        // If user already exists, find them and update instead
        if (createError.message.includes("already been registered")) {
          const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
          if (listError) {
            return new Response(JSON.stringify({ error: listError.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const existingUser = users.find((u: any) => u.email === email);
          if (!existingUser) {
            return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          userId = existingUser.id;

          // Update password and metadata
          await adminClient.auth.admin.updateUserById(userId, {
            password,
            user_metadata: { full_name },
          });
        } else {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        userId = newUser.user.id;
      }

      // Assign role (upsert to avoid duplicates)
      const { error: roleError } = await adminClient
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });

      if (roleError) {
        return new Response(JSON.stringify({ error: roleError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Resolve target company: admins forced to their own company; master may pass one.
      const targetCompanyId = resolveTargetCompanyId(requestCompanyId);

      if (!targetCompanyId) {
        return new Response(JSON.stringify({ error: "Não foi possível determinar a empresa de destino" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: memberError } = await adminClient
        .from("company_members")
        .upsert(
          { user_id: userId, company_id: targetCompanyId },
          { onConflict: "user_id" }
        );
      if (memberError) {
        console.error("company_members upsert error:", memberError.message);
      }

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-password") {
      const { user_id, new_password } = body;

      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new_password.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(await assertSameCompany(user_id))) {
        return new Response(JSON.stringify({ error: "Forbidden: target user is not in your company" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
        password: new_password,
      });

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-email") {
      const { user_id, email } = body;
      if (!user_id || !email) {
        return new Response(JSON.stringify({ error: "Missing user_id or email" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(await assertSameCompany(user_id))) {
        return new Response(JSON.stringify({ error: "Forbidden: target user is not in your company" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, { email });
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list-emails") {
      const { user_ids } = body;
      if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
        return new Response(JSON.stringify({ error: "Missing user_ids array" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Restrict admins to user_ids inside their own company. Master sees all.
      let allowedUids = user_ids.slice(0, 100) as string[];
      if (!isMaster) {
        if (!callerCompanyId) {
          return new Response(JSON.stringify({ emails: [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: members } = await adminClient
          .from("company_members")
          .select("user_id")
          .eq("company_id", callerCompanyId)
          .in("user_id", allowedUids);
        const allowed = new Set((members ?? []).map((m: any) => m.user_id));
        allowedUids = allowedUids.filter((u) => allowed.has(u));
      }

      const results: { user_id: string; email: string }[] = [];
      for (const uid of allowedUids) {
        const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(uid);
        if (!userError && userData?.user?.email) {
          results.push({ user_id: uid, email: userData.user.email });
        }
      }

      return new Response(JSON.stringify({ emails: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
