import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Master has access to everything
  if (allowedRoles && role && role !== "master" && !allowedRoles.includes(role)) {
    const dashboardMap: Record<string, string> = {
      admin: "/admin",
      coordinator: "/coordinator",
      trainer: "/trainer",
      master: "/master",
      student: "/aluno",
    };
    return <Navigate to={dashboardMap[role] || "/"} replace />;
  }

  // If user has no role yet, show waiting state
  if (!role && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h2 className="text-2xl text-primary">Aguardando liberação</h2>
          <p className="text-muted-foreground font-sans">
            Sua conta ainda não possui um papel atribuído. Aguarde o administrador configurar seu acesso.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
