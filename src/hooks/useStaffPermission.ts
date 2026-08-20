import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type StaffPermission = "company_dashboard_full";

export function useStaffPermission(permission: StaffPermission) {
  const { user, role, loading: authLoading } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
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
    const { data, error } = await supabase
      .from("staff_permissions" as any)
      .select("enabled")
      .eq("user_id", user.id)
      .eq("permission", permission)
      .eq("enabled", true)
      .maybeSingle();
    setEnabled(!error && data?.enabled === true);
    setLoading(false);
  }, [authLoading, permission, role, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { enabled, loading, reload };
}
