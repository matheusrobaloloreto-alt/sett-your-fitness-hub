// Presença de colaboradores (roles abaixo de admin): registra ENTRADA ao abrir o app,
// heartbeat a cada 60s e SAÍDA ao fechar o site (pagehide + fetch keepalive).
// Sessões sem ended_at com last_seen antigo são tratadas como encerradas no last_seen (painel).
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const TRACKED_ROLES = new Set(["coordinator", "trainer"]);
const HEARTBEAT_MS = 60_000;

export function useStaffPresence(role: string | null | undefined, companyId: string | null) {
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!role || !companyId || !TRACKED_ROLES.has(role)) return;
    let cancelled = false;
    let heartbeat: number | undefined;

    const patchSession = (sid: string, token: string, patch: Record<string, string>) =>
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/staff_sessions?id=eq.${sid}`, {
        method: "PATCH",
        keepalive: true,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(patch),
      }).catch(() => {});

    const createSession = async (uid: string, token: string) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/staff_sessions`, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ user_id: uid, company_id: companyId, role }),
      });
      if (!response.ok) return null;
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || typeof rows[0]?.id !== "string") return null;
      return rows[0].id;
    };

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getSession();
        const uid = auth.session?.user.id;
        const token = auth.session?.access_token;
        if (!uid || !token || cancelled) return;
        accessTokenRef.current = token || null;
        const sessionId = await createSession(uid, token);
        if (!sessionId) return;
        if (cancelled) {
          const now = new Date().toISOString();
          void patchSession(sessionId, token, { ended_at: now, last_seen_at: now });
          return;
        }
        sessionIdRef.current = sessionId;
        heartbeat = window.setInterval(() => {
          const sid = sessionIdRef.current;
          const accessToken = accessTokenRef.current;
          if (!sid || !accessToken) return;
          void patchSession(sid, accessToken, { last_seen_at: new Date().toISOString() });
        }, HEARTBEAT_MS);
      } catch { /* tabela pode ainda não existir — presença é opcional */ }
    })();

    // Saída: fetch com keepalive sobrevive ao fechamento da aba/site.
    const endSession = () => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      sessionIdRef.current = null;
      const token = accessTokenRef.current;
      if (!token) return;
      const now = new Date().toISOString();
      void patchSession(sid, token, { ended_at: now, last_seen_at: now });
    };

    window.addEventListener("pagehide", endSession);
    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      window.removeEventListener("pagehide", endSession);
      endSession(); // logout/troca de rota-mãe também conta como saída
      accessTokenRef.current = null;
    };
  }, [role, companyId]);
}
