import { useState, useEffect, createContext, useContext, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "coordinator" | "trainer" | "master" | "student" | null;
const ROLE_PRIORITY: Exclude<AppRole, null>[] = ["master", "admin", "coordinator", "trainer", "student"];

function resolvePrimaryRole(roles: unknown[]): AppRole {
  const roleSet = new Set(roles.filter((value): value is Exclude<AppRole, null> => (
    typeof value === "string" && ROLE_PRIORITY.includes(value as Exclude<AppRole, null>)
  )));

  return ROLE_PRIORITY.find((candidate) => roleSet.has(candidate)) ?? null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole;
  companyId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  companyId: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const roleFetchedFor = useRef<string | null>(null);

  const fetchRoleAndCompany = async (userId: string) => {
    try {
      const [roleRes, companyRes] = await Promise.all([
        supabase.rpc("get_user_role", { _user_id: userId }),
        supabase.from("company_members").select("company_id").eq("user_id", userId).limit(1),
      ]);

      let resolvedRole = (roleRes.data as AppRole) || null;

      if (roleRes.error || !resolvedRole) {
        if (roleRes.error) {
          console.warn("Failed to resolve role via RPC, falling back to user_roles:", roleRes.error.message);
        }

        const fallbackRes = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (fallbackRes.error) {
          console.error("Failed to resolve role from user_roles:", fallbackRes.error.message);
        } else {
          resolvedRole = resolvePrimaryRole((fallbackRes.data || []).map((row) => row.role));
        }
      }

      if (companyRes.error) {
        console.warn("Failed to resolve company membership:", companyRes.error.message);
      }

      setRole(resolvedRole);
      setCompanyId(companyRes.data?.[0]?.company_id || null);
      roleFetchedFor.current = userId;
    } catch (err) {
      console.error("Failed to fetch role/company:", err);
      setRole(null);
      setCompanyId(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchRoleAndCompany(session.user.id), 0);
        } else {
          setRole(null);
          setCompanyId(null);
          roleFetchedFor.current = null;
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoleAndCompany(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setCompanyId(null);
    roleFetchedFor.current = null;
  };

  return (
    <AuthContext.Provider value={{ user, session, role, companyId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
