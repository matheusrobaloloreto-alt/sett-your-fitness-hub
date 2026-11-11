import { useLocation } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { PanelStudentSearch } from "@/components/PanelStudentSearch";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyFeatures } from "@/hooks/useCompanyFeatures";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useMaster } from "@/contexts/MasterContext";

export default function PanelHeader({ effectiveCompanyId, linen, assistantName, isWorkoutBuilder }: {
  effectiveCompanyId: string | null | undefined;
  linen: boolean;
  assistantName: string;
  isWorkoutBuilder: boolean;
}) {
  const location = useLocation();
  const { role, user, loading: authLoading, accessLookupFailed } = useAuth();
  const { isViewingCompany, contextLoading, contextError } = useMaster();
  const features = useCompanyFeatures();
  const { canAccess, loading: permissionsLoading, lookupFailed: permissionsLookupFailed } = useRolePermissions(effectiveCompanyId);
  const canSearchStudents = role && user && effectiveCompanyId && !authLoading && !accessLookupFailed
    && !contextLoading && !contextError && !features.loading && !features.error
    && (role === "master" ? isViewingCompany
      : ["admin", "coordinator", "trainer"].includes(role) && features.hasStudents
        && (role === "admin" || (!permissionsLoading && !permissionsLookupFailed && canAccess("students"))));

  return (
    <header className={`sett-panel-header sticky top-0 z-30 h-14 shrink-0 items-center border-b border-line bg-paper md:static ${canSearchStudents
      ? "grid grid-cols-[var(--sett-header-side)_minmax(0,1fr)_var(--sett-header-side)] [--sett-header-side:clamp(3.5rem,17vw,4.25rem)] gap-1 px-2 md:grid-cols-[minmax(7rem,1fr)_minmax(0,2fr)_minmax(7rem,1fr)] md:gap-3 md:px-6"
      : "flex gap-3 px-3 sm:px-6"}`}>
      <div className="flex min-w-0 items-center gap-3">
        {!linen && <SidebarTrigger aria-label="Abrir ou recolher menu lateral" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" />}
        <span className={`whitespace-nowrap font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground ${canSearchStudents ? "hidden lg:inline" : ""}`}>
          Set / Painel
        </span>
      </div>
      {canSearchStudents && (
        <PanelStudentSearch key={location.key}
          companyId={effectiveCompanyId} userId={user.id} role={role} paused={features.refreshing} />
      )}
      {!isWorkoutBuilder && (
        <BnitoContextButton
          label="painel atual"
          context="Ajuda contextual geral da rota atual, considerando permissao, modulo e tarefa em andamento."
          question="Me orienta sobre esta tela e os proximos passos tecnicos?"
          text={assistantName}
          className={canSearchStudents
            ? "col-start-3 row-start-1 ml-auto min-w-0 max-w-full gap-1 px-1.5 md:gap-2 md:px-3 [&>span]:truncate"
            : "ml-auto max-w-[7.5rem] md:max-w-full [&>span]:truncate"}
        />
      )}
    </header>
  );
}
