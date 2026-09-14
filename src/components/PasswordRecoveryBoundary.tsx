import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function PasswordRecoveryBoundary({ children }: { children: React.ReactNode }) {
  const { passwordRecovery } = useAuth();
  const location = useLocation();
  // Supabase can fall back to SITE_URL if the callback is not allowlisted.
  // Recovery must win over normal role-based redirects, including in that case.
  if (passwordRecovery && location.pathname !== "/auth/reset-password") {
    return <Navigate to={`/auth/reset-password${location.search}${location.hash}`} replace />;
  }
  return <>{children}</>;
}
