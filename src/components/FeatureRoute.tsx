import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyFeatures, CompanyFeatures } from "@/hooks/useCompanyFeatures";
import { useRolePermissions, type PermissionModule } from "@/hooks/useRolePermissions";
import { useMaster } from "@/contexts/MasterContext";

type FeatureKey = keyof Omit<CompanyFeatures, "tier" | "loading" | "refreshing" | "error" | "retry" | "canSendWhatsApp" | "waitForWhatsAppValidation">;

interface FeatureRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredFeature?: FeatureKey;
  requiredModule?: PermissionModule;
}

export function FeatureRoute({ children, allowedRoles, requiredFeature, requiredModule }: FeatureRouteProps) {
  const { user, role, loading: authLoading } = useAuth();
  const features = useCompanyFeatures();
  const { canAccess, loading: permLoading } = useRolePermissions();
  const { viewingCompany, contextLoading, contextError } = useMaster();
  const location = useLocation();

  if (authLoading || contextLoading || features.loading || permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const isMaster = role === "master";
  const isViewingCompany = isMaster && !!viewingCompany;
  const isAdminRoute = location.pathname.startsWith("/admin");
  const isCoordinatorRoute = location.pathname.startsWith("/coordinator");
  const isTrainerRoute = location.pathname.startsWith("/trainer");
  const isCompanyScopedRoute = isAdminRoute || isCoordinatorRoute || isTrainerRoute;

  if (isMaster && isAdminRoute && isViewingCompany) {
    return <div className="contents">
    {(features.refreshing || features.error) && <div role="status">{features.error || "Validando acesso…"}{features.error && <button onClick={features.retry}>Tentar novamente</button>}</div>}
    <fieldset {...(features.refreshing || features.error ? { inert: "" } : {})} className="contents" disabled={features.refreshing || !!features.error}>{children}</fieldset>
  </div>;
  }

  // Master accessing a company-scoped route without selecting a company → fallback
  if (isMaster && isCompanyScopedRoute && !isViewingCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-2xl text-primary">
            {contextError ? "Não foi possível validar a empresa" : "Nenhuma empresa selecionada"}
          </h2>
          <p className="text-muted-foreground font-sans">
            {contextError || "Como master, você precisa entrar no contexto de uma empresa para acessar esta área. Volte ao painel master e selecione uma empresa para visualizar."}
          </p>
          <button
            onClick={() => (window.location.href = "/master")}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Ir para o painel master
          </button>
        </div>
      </div>
    );
  }

  // Check role access
  if (allowedRoles && role && !isMaster && !allowedRoles.includes(role)) {
    const dashboardMap: Record<string, string> = {
      admin: "/admin",
      coordinator: "/coordinator",
      trainer: "/trainer",
      master: "/master",
    };
    return <Navigate to={dashboardMap[role] || "/"} replace />;
  }

  if (features.error && requiredFeature && !features[requiredFeature]) {
    return <div role="alert">{features.error}<button onClick={features.retry}>Tentar novamente</button></div>;
  }

  // Check feature access (tier-based, master bypasses)
  if (requiredFeature && !isMaster && !features[requiredFeature]) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md p-6">
          <h2 className="text-2xl text-primary">Recurso não disponível</h2>
          <p className="text-muted-foreground font-sans">
            Este recurso não está incluído no seu plano atual. Entre em contato com o administrador para fazer upgrade.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // Check module permission (role-based, admin/master bypass)
  if (requiredModule && role !== "admin" && !isMaster && !canAccess(requiredModule)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md p-6">
          <h2 className="text-2xl text-primary">Acesso restrito</h2>
          <p className="text-muted-foreground font-sans">
            Você não tem permissão para acessar este módulo. Entre em contato com o administrador.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // If user has no role yet, show waiting state
  if (!role && !authLoading) {
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

  return <div className="contents">
    {(features.refreshing || features.error) && <div role="status">{features.error || "Validando acesso…"}{features.error && <button onClick={features.retry}>Tentar novamente</button>}</div>}
    <fieldset {...(features.refreshing || features.error ? { inert: "" } : {})} className="contents" disabled={features.refreshing || !!features.error}>{children}</fieldset>
  </div>;
}
