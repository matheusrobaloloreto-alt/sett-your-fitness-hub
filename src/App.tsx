import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InstallPrompt } from "@/components/InstallPrompt";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { MasterProvider } from "@/contexts/MasterContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeatureRoute } from "@/components/FeatureRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteTransition } from "@/components/RouteTransition";
import { AppLayout } from "@/components/AppLayout";
import { StudentBnitoAssistantProvider } from "@/components/StudentBnitoAssistant";


// Lazy load all pages
const Auth = lazy(() => import("./pages/Auth"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const PlansManager = lazy(() => import("./pages/admin/PlansManager"));
const Portfolio = lazy(() => import("./pages/admin/Portfolio"));
const TeamManager = lazy(() => import("./pages/admin/TeamManager"));
const StudentsManager = lazy(() => import("./pages/admin/StudentsManager"));
const StudentDetail = lazy(() => import("./pages/admin/StudentDetail"));
const RegistrationManager = lazy(() => import("./pages/admin/RegistrationManager"));
const AnamnesisManager = lazy(() => import("./pages/admin/AnamnesisManager"));
const Questionarios = lazy(() => import("./pages/admin/Questionarios"));
const AdminAgenda = lazy(() => import("./pages/admin/AdminAgenda"));
const FinancialDashboard = lazy(() => import("./pages/admin/FinancialDashboard"));
const WhatsAppSettings = lazy(() => import("./pages/admin/WhatsAppSettings"));
const WhatsAppChat = lazy(() => import("./pages/admin/WhatsAppChat"));
const WhatsAppCRM = lazy(() => import("./pages/admin/WhatsAppCRM"));
const WhatsAppAutomation = lazy(() => import("./pages/admin/WhatsAppAutomation"));
const WhatsAppTemplates = lazy(() => import("./pages/admin/WhatsAppTemplates"));
const AppearanceSettings = lazy(() => import("./pages/admin/AppearanceSettings"));
const ExerciseLibrary = lazy(() => import("./pages/admin/ExerciseLibrary"));
const WorkoutBuilder = lazy(() => import("./pages/admin/WorkoutBuilder"));
const WorkoutLibrary = lazy(() => import("./pages/admin/WorkoutLibrary"));
const Biblioteca = lazy(() => import("./pages/admin/Biblioteca"));
const WorkoutPrescriptions = lazy(() => import("./pages/admin/WorkoutPrescriptions"));
const Announcements = lazy(() => import("./pages/admin/Announcements"));
const UnifiedPrescriber = lazy(() => import("./pages/admin/UnifiedPrescriber"));
const PrescriptionStudio = lazy(() => import("./pages/admin/PrescriptionStudio"));
const FunctionalAssessment = lazy(() => import("./pages/admin/FunctionalAssessment"));
const CompanyOnboarding = lazy(() => import("./components/admin/CompanyOnboarding"));
const StudentHub = lazy(() => import("./pages/admin/StudentHub"));
const Evasao = lazy(() => import("./pages/admin/Evasao"));

const CoordinatorDashboard = lazy(() => import("./pages/coordinator/CoordinatorDashboard"));
const TrainerDashboard = lazy(() => import("./pages/trainer/TrainerDashboard"));
const MasterDashboard = lazy(() => import("./pages/master/MasterDashboard"));
const CompaniesManager = lazy(() => import("./pages/master/CompaniesManager"));
const MasterAccount = lazy(() => import("./pages/master/MasterAccount"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PublicRegistration = lazy(() => import("./pages/PublicRegistration"));
const PublicAnamnesis = lazy(() => import("./pages/PublicAnamnesis"));
const StudioAnamnese = lazy(() => import("./pages/StudioAnamnese"));
const PublicPayment = lazy(() => import("./pages/PublicPayment"));
const StudentWorkout = lazy(() => import("./pages/student/StudentWorkout"));
const StudentPortal = lazy(() => import("./pages/student/StudentPortal"));
const Landing = lazy(() => import("./pages/Landing"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background animate-fade-in">
    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);


function RootRoute() {
  const { user, role, loading, signOut } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Landing />;
  if (role === "master") return <Navigate to="/master" replace />;
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "coordinator") return <Navigate to="/coordinator" replace />;
  if (role === "trainer") return <Navigate to="/trainer" replace />;
  if (role === "student") return <Navigate to="/aluno" replace />;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-6">
        <h2 className="font-display text-3xl text-navy italic">Aguardando liberação</h2>
        <p className="text-muted-foreground">
          A conta <span className="font-medium text-foreground">{user.email}</span> ainda não possui um papel atribuído.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-2 inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Sair e entrar com outra conta
        </button>
      </div>
    </div>
  );
}

function StudentWorkoutAccessGuard({ children }: { children: ReactNode }) {
  const { studentId } = useParams<{ studentId: string }>();
  const { user, role, companyId, loading } = useAuth();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let active = true;

    async function verifyAccess() {
      if (loading) {
        setStatus("checking");
        return;
      }
      if (!user || !role || !studentId) {
        setStatus("denied");
        return;
      }

      setStatus("checking");
      const { data, error } = await supabase
        .from("students")
        .select("id, user_id, company_id")
        .eq("id", studentId)
        .maybeSingle();

      if (!active) return;

      if (error || !data) {
        setStatus("denied");
        return;
      }

      const staffRoles = ["admin", "coordinator", "trainer"];
      const canAccess =
        role === "master" ||
        (role === "student" && data.user_id === user.id) ||
        (staffRoles.includes(role) && !!companyId && data.company_id === companyId);

      setStatus(canAccess ? "allowed" : "denied");
    }

    verifyAccess();
    return () => {
      active = false;
    };
  }, [companyId, loading, role, studentId, user]);

  if (loading || status === "checking") return <PageLoader />;
  if (status === "denied") {
    const fallbackByRole: Record<string, string> = {
      admin: "/admin",
      coordinator: "/coordinator",
      trainer: "/trainer",
      master: "/master",
      student: "/aluno",
    };
    return <Navigate to={fallbackByRole[role || ""] || "/"} replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <InstallPrompt />
      <BrowserRouter>
        <AuthProvider>
        <MasterProvider>
        <ThemeProvider>
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
        <StudentBnitoAssistantProvider>
        <Routes>
          <Route path="/auth" element={<RouteTransition><Auth /></RouteTransition>} />
          <Route path="/inscricao/:slug" element={<RouteTransition><PublicRegistration /></RouteTransition>} />
          <Route path="/cadastro/:slug" element={<RouteTransition><PublicRegistration /></RouteTransition>} />
          <Route path="/inscricao" element={<RouteTransition><PublicRegistration /></RouteTransition>} />
          <Route path="/cadastro" element={<RouteTransition><PublicRegistration /></RouteTransition>} />
          <Route path="/cadastro-fiscal/:token" element={<RouteTransition><PublicRegistration /></RouteTransition>} />
          <Route path="/anamnese/:studentId" element={<RouteTransition><PublicAnamnesis /></RouteTransition>} />
          <Route path="/anamnese-convite/:token" element={<RouteTransition><StudioAnamnese /></RouteTransition>} />
          <Route path="/pagamento/:token" element={<RouteTransition><PublicPayment /></RouteTransition>} />
          <Route path="/aluno/treino/:studentId" element={<ProtectedRoute allowedRoles={["student", "admin", "coordinator", "trainer", "master"]}><StudentWorkoutAccessGuard><RouteTransition><StudentWorkout /></RouteTransition></StudentWorkoutAccessGuard></ProtectedRoute>} />
          <Route path="/aluno" element={<ProtectedRoute allowedRoles={["student"]}><RouteTransition><StudentPortal /></RouteTransition></ProtectedRoute>} />
          <Route path="/" element={<RouteTransition><RootRoute /></RouteTransition>} />

          {/* Persistent dashboard shell (sidebar + header) */}
          <Route element={<AppLayout />}>
          {/* Master Routes */}
          <Route path="/master" element={<ProtectedRoute allowedRoles={["master"]}><MasterDashboard /></ProtectedRoute>} />
          <Route path="/master/companies" element={<ProtectedRoute allowedRoles={["master"]}><CompaniesManager /></ProtectedRoute>} />
          <Route path="/master/account" element={<ProtectedRoute allowedRoles={["master"]}><MasterAccount /></ProtectedRoute>} />
          <Route path="/master/exercises" element={<ProtectedRoute allowedRoles={["master"]}><ExerciseLibrary /></ProtectedRoute>} />
          <Route path="/master/biblioteca" element={<ProtectedRoute allowedRoles={["master"]}><Biblioteca /></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route path="/admin" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasDashboard"><AdminDashboard /></FeatureRoute>} />
          <Route path="/admin/registration" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasRegistration"><RegistrationManager /></FeatureRoute>} />
          <Route path="/admin/anamnesis" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasAnamnesis"><AnamnesisManager /></FeatureRoute>} />
          <Route path="/admin/questionarios" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasRegistration"><Questionarios /></FeatureRoute>} />
          <Route path="/admin/plans" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPlans"><PlansManager /></FeatureRoute>} />
          <Route path="/admin/team" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasTeam"><TeamManager /></FeatureRoute>} />
          <Route path="/admin/students" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasStudents"><StudentsManager /></FeatureRoute>} />
          <Route path="/admin/carteira" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasStudents"><Portfolio /></FeatureRoute>} />
          <Route path="/admin/students/:id" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasStudents"><StudentDetail /></FeatureRoute>} />
          <Route path="/admin/agenda" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasAgenda"><AdminAgenda /></FeatureRoute>} />
          <Route path="/admin/financial" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasFinancial"><FinancialDashboard /></FeatureRoute>} />
          <Route path="/admin/whatsapp" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasWhatsApp"><WhatsAppSettings /></FeatureRoute>} />
          <Route path="/admin/whatsapp-chat" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasWhatsApp"><WhatsAppChat /></FeatureRoute>} />
          <Route path="/admin/whatsapp-crm" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasWhatsApp"><WhatsAppCRM /></FeatureRoute>} />
          <Route path="/admin/whatsapp-automation" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasAutomation"><WhatsAppAutomation /></FeatureRoute>} />
          <Route path="/admin/whatsapp-templates" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasWhatsApp"><WhatsAppTemplates /></FeatureRoute>} />
          <Route path="/admin/appearance" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasAppearance"><AppearanceSettings /></FeatureRoute>} />
          <Route path="/admin/exercises" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><ExerciseLibrary /></FeatureRoute>} />
          <Route path="/admin/biblioteca-treinos" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><WorkoutLibrary /></FeatureRoute>} />
          <Route path="/admin/biblioteca" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><Biblioteca /></FeatureRoute>} />
          <Route path="/admin/prescriptions" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><WorkoutPrescriptions /></FeatureRoute>} />
          <Route path="/admin/workout/:cycleId" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><WorkoutBuilder /></FeatureRoute>} />
          <Route path="/admin/prescricao" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><UnifiedPrescriber /></FeatureRoute>} />
          <Route path="/admin/studio" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><PrescriptionStudio /></FeatureRoute>} />
          <Route path="/admin/ia" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><CompanyOnboarding /></FeatureRoute>} />
          <Route path="/admin/avaliacao" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPrescription"><FunctionalAssessment /></FeatureRoute>} />
          <Route path="/admin/aluno/:id" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasStudents"><StudentHub /></FeatureRoute>} />
          <Route path="/admin/evasao" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasStudents"><Evasao /></FeatureRoute>} />
          <Route path="/admin/configuracao-ia" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasDashboard"><CompanyOnboarding /></FeatureRoute>} />
          <Route path="/admin/announcements" element={<ProtectedRoute allowedRoles={["admin"]}><Announcements /></ProtectedRoute>} />
          <Route path="/coordinator/announcements" element={<ProtectedRoute allowedRoles={["coordinator"]}><Announcements /></ProtectedRoute>} />


          {/* Coordinator Routes */}
          <Route path="/coordinator" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasDashboard"><CoordinatorDashboard /></FeatureRoute>} />
          <Route path="/coordinator/registration" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasRegistration" requiredModule="registration"><RegistrationManager /></FeatureRoute>} />
          <Route path="/coordinator/anamnesis" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasAnamnesis" requiredModule="anamnesis"><AnamnesisManager /></FeatureRoute>} />
          <Route path="/coordinator/questionarios" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasRegistration" requiredModule="registration"><Questionarios /></FeatureRoute>} />
          <Route path="/coordinator/plans" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPlans" requiredModule="plans"><PlansManager /></FeatureRoute>} />
          <Route path="/coordinator/team" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasTeam" requiredModule="team"><TeamManager /></FeatureRoute>} />
          <Route path="/coordinator/students" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasStudents" requiredModule="students"><StudentsManager /></FeatureRoute>} />
          <Route path="/coordinator/carteira" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasStudents" requiredModule="students"><Portfolio /></FeatureRoute>} />
          <Route path="/coordinator/students/:id" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasStudents" requiredModule="students"><StudentDetail /></FeatureRoute>} />
          <Route path="/coordinator/agenda" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasAgenda" requiredModule="agenda"><AdminAgenda /></FeatureRoute>} />
          <Route path="/coordinator/financial" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasFinancial" requiredModule="financial"><FinancialDashboard /></FeatureRoute>} />
          <Route path="/coordinator/appearance" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasAppearance" requiredModule="appearance"><AppearanceSettings /></FeatureRoute>} />
          <Route path="/coordinator/exercises" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><ExerciseLibrary /></FeatureRoute>} />
          <Route path="/coordinator/biblioteca-treinos" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><WorkoutLibrary /></FeatureRoute>} />
          <Route path="/coordinator/biblioteca" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><Biblioteca /></FeatureRoute>} />
          <Route path="/coordinator/prescriptions" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><WorkoutPrescriptions /></FeatureRoute>} />
          <Route path="/coordinator/workout/:cycleId" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><WorkoutBuilder /></FeatureRoute>} />
          <Route path="/coordinator/prescricao" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><UnifiedPrescriber /></FeatureRoute>} />
          <Route path="/coordinator/studio" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><PrescriptionStudio /></FeatureRoute>} />
          <Route path="/coordinator/ia" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><CompanyOnboarding /></FeatureRoute>} />
          <Route path="/coordinator/avaliacao" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasPrescription" requiredModule="exercises"><FunctionalAssessment /></FeatureRoute>} />
          <Route path="/coordinator/whatsapp" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasWhatsApp"><WhatsAppSettings /></FeatureRoute>} />
          <Route path="/coordinator/whatsapp-chat" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasWhatsApp"><WhatsAppChat /></FeatureRoute>} />
          <Route path="/coordinator/whatsapp-crm" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasWhatsApp"><WhatsAppCRM /></FeatureRoute>} />
          <Route path="/coordinator/whatsapp-templates" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasWhatsApp"><WhatsAppTemplates /></FeatureRoute>} />
          <Route path="/coordinator/whatsapp-automation" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasAutomation"><WhatsAppAutomation /></FeatureRoute>} />

          {/* Trainer Routes */}
          <Route path="/trainer" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasDashboard"><TrainerDashboard /></FeatureRoute>} />
          <Route path="/trainer/registration" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasRegistration" requiredModule="registration"><RegistrationManager /></FeatureRoute>} />
          <Route path="/trainer/anamnesis" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAnamnesis" requiredModule="anamnesis"><AnamnesisManager /></FeatureRoute>} />
          <Route path="/trainer/questionarios" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasRegistration" requiredModule="registration"><Questionarios /></FeatureRoute>} />
          <Route path="/trainer/plans" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPlans" requiredModule="plans"><PlansManager /></FeatureRoute>} />
          <Route path="/trainer/team" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasTeam" requiredModule="team"><TeamManager /></FeatureRoute>} />
          <Route path="/trainer/students" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasStudents" requiredModule="students"><StudentsManager /></FeatureRoute>} />
          <Route path="/trainer/carteira" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasStudents" requiredModule="students"><Portfolio /></FeatureRoute>} />
          <Route path="/trainer/students/:id" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasStudents" requiredModule="students"><StudentDetail /></FeatureRoute>} />
          <Route path="/trainer/agenda" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAgenda" requiredModule="agenda"><AdminAgenda /></FeatureRoute>} />
          <Route path="/trainer/financial" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasFinancial" requiredModule="financial"><FinancialDashboard /></FeatureRoute>} />
          <Route path="/trainer/appearance" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAppearance" requiredModule="appearance"><AppearanceSettings /></FeatureRoute>} />
          <Route path="/trainer/exercises" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><ExerciseLibrary /></FeatureRoute>} />
          <Route path="/trainer/biblioteca-treinos" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><WorkoutLibrary /></FeatureRoute>} />
          <Route path="/trainer/biblioteca" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><Biblioteca /></FeatureRoute>} />
          <Route path="/trainer/prescriptions" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><WorkoutPrescriptions /></FeatureRoute>} />
          <Route path="/trainer/workout/:cycleId" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><WorkoutBuilder /></FeatureRoute>} />
          <Route path="/trainer/prescricao" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><UnifiedPrescriber /></FeatureRoute>} />
          <Route path="/trainer/studio" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><PrescriptionStudio /></FeatureRoute>} />
          <Route path="/trainer/ia" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><CompanyOnboarding /></FeatureRoute>} />
          <Route path="/trainer/avaliacao" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPrescription" requiredModule="exercises"><FunctionalAssessment /></FeatureRoute>} />
          <Route path="/trainer/whatsapp" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasWhatsApp"><WhatsAppSettings /></FeatureRoute>} />
          <Route path="/trainer/whatsapp-chat" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasWhatsApp"><WhatsAppChat /></FeatureRoute>} />
          <Route path="/trainer/whatsapp-crm" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasWhatsApp"><WhatsAppCRM /></FeatureRoute>} />
          <Route path="/trainer/whatsapp-templates" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasWhatsApp"><WhatsAppTemplates /></FeatureRoute>} />
          <Route path="/trainer/whatsapp-automation" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAutomation"><WhatsAppAutomation /></FeatureRoute>} />
          </Route>

          <Route path="*" element={<RouteTransition><NotFound /></RouteTransition>} />
        </Routes>
        </StudentBnitoAssistantProvider>
        </Suspense>
        </ErrorBoundary>
        </ThemeProvider>
        </MasterProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
