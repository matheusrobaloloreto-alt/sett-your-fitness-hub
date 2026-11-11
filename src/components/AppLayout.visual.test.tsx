import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";
import Portfolio from "@/pages/admin/Portfolio";
import { visualStaffDirectory } from "../../qa/professional-visual-data";
import PlansManager from "@/pages/admin/PlansManager";
import MasterDashboard from "@/pages/master/MasterDashboard";
import { applyPlatformTheme } from "@/lib/personalTheme";
import { LINEN_PALETTE } from "@/lib/linenPalette";

const state = vi.hoisted(() => ({
  auth: { role: "admin", companyId: "tenant-a", user: { id: "qa-user" } },
  master: { isViewingCompany: false, viewingCompany: null as null | { id: string }, exitCompanyView: vi.fn() },
  theme: { settings: null as null | Record<string, unknown>, isLoading: false, themeMode: "light" },
  config: vi.fn((..._args: unknown[]) => ({ config: { assistant_name: "Setty" } })),
  presence: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => state.master }));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => state.theme }));
vi.mock("@/lib/companyAiConfig", () => ({ useCompanyAiConfig: (...args: unknown[]) => state.config(...args) }));
vi.mock("@/hooks/useStaffPresence", () => ({ useStaffPresence: (...args: unknown[]) => state.presence(...args) }));
vi.mock("@/components/AthleticClubStar", () => ({ AthleticClubStar: () => null, AthleticClubProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/BnitoFloatingAssistant", () => ({ BnitoContextButton: () => <button>Setty</button>, BnitoAssistantProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/WhatsAppChatPanel", () => ({ WhatsAppChatPanelProvider: ({ children, mobileDock }: { children: ReactNode; mobileDock: boolean }) => <div data-testid="chat-provider" data-mobile-dock={String(mobileDock)}>{children}</div> }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: (props: Record<string, unknown>) => <button {...props} />, SidebarProvider: ({ children, ...props }: { children: ReactNode }) => <div data-testid="sidebar-provider" {...props}>{children}</div> }));
vi.mock("@/components/AppSidebar", () => ({ AppSidebar: ({ linen }: { linen: boolean }) => <aside data-testid="sidebar" data-linen={String(linen)} /> }));
vi.mock("./PanelHeader", () => ({ default: ({ linen, effectiveCompanyId }: { linen: boolean; effectiveCompanyId: string }) => <header data-testid="header" data-linen={String(linen)} data-company={effectiveCompanyId ?? "global"} /> }));
vi.mock("@/components/RouteTransition", () => ({ RouteTransition: ({ children, spring }: { children: ReactNode; spring: boolean }) => <div data-testid="transition" data-spring={String(spring)}>{children}</div> }));
vi.mock("@/components/PlatformAdSlot", () => ({ PlatformAdSlot: ({ placement }: { placement: string }) => <div data-testid={`ad-${placement}`} /> }));
vi.mock("@/lib/companyCommercialSettings", () => ({ DEFAULT_COMPANY_COMMERCIAL_SETTINGS: { influencer: { enabled: false } }, fetchCompanyCommercialSettings: async () => ({ settings: { influencer: { enabled: false } } }) }));
vi.mock("@/lib/platformSettingsClient", () => ({ fetchPublicPlatformCatalog: async () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => state.rpc(...args), from: () => {
  const query = { select: () => query, order: () => query, eq: () => query, range: () => query, in: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
  return query;
} } }));

// Read the actual route inventory so a newly added panel tab automatically gets a shell regression case.
const app = readFileSync("src/App.tsx", "utf8");
const panelRoutes = [...app.matchAll(/<Route path="(\/(?:admin|coordinator|trainer|master)(?:\/[^"]*)?)"/g)]
  .map((match) => ({ path: match[1].replace(":id", "qa-student").replace(":cycleId", "qa-cycle"), role: match[1].split("/")[1] }));
let navigate: ReturnType<typeof useNavigate>;
function NavigationProbe() { navigate = useNavigate(); return null; }
function mount(path: string, child: ReactNode = <span>Outlet marker</span>) {
  return render(<MemoryRouter initialEntries={[path]}><NavigationProbe /><Routes><Route element={<AppLayout />}><Route path="*" element={child} /></Route></Routes></MemoryRouter>);
}
function shell(container: HTMLElement) { return container.querySelector(".min-h-dvh") as HTMLElement; }

beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: [], error: null });
  state.auth.role = "admin";
  state.master.isViewingCompany = false;
  state.master.viewingCompany = null;
  state.theme.settings = null;
  state.theme.isLoading = false;
  state.theme.themeMode = "light";
});
afterEach(() => cleanup());

describe("AppLayout Linho role gate across the real panel route inventory (DOM contracts, not screenshots)", () => {
  it.each(panelRoutes)("$role $path keeps the shared Linho shell", async ({ path, role }) => {
    state.auth.role = role;
    const { container } = mount(path);
    expect(shell(container)).toHaveClass("sett-linen", "sett-effects");
    expect(container.querySelector(".sett-linen-content")).toBeTruthy();
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-linen", "true");
    expect(screen.getByTestId("chat-provider")).toHaveAttribute("data-mobile-dock", "true");
    expect(screen.getByTestId("transition")).toHaveAttribute("data-spring", "true");
    await waitFor(() => expect(screen.getByTestId("header")).toHaveAttribute("data-linen", "true"));
    expect(state.config).toHaveBeenCalledWith(role === "master" ? null : "tenant-a");
  });
  it.each([320, 390, 1440])("keeps the role gate at width %i (layout requires CUA)", async width => {
    vi.stubGlobal("innerWidth", width);
    state.auth.role = "master";
    const { container } = mount("/master/companies");
    expect(shell(container)).toHaveClass("sett-linen", "sett-effects");
    await screen.findByTestId("header");
    vi.unstubAllGlobals();
  });
  it("uses the selected Master tenant without changing the visual gate", async () => {
    state.auth.role = "master";
    state.master.isViewingCompany = true;
    state.master.viewingCompany = { id: "tenant-b" };
    const { container } = mount("/admin/plans");
    expect(shell(container)).toHaveClass("sett-linen", "sett-effects");
    await waitFor(() => expect(screen.getByTestId("header")).toHaveAttribute("data-company", "tenant-b"));
    expect(state.config).toHaveBeenCalledWith("tenant-b");
  });
  it("does not introduce Linho or fallback colors for a student", async () => {
    state.auth.role = "student";
    const { container } = mount("/aluno");
    expect(shell(container)).not.toHaveClass("sett-linen");
    expect(shell(container)).not.toHaveClass("sett-effects");
    expect(shell(container).style.getPropertyValue("--paper")).toBe("");
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-linen", "false");
    expect(screen.getByTestId("transition")).toHaveAttribute("data-spring", "false");
    await screen.findByTestId("header");
  });
  it("survives navigation from dashboard to registration, plans and Master global", async () => {
    const { container } = mount("/admin");
    for (const path of ["/admin/registration", "/admin/plans", "/master/companies", "/master"]) {
      if (path.startsWith("/master")) state.auth.role = "master";
      await act(async () => navigate(path));
      expect(shell(container)).toHaveClass("sett-linen", "sett-effects");
    }
  });
  it.each(["/admin/whatsapp-chat", "/admin/whatsapp-automation"])("preserves no-padding messaging layout at %s", async path => {
    const { container } = mount(path);
    expect(container.querySelector(".sett-linen-content")).not.toHaveClass("p-3");
    expect(screen.queryByTestId("ad-footer")).toBeNull();
    await screen.findByTestId("header");
  });
  it.each(["light", "dark"])("scopes fallback %s palette to the shell, leaving document theme intact", async mode => {
    state.theme.themeMode = mode;
    const rootBefore = document.documentElement.getAttribute("style");
    const { container } = mount("/admin/plans");
    const expected = document.createElement("div");
    applyPlatformTheme(LINEN_PALETTE, mode as "light" | "dark", expected);
    expect(shell(container).style.getPropertyValue("--paper")).toBe(expected.style.getPropertyValue("--paper"));
    expect(document.documentElement.getAttribute("style")).toBe(rootBefore);
    await screen.findByTestId("header");
  });
  it("does not overwrite a configured company palette; forwards configured effects", async () => {
    state.theme.settings = { professional_appearance: { effects: { glass: { enabled: true, intensity: 80 }, softShadows: { enabled: true, intensity: 35 } } } };
    const { container } = mount("/admin/plans");
    expect(shell(container).style.getPropertyValue("--paper")).toBe("");
    const provider = screen.getByTestId("sidebar-provider");
    expect(provider.style.getPropertyValue("--sett-effect-glass")).toBe("0.8");
    expect(provider.style.getPropertyValue("--sett-effect-shadow")).toBe("0.35");
    expect(provider).toHaveAttribute("data-sett-soft-shadows");
    await screen.findByTestId("header");
  });
  it("renders the actual PlansManager in the shared shell with a fictitious backend", async () => {
    state.auth.role = "trainer";
    const { container } = mount("/trainer/plans", <PlansManager />);
    expect(await screen.findByRole("heading", { name: "PLANOS" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Novo Plano/ })).toBeVisible();
    expect(shell(container)).toHaveClass("sett-linen");
  });
  it("renders the actual MasterDashboard globally with a fictitious backend", async () => {
    state.auth.role = "master";
    const { container } = mount("/master", <MasterDashboard />);
    expect(await screen.findByRole("heading", { name: "Painel Master" })).toBeVisible();
    await waitFor(() => expect(screen.getByText("Visão global de todas as instâncias da plataforma.")).toBeVisible());
    expect(shell(container)).toHaveClass("sett-linen", "sett-effects");
  });
});

vi.mock("@/hooks/useCompanyFeatures", () => ({ useCompanyFeatures: () => ({ hasStudents: true, loading: false, error: null }) }));
vi.mock("@/hooks/useRolePermissions", () => ({ useRolePermissions: () => ({ canAccess: () => true, loading: false, lookupFailed: false }) }));
vi.mock("@/components/PanelStudentSearch", () => ({ PanelStudentSearch: () => <input aria-label="Buscar aluno" /> }));

describe("actual PanelHeader trigger regression", () => {
  it.each(["admin", "coordinator", "trainer", "master"])("%s Linho omits the duplicated header trigger", async role => {
    state.auth.role = role;
    const { default: RealHeader } = await vi.importActual<typeof import("./PanelHeader")>("./PanelHeader");
    render(<MemoryRouter><RealHeader effectiveCompanyId={role === "master" ? null : "tenant-a"} linen assistantName="Setty" isWorkoutBuilder={false} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Abrir ou recolher menu lateral" })).toBeNull();
    expect(screen.getByRole("button", { name: "Setty" })).toBeVisible();
    if (role !== "master") expect(screen.getByRole("textbox", { name: "Buscar aluno" })).toBeVisible();
  });
  it("retains the trigger in a non-Linho header", async () => {
    const { default: RealHeader } = await vi.importActual<typeof import("./PanelHeader")>("./PanelHeader");
    render(<MemoryRouter><RealHeader effectiveCompanyId={null} linen={false} assistantName="Setty" isWorkoutBuilder={false} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Abrir ou recolher menu lateral" })).toBeVisible();
  });
});

describe("body portal visual scope and effect cleanup", () => {
  const scope = "data-sett-professional-shell";
  const effectProperties = ["--sett-effect-glass", "--sett-glass-bar-filter", "--sett-glass-button-filter", "--sett-glass-launcher-filter", "--sett-effect-edge", "--sett-effect-shadow", "--sett-effect-texture", "--sett-effect-ambient"];
  it.each(["admin", "coordinator", "trainer", "master"])("%s applies only the visual body scope and removes it on unmount", async role => {
    state.auth.role = role;
    const rootBefore = document.documentElement.getAttribute("style");
    const bodyBefore = document.body.getAttribute("style");
    const { unmount } = mount(role === "master" ? "/master/companies" : `/${role}/plans`);
    expect(document.body).toHaveAttribute(scope, "");
    expect(document.body.style.getPropertyValue("--sett-effect-glass")).toBe("0.5");
    expect(document.body.style.getPropertyValue("--sett-glass-bar-filter")).toBe("blur(24px) saturate(150%)");
    expect(document.documentElement.getAttribute("style")).toBe(rootBefore);
    await screen.findByTestId("header");
    unmount();
    expect(document.body).not.toHaveAttribute(scope);
    for (const property of effectProperties) expect(document.body.style.getPropertyValue(property)).toBe("");
    expect(document.body.getAttribute("style") || "").toBe(bodyBefore || "");
  });
  it.each(["student", ""])("does not apply portal scope or effect tokens for role '%s'", async role => {
    state.auth.role = role;
    const { unmount } = mount("/aluno");
    expect(document.body).not.toHaveAttribute(scope);
    for (const property of effectProperties) expect(document.body.style.getPropertyValue(property)).toBe("");
    await screen.findByTestId("header");
    unmount();
  });
  it("restores pre-existing scope/tokens and does not replace configured body brand tokens", async () => {
    state.theme.settings = { primary_color: "#123456" };
    const styleBefore = document.body.getAttribute("style");
    document.body.setAttribute(scope, "previous-owner");
    document.body.style.setProperty("--sett-effect-glass", "0.17");
    document.body.style.setProperty("--sett-glass-bar-filter", "none");
    document.body.style.setProperty("--primary", "200 10% 40%");
    try {
      const { unmount } = mount("/admin/plans");
      expect(document.body.style.getPropertyValue("--primary")).toBe("200 10% 40%");
      await screen.findByTestId("header");
      unmount();
      expect(document.body).toHaveAttribute(scope, "previous-owner");
      expect(document.body.style.getPropertyValue("--sett-effect-glass")).toBe("0.17");
      expect(document.body.style.getPropertyValue("--sett-glass-bar-filter")).toBe("none");
      expect(document.body.style.getPropertyValue("--primary")).toBe("200 10% 40%");
    } finally {
      cleanup();
      document.body.removeAttribute(scope);
      if (styleBefore === null) document.body.removeAttribute("style");
      else document.body.setAttribute("style", styleBefore);
    }
  });
  it.each([{ enabled: false, intensity: 80 }, { enabled: true, intensity: 0 }])("disables portal glass filters for $enabled / $intensity", async glass => {
    state.theme.settings = { professional_appearance: { effects: { glass } } };
    const { unmount } = mount("/admin/plans");
    expect(document.body).toHaveAttribute(scope);
    expect(document.body.style.getPropertyValue("--sett-effect-glass")).toBe("0");
    for (const property of ["--sett-glass-bar-filter", "--sett-glass-button-filter", "--sett-glass-launcher-filter"]) {
      expect(document.body.style.getPropertyValue(property)).toBe("none");
    }
    await screen.findByTestId("header");
    unmount();
    expect(document.body).not.toHaveAttribute(scope);
  });
  it("updates portal effects and cleans them when role changes to student", async () => {
    const { unmount } = mount("/admin");
    expect(document.body.style.getPropertyValue("--sett-effect-glass")).toBe("0.5");
    state.theme.settings = { professional_appearance: { effects: { glass: { enabled: false, intensity: 90 } } } };
    await act(async () => navigate("/admin/plans"));
    expect(document.body.style.getPropertyValue("--sett-effect-glass")).toBe("0");
    expect(document.body.style.getPropertyValue("--sett-glass-bar-filter")).toBe("none");
    state.auth.role = "student";
    await act(async () => navigate("/aluno"));
    expect(document.body).not.toHaveAttribute(scope);
    for (const property of effectProperties) expect(document.body.style.getPropertyValue(property)).toBe("");
    unmount();
  });
});

vi.mock("@/hooks/useCompanyExperiencePolicy", () => ({ useCompanyExperiencePolicy: () => ({ policy: { renewal_notice_days: 7 }, error: null }) }));

describe("Portfolio actual page against the visual fixture staff-directory contract", () => {
  const profiles = [{ user_id: "qa-user", full_name: "Equipe QA" }];
  const memberships = [{ user_id: "qa-user", company_id: "tenant-a" }];
  const roles = [{ user_id: "qa-user", role: "admin" }];
  it("reproduces the prior fixture boundary caused by missing roles", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.rpc.mockImplementation(async name => ({ data: name === "get_company_student_staff_directory" ? profiles : [], error: null }));
      mount("/admin/carteira", <Portfolio />);
      expect(await screen.findByRole("heading", { name: "Algo deu errado" })).toBeVisible();
      expect(errors.mock.calls.some(args => args.some(arg => arg instanceof Error && /Cannot read properties of undefined.*map/.test(arg.message)))).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });
  it("renders the actual Portfolio with the repaired fixture response", async () => {
    state.rpc.mockImplementation(async name => ({ data: name === "get_company_student_staff_directory"
      ? visualStaffDirectory("tenant-a", profiles, memberships, roles) : [], error: null }));
    mount("/admin/carteira", <Portfolio />);
    expect(await screen.findByText("Nenhum aluno disponível nesta empresa.")).toBeVisible();
    expect(state.rpc).toHaveBeenCalledWith("get_company_student_staff_directory", { _company_id: "tenant-a" });
    expect(screen.queryByRole("heading", { name: "Algo deu errado" })).toBeNull();
    expect(screen.getByRole("combobox")).toBeVisible();
  });
  it("joins only staff roles and memberships in the requested company", () => {
    expect(visualStaffDirectory("tenant-a", profiles,
      [...memberships, { user_id: "other", company_id: "tenant-b" }, { user_id: "student", company_id: "tenant-a" }],
      [...roles, ...roles, { user_id: "other", role: "trainer" }, { user_id: "student", role: "student" }]))
      .toEqual([{ user_id: "qa-user", full_name: "Equipe QA", roles: ["admin"] }]);
    expect(visualStaffDirectory("tenant-b", profiles, memberships, roles)).toEqual([]);
  });
});


describe("Master fallback palette for body-portaled forms (DOM regression)", () => {
  function restoreStyle(element: HTMLElement, previous: string | null) {
    if (previous === null) element.removeAttribute("style");
    else element.setAttribute("style", previous);
  }
  it.each(["light", "dark"])("shares every fallback %s palette token between surface and body, leaving root intact", async mode => {
    state.auth.role = "master";
    state.theme.themeMode = mode;
    const rootBefore = document.documentElement.getAttribute("style");
    const expected = document.createElement("div");
    applyPlatformTheme(LINEN_PALETTE, mode as "light" | "dark", expected);
    const properties = Array.from(expected.style);
    const previous = properties.map(name => ({ name, value: document.body.style.getPropertyValue(name), priority: document.body.style.getPropertyPriority(name) }));
    const { container, unmount } = mount("/master/companies");
    expect(properties.length).toBeGreaterThan(20);
    for (const name of properties) {
      expect(shell(container).style.getPropertyValue(name), `surface ${name}`).toBe(expected.style.getPropertyValue(name));
      expect(document.body.style.getPropertyValue(name), `body ${name}`).toBe(shell(container).style.getPropertyValue(name));
    }
    expect(document.documentElement.getAttribute("style")).toBe(rootBefore);
    await screen.findByTestId("header");
    unmount();
    for (const { name, value, priority } of previous) {
      expect(document.body.style.getPropertyValue(name)).toBe(value);
      expect(document.body.style.getPropertyPriority(name)).toBe(priority);
    }
  });
  it("restores earlier body palette values and important priority without removing unrelated properties", async () => {
    state.auth.role = "master";
    const before = document.body.getAttribute("style");
    document.body.style.setProperty("--primary", "225 50% 23%", "important");
    document.body.style.setProperty("--card", "10 20% 30%", "important");
    document.body.style.setProperty("--qa-unrelated", "preserved");
    const previousInk = document.body.style.getPropertyValue("--ink");
    try {
      const { container, unmount } = mount("/master");
      expect(document.body.style.getPropertyValue("--primary")).toBe(shell(container).style.getPropertyValue("--primary"));
      expect(document.body.style.getPropertyPriority("--primary")).toBe("");
      expect(document.body.style.getPropertyValue("--qa-unrelated")).toBe("preserved");
      await screen.findByTestId("header");
      unmount();
      expect(document.body.style.getPropertyValue("--primary")).toBe("225 50% 23%");
      expect(document.body.style.getPropertyPriority("--primary")).toBe("important");
      expect(document.body.style.getPropertyValue("--card")).toBe("10 20% 30%");
      expect(document.body.style.getPropertyPriority("--card")).toBe("important");
      expect(document.body.style.getPropertyValue("--ink")).toBe(previousInk);
      expect(document.body.style.getPropertyValue("--qa-unrelated")).toBe("preserved");
    } finally { cleanup(); restoreStyle(document.body, before); }
  });
  it("waits for theme loading to finish before applying fallback colors", async () => {
    state.auth.role = "master";
    state.theme.isLoading = true;
    const primaryBefore = document.body.style.getPropertyValue("--primary");
    const { container } = mount("/master");
    expect(shell(container).style.getPropertyValue("--primary")).toBe("");
    expect(document.body.style.getPropertyValue("--primary")).toBe(primaryBefore);
    state.theme.isLoading = false;
    await act(async () => navigate("/master/companies"));
    expect(document.body.style.getPropertyValue("--primary")).toBe(shell(container).style.getPropertyValue("--primary"));
    expect(document.body.style.getPropertyValue("--primary")).not.toBe("");
  });
  it.each(["light", "dark"])("removes fallback body colors when a configured tenant arrives in %s mode", async mode => {
    state.auth.role = "master";
    state.theme.themeMode = mode;
    const bodyBefore = document.body.getAttribute("style");
    const rootBefore = document.documentElement.getAttribute("style");
    // Model ThemeProvider ownership of a configured tenant's root palette.
    const configured = { primary_color: "#245678", background_color: "#F1F2F3", card_color: "#FFFFFF", text_color: "#123456" };
    const expected = document.createElement("div");
    applyPlatformTheme(configured, mode as "light" | "dark", expected);
    try {
      const previous = Array.from(expected.style).map(name => ({ name, value: document.body.style.getPropertyValue(name) }));
      const { container, unmount } = mount("/master");
      expect(document.body.style.getPropertyValue("--primary")).toBe(shell(container).style.getPropertyValue("--primary"));
      state.master.isViewingCompany = true;
      state.master.viewingCompany = { id: "tenant-b" };
      state.theme.settings = configured;
      applyPlatformTheme(configured, mode as "light" | "dark", document.documentElement);
      await act(async () => navigate("/admin/plans"));
      expect(shell(container).style.getPropertyValue("--primary")).toBe("");
      for (const { name, value } of previous) {
        expect(document.body.style.getPropertyValue(name), `restored ${name}`).toBe(value);
        expect(document.documentElement.style.getPropertyValue(name), `configured root ${name}`).toBe(expected.style.getPropertyValue(name));
      }
      expect(screen.getByTestId("header")).toHaveAttribute("data-company", "tenant-b");
      unmount();
    } finally { cleanup(); restoreStyle(document.body, bodyBefore); restoreStyle(document.documentElement, rootBefore); }
  });
});
