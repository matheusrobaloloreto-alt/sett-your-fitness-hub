import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type StaffPermission = "company_dashboard_full";

export function useStaffPermission(permission: StaffPermission) {
  const { user, role, companyId, loading: authLoading } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (authLoading) return;
    if (!user || !companyId) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    if (role === "admin" || role === "master") {
      setEnabled(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc("has_staff_permission" as any, {
      _company_id: companyId,
      _permission: permission,
    });
    setEnabled(!error && data === true);
    setLoading(false);
  }, [authLoading, companyId, permission, role, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("focus", refreshWhenActive);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("focus", refreshWhenActive);
    };
  }, [reload]);

  return { enabled, loading, reload };
}
