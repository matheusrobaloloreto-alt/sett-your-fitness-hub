import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PermissionModule =
  | "dashboard"
  | "registration"
  | "anamnesis"
  | "students"
  | "agenda"
  | "exercises"
  | "financial"
  | "whatsapp"
  | "plans"
  | "appearance"
  | "team";

// Default permissions when no records exist in role_permissions
const DEFAULT_PERMISSIONS: Record<string, PermissionModule[]> = {
  coordinator: ["dashboard", "registration", "anamnesis", "students", "exercises", "agenda"],
  trainer: ["dashboard", "registration", "anamnesis", "students", "exercises", "agenda"],
};

interface RolePermission {
  role: string;
  module: string;
  enabled: boolean;
}

interface UseRolePermissionsReturn {
  canAccess: (module: PermissionModule) => boolean;
  permissions: RolePermission[];
  loading: boolean;
}

export function useRolePermissions(): UseRolePermissionsReturn {
  const { user, role, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setLoading(false);
      return;
    }

    // Admin and master have full access, no need to load permissions
    if (role === "admin" || role === "master") {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      // Fetch all roles for the current user
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = (rolesData || []).map((r) => r.role as string);
      setUserRoles(roles);

      // Fetch permissions for all relevant roles
      const { data: permsData } = await supabase
        .from("role_permissions")
        .select("role, module, enabled");

      setPermissions((permsData as RolePermission[]) || []);
      setLoading(false);
    };

    loadData();

    // Subscribe to realtime changes on role_permissions
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelName = `role_permissions_realtime_${Date.now()}`;
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "role_permissions" },
          () => {
            loadData();
          }
        )
        .subscribe();
    } catch (error) {
      console.error("Failed to subscribe to role permissions realtime:", error);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, role, authLoading]);

  const canAccess = (module: PermissionModule): boolean => {
    // Admin and master always have full access
    if (role === "admin" || role === "master") return true;
    if (!role) return false;

    // Check across ALL user roles (union of permissions)
    const rolesToCheck = userRoles.length > 0 ? userRoles : (role ? [role] : []);

    for (const r of rolesToCheck) {
      // Find explicit permission for this role+module
      const perm = permissions.find(
        (p) => p.role === r && p.module === module
      );

      // If explicit record exists and enabled, grant access
      if (perm !== undefined) {
        if (perm.enabled) return true;
        continue;
      }

      // Otherwise, fall back to defaults for this role
      const defaults = DEFAULT_PERMISSIONS[r];
      if (defaults && defaults.includes(module)) return true;
    }

    return false;
  };

  return { canAccess, permissions, loading };
}

// Separate hook for admin to manage all permissions for the company
export function useManageRolePermissions(companyId: string | null) {
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPermissions = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("role_permissions")
      .select("role, module, enabled")
      .eq("company_id", companyId);
    setPermissions((data as RolePermission[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadPermissions();
  }, [companyId]);

  const togglePermission = async (role: string, module: string, enabled: boolean) => {
    if (!companyId) return;

    const { error } = await supabase
      .from("role_permissions")
      .upsert(
        { company_id: companyId, role, module, enabled },
        { onConflict: "company_id,role,module" }
      );

    if (!error) {
      setPermissions((prev) => {
        const existing = prev.findIndex((p) => p.role === role && p.module === module);
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = { ...copy[existing], enabled };
          return copy;
        }
        return [...prev, { role, module, enabled }];
      });
    }
    return error;
  };

  const isEnabled = (role: string, module: string): boolean => {
    const perm = permissions.find((p) => p.role === role && p.module === module);
    if (perm !== undefined) return perm.enabled;
    // Default
    const defaults = DEFAULT_PERMISSIONS[role];
    return defaults ? defaults.includes(module as PermissionModule) : false;
  };

  return { permissions, loading, togglePermission, isEnabled, reload: loadPermissions };
}

