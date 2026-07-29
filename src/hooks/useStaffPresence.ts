// Presença de colaboradores (roles abaixo de admin): registra ENTRADA ao abrir o app,
// heartbeat a cada 60s e SAÍDA ao fechar o site (pagehide + fetch keepalive).
// Sessões sem ended_at com last_seen antigo são tratadas como encerradas no last_seen (painel).
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const TRACKED_ROLES = new Set(["coordinator", "trainer"]);
const HEARTBEAT_MS = 60_000;

export function useStaffPresence(role: string | null | undefined, companyId: string | null) {
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!role || !TRACKED_ROLES.has(role)) return;
    let cancelled = false;
    let heartbeat: number | undefined;

    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid || cancelled) return;
        const { data } = await (supabase as any)
          .from("staff_sessions")
          .insert({ user_id: uid, company_id: companyId, role })
          .select("id")
          .single();
        if (!data?.id || cancelled) return;
        sessionIdRef.current = data.id;
        heartbeat = window.setInterval(() => {
          const sid = sessionIdRef.current;
          if (!sid) return;
          (supabase as any).from("staff_sessions")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", sid)
            .then(() => {}, () => {});
        }, HEARTBEAT_MS);
      } catch { /* tabela pode ainda não existir — presença é opcional */ }
    })();

    // Saída: fetch com keepalive sobrevive ao fechamento da aba/site.
    const endSession = () => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      sessionIdRef.current = null;
      supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        const now = new Date().toISOString();
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/staff_sessions?id=eq.${sid}`, {
          method: "PATCH",
          keepalive: true,
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ ended_at: now, last_seen_at: now }),
        }).catch(() => {});
      }).catch(() => {});
    };

    window.addEventListener("pagehide", endSession);
    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      window.removeEventListener("pagehide", endSession);
      endSession(); // logout/troca de rota-mãe também conta como saída
    };
  }, [role, companyId]);
}
