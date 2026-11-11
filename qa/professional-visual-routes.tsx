// Real panel route tree from src/App.tsx at HEAD 36965c7. Only backend data is fictitious.
// Keep guards and actual pages; never substitute styled clones for visual QA.
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "../src/components/AppLayout";
import { ProtectedRoute } from "../src/components/ProtectedRoute";
import { FeatureRoute } from "../src/components/FeatureRoute";
import { WhatsAppChatRoute } from "../src/components/WhatsAppChatRoute";
const AdminDashboard = lazy(() => import("../src/pages/admin/AdminDashboard"));
const PlansManager = lazy(() => import("../src/pages/admin/PlansManager"));
const Portfolio = lazy(() => import("../src/pages/admin/Portfolio"));
const TeamManager = lazy(() => import("../src/pages/admin/TeamManager"));
const StudentsManager = lazy(() => import("../src/pages/admin/StudentsManager"));
const StudentDetail = lazy(() => import("../src/pages/admin/StudentDetail"));
const RegistrationManager = lazy(() => import("../src/pages/admin/RegistrationManager"));
const AnamnesisManager = lazy(() => import("../src/pages/admin/AnamnesisManager"));
const AdminAgenda = lazy(() => import("../src/pages/admin/AdminAgenda"));
const FinancialDashboard = lazy(() => import("../src/pages/admin/FinancialDashboard"));
const WhatsAppSettings = lazy(() => import("../src/pages/admin/WhatsAppSettings"));
const ConnectionSettings = lazy(() => import("../src/pages/admin/ConnectionSettings"));
const WhatsAppAutomation = lazy(() => import("../src/pages/admin/WhatsAppAutomation"));
const WhatsAppTemplates = lazy(() => import("../src/pages/admin/WhatsAppTemplates"));
const AppearanceSettings = lazy(() => import("../src/pages/admin/AppearanceSettings"));
const ProductSettings = lazy(() => import("../src/pages/admin/ProductSettings"));
const ExerciseLibrary = lazy(() => import("../src/pages/admin/ExerciseLibrary"));
const WorkoutBuilder = lazy(() => import("../src/pages/admin/WorkoutBuilder"));
const WorkoutLibrary = lazy(() => import("../src/pages/admin/WorkoutLibrary"));
const Biblioteca = lazy(() => import("../src/pages/admin/Biblioteca"));
const WorkoutPrescriptions = lazy(() => import("../src/pages/admin/WorkoutPrescriptions"));
const Announcements = lazy(() => import("../src/pages/admin/Announcements"));
const UnifiedPrescriber = lazy(() => import("../src/pages/admin/UnifiedPrescriber"));
const PrescriptionStudio = lazy(() => import("../src/pages/admin/PrescriptionStudio"));
const FunctionalAssessment = lazy(() => import("../src/pages/admin/FunctionalAssessment"));
const CompanyOnboarding = lazy(() => import("../src/components/admin/CompanyOnboarding"));
const StudentHub = lazy(() => import("../src/pages/admin/StudentHub"));
const Evasao = lazy(() => import("../src/pages/admin/Evasao"));
const CoordinatorDashboard = lazy(() => import("../src/pages/coordinator/CoordinatorDashboard"));
const TrainerDashboard = lazy(() => import("../src/pages/trainer/TrainerDashboard"));
const MasterDashboard = lazy(() => import("../src/pages/master/MasterDashboard"));
const CompaniesManager = lazy(() => import("../src/pages/master/CompaniesManager"));
const MasterAds = lazy(() => import("../src/pages/master/MasterAds"));
const MasterAccount = lazy(() => import("../src/pages/master/MasterAccount"));
const MasterBnContent = lazy(() => import("../src/pages/master/MasterBnContent"));
const PlatformProductSettings = lazy(() => import("../src/pages/master/PlatformProductSettings"));
const CompanyGovernance = lazy(() => import("../src/pages/admin/CompanyGovernance"));
const OperationsWorkspace = lazy(() => import("../src/pages/admin/OperationsWorkspace"));
const PlatformContentManager = lazy(() => import("../src/pages/master/PlatformContentManager"));
const CompanySupportConsole = lazy(() => import("../src/pages/CompanySupportConsole"));

export function ProfessionalVisualRoutes() {
 return <Suspense fallback={<div>Carregando página real...</div>}><Routes>
          <Route element={<AppLayout />}>
          <Route path="/suporte" element={<ProtectedRoute allowedRoles={["admin", "coordinator", "trainer", "master"]}><CompanySupportConsole /></ProtectedRoute>} />
          {/* Master Routes */}
          <Route path="/master" element={<ProtectedRoute allowedRoles={["master"]}><MasterDashboard /></ProtectedRoute>} />
          <Route path="/master/companies" element={<ProtectedRoute allowedRoles={["master"]}><CompaniesManager /></ProtectedRoute>} />
          <Route path="/master/ads" element={<ProtectedRoute allowedRoles={["master"]}><MasterAds /></ProtectedRoute>} />
          <Route path="/master/account" element={<ProtectedRoute allowedRoles={["master"]}><MasterAccount /></ProtectedRoute>} />
          <Route path="/master/settings" element={<ProtectedRoute allowedRoles={["master"]}><PlatformProductSettings /></ProtectedRoute>} />
          <Route path="/master/content" element={<ProtectedRoute allowedRoles={["master"]}><PlatformContentManager /></ProtectedRoute>} />
          <Route path="/master/bn-content" element={<ProtectedRoute allowedRoles={["master"]}><MasterBnContent /></ProtectedRoute>} />
          <Route path="/master/exercises" element={<ProtectedRoute allowedRoles={["master"]}><ExerciseLibrary /></ProtectedRoute>} />
          <Route path="/master/biblioteca" element={<ProtectedRoute allowedRoles={["master"]}><Biblioteca /></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["admin"]}><ProductSettings /></ProtectedRoute>} />
          <Route path="/admin/governance" element={<ProtectedRoute allowedRoles={["admin"]}><CompanyGovernance /></ProtectedRoute>} />
          <Route path="/admin/operations" element={<ProtectedRoute allowedRoles={["admin"]}><OperationsWorkspace /></ProtectedRoute>} />
          <Route path="/admin" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasDashboard"><AdminDashboard /></FeatureRoute>} />
          <Route path="/admin/registration" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasRegistration"><RegistrationManager /></FeatureRoute>} />
          <Route path="/admin/anamnesis" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasAnamnesis"><AnamnesisManager /></FeatureRoute>} />
          <Route path="/admin/questionarios" element={<Navigate to="/admin/registration" replace />} />
          <Route path="/admin/plans" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasPlans"><PlansManager /></FeatureRoute>} />
          <Route path="/admin/team" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasTeam"><TeamManager /></FeatureRoute>} />
          <Route path="/admin/students" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasStudents"><StudentsManager /></FeatureRoute>} />
          <Route path="/admin/carteira" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasStudents"><Portfolio /></FeatureRoute>} />
          <Route path="/admin/students/:id" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasStudents"><StudentDetail /></FeatureRoute>} />
          <Route path="/admin/agenda" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasAgenda"><AdminAgenda /></FeatureRoute>} />
          <Route path="/admin/financial" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasFinancial"><FinancialDashboard /></FeatureRoute>} />
          <Route path="/admin/whatsapp" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasWhatsApp"><WhatsAppSettings /></FeatureRoute>} />
          <Route path="/admin/whatsapp-chat" element={<FeatureRoute allowedRoles={["admin"]} requiredFeature="hasWhatsApp"><WhatsAppChatRoute fallbackPath="/admin" /></FeatureRoute>} />
          <Route path="/admin/whatsapp-crm" element={<Navigate to="/admin/whatsapp-chat" replace />} />
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
          <Route path="/coordinator/questionarios" element={<Navigate to="/coordinator/registration" replace />} />
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
          <Route path="/coordinator/settings" element={<ProtectedRoute allowedRoles={["coordinator"]}><ConnectionSettings /></ProtectedRoute>} />
          <Route path="/coordinator/whatsapp" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasWhatsApp" requiredModule="whatsapp"><WhatsAppSettings /></FeatureRoute>} />
          <Route path="/coordinator/whatsapp-chat" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasWhatsApp" requiredModule="whatsapp"><WhatsAppChatRoute fallbackPath="/coordinator" /></FeatureRoute>} />
          <Route path="/coordinator/whatsapp-crm" element={<Navigate to="/coordinator/whatsapp-chat" replace />} />
          <Route path="/coordinator/whatsapp-templates" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasWhatsApp" requiredModule="whatsapp"><WhatsAppTemplates /></FeatureRoute>} />
          <Route path="/coordinator/whatsapp-automation" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasAutomation" requiredModule="whatsapp"><WhatsAppAutomation /></FeatureRoute>} />

          {/* Trainer Routes */}
          <Route path="/trainer" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasDashboard"><TrainerDashboard /></FeatureRoute>} />
          <Route path="/trainer/registration" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasRegistration"><RegistrationManager /></FeatureRoute>} />
          <Route path="/trainer/anamnesis" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAnamnesis"><AnamnesisManager /></FeatureRoute>} />
          <Route path="/trainer/questionarios" element={<Navigate to="/trainer/registration" replace />} />
          <Route path="/trainer/plans" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasPlans" requiredModule="plans"><PlansManager /></FeatureRoute>} />
          <Route path="/trainer/team" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasTeam" requiredModule="team"><TeamManager /></FeatureRoute>} />
          <Route path="/trainer/students" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasStudents" requiredModule="students"><StudentsManager /></FeatureRoute>} />
          <Route path="/trainer/carteira" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasStudents" requiredModule="students"><Portfolio /></FeatureRoute>} />
          <Route path="/trainer/students/:id" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasStudents" requiredModule="students"><StudentDetail /></FeatureRoute>} />
          <Route path="/trainer/agenda" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAgenda" requiredModule="agenda"><AdminAgenda /></FeatureRoute>} />
          <Route path="/trainer/financial" element={<Navigate to="/trainer" replace />} />
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
          <Route path="/trainer/settings" element={<ProtectedRoute allowedRoles={["trainer"]}><ConnectionSettings /></ProtectedRoute>} />
          <Route path="/trainer/whatsapp" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasWhatsApp" requiredModule="whatsapp"><WhatsAppSettings /></FeatureRoute>} />
          <Route path="/trainer/whatsapp-chat" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasWhatsApp" requiredModule="whatsapp"><WhatsAppChatRoute fallbackPath="/trainer" /></FeatureRoute>} />
          <Route path="/trainer/whatsapp-crm" element={<Navigate to="/trainer/whatsapp-chat" replace />} />
          <Route path="/trainer/whatsapp-templates" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasWhatsApp" requiredModule="whatsapp"><WhatsAppTemplates /></FeatureRoute>} />
          <Route path="/trainer/whatsapp-automation" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasAutomation" requiredModule="whatsapp"><WhatsAppAutomation /></FeatureRoute>} />
          </Route>

<Route path="*" element={<div role="alert">Rota ausente na fixture visual</div>} />
</Routes></Suspense>;
}
