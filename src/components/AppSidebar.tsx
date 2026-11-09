import {
  LayoutDashboard,
  Briefcase,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  UserPlus,
  FileText,
  CalendarDays,
  DollarSign,
  Palette,
  ChevronDown,
  Zap,
  Building2,
  Dumbbell,
  ArrowLeft,
  BookOpen,
  Megaphone,
  BrainCircuit,
  KeyRound,
  Images,


} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyFeatures } from "@/hooks/useCompanyFeatures";
import { useRolePermissions, type PermissionModule } from "@/hooks/useRolePermissions";
import { useTheme } from "@/contexts/ThemeContext";
import { useMaster } from "@/contexts/MasterContext";
import { useLocation, useNavigate } from "react-router-dom";
import bnMark from "@/assets/bn-mark-transparent.png";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Logo } from "@/components/Logo";
import { runWithSettingsExitConfirmation } from "@/lib/settingsDraftProtection";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useWhatsAppChatPanel } from "@/components/WhatsAppChatPanelContext";
import { useEffect, useState } from "react";

// Map sidebar items to permission modules
const moduleMap: Record<string, PermissionModule> = {
  "Dashboard": "dashboard",
  "Carteira": "students",
  "Cadastro": "registration",
  "Anamnese": "anamnesis",
  "Interessados": "registration",
  "Alunos": "students",
  "Agenda": "agenda",
  "Exercícios": "exercises",
  "Planos": "plans",
  "Financeiro": "financial",
  "Aparência": "appearance",
  "Equipe": "team",
};

const masterItems = [
  { title: "Dashboard", url: "/master", icon: LayoutDashboard },
  { title: "Empresas", url: "/master/companies", icon: Building2 },
  { title: "Anúncios", url: "/master/ads", icon: Megaphone },
  { title: "Biblioteca", url: "/master/biblioteca", icon: Dumbbell },
  { title: "BN Content", url: "/master/bn-content", icon: Images },
  { title: "Configurações", url: "/master/settings", icon: Settings },
  { title: "Conteúdo e padrões", url: "/master/content", icon: FileText },
  { title: "Minha Conta", url: "/master/account", icon: KeyRound },
];

const baseAdminItems: typeof managementItems = [
  { title: "Configurações", url: "/admin/settings", icon: Settings },
];

const managementItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Carteira", url: "/admin/carteira", icon: Briefcase },
  { title: "Interessados", url: "/admin/registration", icon: UserPlus },
  { title: "Planos", url: "/admin/plans", icon: ClipboardList },
  { title: "Alunos", url: "/admin/students", icon: Users },
  { title: "Equipe", url: "/admin/team", icon: Users },
  { title: "Agenda", url: "/admin/agenda", icon: CalendarDays },
  { title: "Aparência", url: "/admin/appearance", icon: Palette },
  { title: "Mural", url: "/admin/announcements", icon: Megaphone },
];


const financialItem = { title: "Financeiro", url: "/admin/financial", icon: DollarSign };

const whatsappSubItems = [
  { title: "Conversas", url: "/admin/whatsapp-chat", icon: WhatsAppIcon },
  { title: "Templates", url: "/admin/whatsapp-templates", icon: FileText },
  { title: "Automação", url: "/admin/whatsapp-automation", icon: Zap },
];

const coordinatorAllItems = [
  { title: "Dashboard", url: "/coordinator", icon: LayoutDashboard },
  { title: "Carteira", url: "/coordinator/carteira", icon: Briefcase },
  { title: "Interessados", url: "/coordinator/registration", icon: UserPlus },
  { title: "Planos", url: "/coordinator/plans", icon: ClipboardList },
  { title: "Alunos", url: "/coordinator/students", icon: Users },
  { title: "Equipe", url: "/coordinator/team", icon: Users },
  { title: "Agenda", url: "/coordinator/agenda", icon: CalendarDays },
  { title: "Financeiro", url: "/coordinator/financial", icon: DollarSign },
  { title: "Aparência", url: "/coordinator/appearance", icon: Palette },
];

const coordinatorWhatsappSubItems = [
  { title: "Conversas", url: "/coordinator/whatsapp-chat", icon: WhatsAppIcon },
  { title: "Templates", url: "/coordinator/whatsapp-templates", icon: FileText },
  { title: "Automação", url: "/coordinator/whatsapp-automation", icon: Zap },
];

const trainerWhatsappSubItems = [
  { title: "Conversas", url: "/trainer/whatsapp-chat", icon: WhatsAppIcon },
  { title: "Templates", url: "/trainer/whatsapp-templates", icon: FileText },
  { title: "Automação", url: "/trainer/whatsapp-automation", icon: Zap },
];

const trainerAllItems = [
  { title: "Dashboard", url: "/trainer", icon: LayoutDashboard },
  { title: "Carteira", url: "/trainer/carteira", icon: Briefcase },
  { title: "Interessados", url: "/trainer/registration", icon: UserPlus },
  { title: "Anamnese", url: "/trainer/anamnesis", icon: FileText },
  { title: "Planos", url: "/trainer/plans", icon: ClipboardList },
  { title: "Alunos", url: "/trainer/students", icon: Users },
  { title: "Equipe", url: "/trainer/team", icon: Users },
  { title: "Agenda", url: "/trainer/agenda", icon: CalendarDays },
  { title: "Aparência", url: "/trainer/appearance", icon: Palette },
];

const trainerAlwaysAvailableModules = new Set<PermissionModule>([
  "registration",
  "anamnesis",
  "appearance",
]);

export function AppSidebar({ linen = false }: { linen?: boolean }) {
  const { role, signOut, user, companyId } = useAuth();
  const features = useCompanyFeatures();
  const { canAccess } = useRolePermissions();
  const { settings } = useTheme();
  const { viewingCompany, isViewingCompany, exitCompanyView } = useMaster();
  const location = useLocation();
  const navigate = useNavigate();
  const { openChatPanel } = useWhatsAppChatPanel();
  const prefersReducedMotion = useReducedMotion();
  const isBn = (isViewingCompany ? viewingCompany?.id : companyId) === "dad65c62-e700-4ae9-930a-43b18357c171"
    || (isViewingCompany && viewingCompany?.slug === "bn-performance-training")
    || /^bn performance training$/i.test(settings?.platform_title?.trim() ?? "");
  const title = settings?.platform_title || "Set Training App";
  const [customLogoFailed, setCustomLogoFailed] = useState(false);

  useEffect(() => {
    setCustomLogoFailed(false);
  }, [settings?.logo_url]);

  const isMaster = role === "master";
  const isAdmin = role === "admin";
  const isCoordinator = role === "coordinator";
  const isTrainer = role === "trainer";
  
  const showAdminView = isMaster && isViewingCompany;

  // Build admin items dynamically based on tier features
  const adminItems = (() => {
    const items = [...baseAdminItems];
    if (features.hasDashboard || showAdminView) {
      items.unshift(...managementItems);
    }
    if (features.hasFinancial || showAdminView) {
      items.push(financialItem);
    }
    return items;
  })();

  // For coordinator/trainer, filter items by permission
  const filterByPermission = (items: typeof coordinatorAllItems) => {
    return items.filter((item) => {
      const mod = moduleMap[item.title];
      if (!mod) return true; // If no mapping, show it
      if (isTrainer && trainerAlwaysAvailableModules.has(mod)) return true;
      return canAccess(mod);
    });
  };

  const staffSettingsItems = isCoordinator || isTrainer
    ? [{ title: "Configurações", url: `/${role}/settings`, icon: Settings }]
    : [];

  const items = showAdminView
    ? adminItems
    : isMaster
      ? masterItems
      : isAdmin
        ? adminItems
        : isCoordinator
          ? [...filterByPermission(coordinatorAllItems), ...staffSettingsItems]
          : isTrainer
            ? [...filterByPermission(trainerAllItems), ...staffSettingsItems]
            : [];

  const isWhatsAppActive = location.pathname.includes("/whatsapp");
  const isExercisesActive = location.pathname.includes("/exercises") || location.pathname.includes("/prescriptions") || location.pathname.includes("/workout/") || location.pathname.includes("/prescricao") || location.pathname.includes("/studio") || location.pathname.includes("/avaliacao") || location.pathname.includes("/ia");
  
  // Determine exercise menu prefix
  const exercisePrefix = showAdminView ? "/admin" : `/${role}`;
  const showExercises = !isMaster || isViewingCompany; // Don't show collapsible for pure master view
  const canAccessExercises = isAdmin || showAdminView || (isCoordinator && canAccess("exercises")) || (isTrainer && canAccess("exercises"));

  const showWhatsApp = ((isAdmin || showAdminView) && (features.hasWhatsApp || showAdminView))
    || (isCoordinator && features.hasWhatsApp && canAccess("whatsapp"))
    || (isTrainer && features.hasWhatsApp && canAccess("whatsapp"));
  const activeWhatsappItems = isCoordinator
    ? coordinatorWhatsappSubItems
    : isTrainer
      ? trainerWhatsappSubItems
      : whatsappSubItems;

  const handleExitCompanyView = () => {
    runWithSettingsExitConfirmation(() => {
      exitCompanyView();
      navigate("/master");
    });
  };

  const roleLabel = showAdminView 
    ? `Visualizando: ${viewingCompany?.name}` 
    : isMaster 
      ? "Master" 
      : role || "...";

  return (
    <>
    <Sidebar className={linen ? "sett-linen-sidebar" : "border-r border-line"}
      variant={linen ? "floating" : "sidebar"} collapsible={linen ? "icon" : "offcanvas"} linen={linen}>
      <div className="sett-sidebar-brand p-5 flex items-center gap-3 border-b border-line">
        <div className="flex-1 min-w-0 flex items-center">
          {linen && isBn ? (
            <img src={bnMark} alt="BN Performance Training" className="h-12 w-12 shrink-0 object-contain" draggable={false} />
          ) : settings?.logo_url && !customLogoFailed ? (
            <img
              key={settings.logo_url}
              src={settings.logo_url}
              alt={title}
              className="h-12 max-w-[160px] w-auto object-contain select-none"
              draggable={false}
              onError={() => setCustomLogoFailed(true)}
            />
          ) : (
            <Logo size="md" sublabel={roleLabel} />
          )}
        </div>
        {linen && <SidebarTrigger className="sett-linen-sidebar-toggle shrink-0" aria-label="Recolher ou abrir menu lateral" />}
        {showAdminView && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExitCompanyView}
            className="shrink-0 h-7 w-7"
            title="Voltar ao painel Master"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.2em] px-3 mt-2">
            — Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isRoot = item.url.split("/").length <= 2;
                const isActive = isRoot
                  ? location.pathname === item.url
                  : location.pathname === item.url.split("?")[0] || location.pathname.startsWith(item.url.split("?")[0] + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={linen ? item.title : undefined}>
                      <NavLink
                        to={item.url}
                        end={isRoot}
                        className="relative hover:bg-paper/60 text-sidebar-foreground rounded-none overflow-hidden"
                        activeClassName="text-navy font-medium"
                      >
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active"
                            aria-hidden="true"
                            className="absolute inset-0 bg-navy/[0.07] border-l-2 border-navy -z-0"
                            transition={
                              prefersReducedMotion
                                ? { duration: 0 }
                                : { type: "spring", stiffness: 500, damping: 40, mass: 0.6 }
                            }
                          />
                        )}
                        <item.icon className="mr-2 h-4 w-4 relative z-10" />
                        <span className="sett-sidebar-label relative z-10">{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}


              {/* Exercícios collapsible */}
              {showExercises && canAccessExercises && (
                <Collapsible defaultOpen={isExercisesActive} className="group/exercises">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="w-full">
                        <Dumbbell className="mr-2 h-4 w-4" />
                        <span className="flex-1 text-left">Exercícios</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]/exercises:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location.pathname.endsWith("/biblioteca") || location.pathname.endsWith("/exercises") || location.pathname.endsWith("/biblioteca-treinos")}>
                            <NavLink to={`${exercisePrefix}/biblioteca`} end>
                              <BookOpen className="h-4 w-4" />
                              <span>Biblioteca</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location.pathname === `${exercisePrefix}/ia`}>
                            <NavLink to={`${exercisePrefix}/ia`} end>
                              <BrainCircuit className="h-4 w-4" />
                              <span>Central de IA</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}


              {showWhatsApp && activeWhatsappItems.length > 0 && (
                <Collapsible defaultOpen={isWhatsAppActive} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="w-full">
                        <WhatsAppIcon className="mr-2 h-4 w-4" />
                        <span className="flex-1 text-left">WhatsApp</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {activeWhatsappItems.map((item) => (
                          <SidebarMenuSubItem key={item.title}>
                            {item.title === "Conversas" ? (
                              <SidebarMenuSubButton
                                asChild
                                isActive={location.pathname.includes("/whatsapp-chat")}
                              >
                                <button type="button" onClick={() => openChatPanel()}>
                                  <item.icon className="h-4 w-4" />
                                  <span>{item.title}</span>
                                </button>
                              </SidebarMenuSubButton>
                            ) : (
                              <SidebarMenuSubButton asChild isActive={location.pathname === item.url}>
                                <NavLink to={item.url} end>
                                  <item.icon className="h-4 w-4" />
                                  <span>{item.title}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            )}
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-line p-4">
        <p className="text-[10px] font-mono text-muted-foreground truncate mb-2">
          {user?.email}
        </p>
        <button
          onClick={() => runWithSettingsExitConfirmation(() => { void signOut(); })}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </SidebarFooter>
    </Sidebar>
    {linen && <LinenMobileNav items={items} />}
    </>
  );
}

function LinenMobileNav({ items }: { items: typeof managementItems }) {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  const { isAvailable, openChatPanel, isChatPanelOpen } = useWhatsAppChatPanel();
  const reducedMotion = useReducedMotion();
  if (!isMobile) return null;

  const shortcut = (title: string, label = title) => {
    const item = items.find(item => item.title === title);
    return item && (
      <NavLink to={item.url} end={title === "Dashboard"} activeClassName="sett-dock-active">
        <item.icon aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    );
  };
  const press = reducedMotion ? undefined : { scale: 0.95 };
  const spring = { type: "spring", mass: 1, stiffness: 310, damping: 31 } as const;

  return (
    <nav className="sett-linen-dock" aria-label="Navegação rápida">
      {shortcut("Dashboard", "Painel")}
      {shortcut("Alunos")}
      {shortcut("Agenda")}
      {isAvailable && (
        <motion.button type="button" onClick={() => openChatPanel()} aria-expanded={isChatPanelOpen}
          aria-haspopup="dialog" whileTap={press} transition={spring}>
          <WhatsAppIcon />
          <span>Conversas</span>
        </motion.button>
      )}
      <motion.button type="button" onClick={toggleSidebar} aria-expanded={openMobile}
        whileTap={press} transition={spring}>
        <Settings aria-hidden="true" />
        <span>Menu</span>
      </motion.button>
    </nav>
  );
}
