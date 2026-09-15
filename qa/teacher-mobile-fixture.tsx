/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Toaster } from "../src/components/ui/toaster";
import { AuthProvider, useAuth } from "../src/hooks/useAuth";
import { MasterProvider } from "../src/contexts/MasterContext";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import { AppLayout } from "../src/components/AppLayout";
import RegistrationManager from "../src/pages/admin/RegistrationManager";
import WhatsAppChat from "../src/pages/admin/WhatsAppChat";
import StudentHub from "../src/pages/admin/StudentHub";
import StudentDetail from "../src/pages/admin/StudentDetail";
import WorkoutBuilder from "../src/pages/admin/WorkoutBuilder";
import PrescriptionStudio from "../src/pages/admin/PrescriptionStudio";
import AdminAgenda from "../src/pages/admin/AdminAgenda";
import { supabase } from "../src/integrations/supabase/client";
import "../src/index.css";

const companyId = "20000000-0000-4000-8000-000000000001";
const otherCompanyId = "20000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000001";
const fixtureNow = "2026-09-14T12:00:00.000Z";
const fixtureParams = new URLSearchParams(window.location.search);
const fixtureTheme = fixtureParams.get("theme") === "dark" ? "dark" : "light";
const requestedRole = fixtureParams.get("role");
const fixtureRole = requestedRole === "admin" || requestedRole === "coordinator" || requestedRole === "master"
  ? requestedRole
  : "trainer";

document.documentElement.classList.toggle("dark", fixtureTheme === "dark");
document.documentElement.dataset.themeMode = fixtureTheme;
window.localStorage.setItem(`sett-personal-theme-mode:user:${userId}`, fixtureTheme);

const longName = "Ana Carolina de Albuquerque Montenegro Performance Mobile QA";
const rows: Record<string, any[]> = {
  company_members: [{ company_id: companyId, user_id: userId, companies: { tier: "advanced" } }],
  companies: [{ id: companyId, name: "BN QA", tier: "standard", slug: "bn-qa" }],
  user_roles: [{ user_id: userId, role: fixtureRole }],
  role_permissions: [
    { company_id: companyId, role: fixtureRole, module: "dashboard", enabled: true },
    { company_id: companyId, role: fixtureRole, module: "registration", enabled: true },
    { company_id: companyId, role: fixtureRole, module: "students", enabled: true },
    { company_id: companyId, role: fixtureRole, module: "exercises", enabled: true },
    { company_id: companyId, role: fixtureRole, module: "whatsapp", enabled: true },
  ],
  platform_settings: [
    {
      id: "platform-1",
      company_id: companyId,
      primary_color: "#1D2D5C",
      background_color: "#FAFAF7",
      card_color: "#F2F0EA",
      text_color: "#0A0A0A",
      platform_title: "SETT QA",
      logo_url: null,
      layout_style: "classico",
    },
  ],
  profiles: [{ user_id: userId, full_name: "Treinadora QA" }],
  students: [
    {
      id: "student-mobile-1",
      company_id: companyId,
      full_name: longName,
      name: longName,
      email: "ana.qa@example.test",
      phone: "5548999990001",
      whatsapp: "5548999990001",
      country_code: "BR",
      status: "active",
      sales_stage: "active_onboarding",
      assigned_trainer_id: userId,
      created_at: "2026-09-01T12:00:00.000Z",
      selected_plan_id: "plan-standard",
      gender: "female",
      birth_date: "1994-03-10",
      height_cm: 168,
      weight_kg: 62,
    },
    {
      id: "student-mobile-2",
      company_id: companyId,
      full_name: "Bruno Lead Convertido Com Nome Grande",
      name: "Bruno Lead Convertido Com Nome Grande",
      email: "bruno.qa@example.test",
      phone: "5548999990002",
      whatsapp: "5548999990002",
      country_code: "BR",
      status: "pending",
      sales_stage: "fiscal_pending",
      assigned_trainer_id: userId,
      created_at: "2026-09-07T12:00:00.000Z",
    },
    {
      id: "student-other-tenant",
      company_id: otherCompanyId,
      full_name: "Outro Tenant Invisível",
      status: "active",
      created_at: "2026-09-01T12:00:00.000Z",
    },
  ],
  leads: [
    {
      id: "lead-mobile-1",
      company_id: companyId,
      full_name: "Lead Interessada Mobile Com Sobrenome Enorme",
      name: "Lead Interessada Mobile Com Sobrenome Enorme",
      phone: "5548999990003",
      whatsapp: "5548999990003",
      email: "lead.qa@example.test",
      stage: "interested",
      status: "interested",
      created_at: "2026-09-13T12:00:00.000Z",
      converted_to_student_id: null,
      source: "landing",
      budget_range: "300_400",
      preferred_contact_period: "manha",
    },
    { id: "lead-other", company_id: otherCompanyId, full_name: "Lead Outro Tenant", stage: "interested", converted_to_student_id: null },
  ],
  student_funnel_events: [],
  student_anamneses: [
    { id: "anam-1", company_id: companyId, student_id: "student-mobile-1", goal: "hipertrofia", training_days: 4, created_at: fixtureNow },
  ],
  functional_assessments: [
    { id: "assessment-1", company_id: companyId, student_id: "student-mobile-1", created_at: fixtureNow, result: { summary: "Valgo leve" } },
  ],
  plans: [{ id: "plan-standard", company_id: companyId, name: "Plano Performance Longo", duration_weeks: 6, duration_days: 42, cycle_duration_days: 42, plan_kind: "standard", is_active: true }],
  enrollments: [
    {
      id: "enroll-1",
      company_id: companyId,
      student_id: "student-mobile-1",
      trainer_id: userId,
      plan_id: "plan-standard",
      plan_name: "Plano Performance Longo",
      start_date: "2026-09-01",
      end_date: "2026-10-13",
      training_start_date: "2026-09-03",
      status: "active",
      payment_status: "paid",
    },
  ],
  training_cycles: [
    {
      id: "cycle-mobile-1",
      company_id: companyId,
      enrollment_id: "enroll-1",
      student_id: "student-mobile-1",
      cycle_number: 1,
      status: "active",
      start_date: "2026-09-03",
      end_date: "2026-10-14",
      prescribed_offline_at: null,
      enrollments: { student_id: "student-mobile-1", students: { full_name: longName, assigned_trainer_id: userId } },
    },
  ],
  workouts: [
    {
      id: "workout-mobile-1",
      company_id: companyId,
      cycle_id: "cycle-mobile-1",
      title: "Treino A - Inferiores com nome grande",
      description: "Força",
      day_of_week: 1,
      sort_order: 1,
      superseded_at: null,
      exercises: [
        { exercise_id: "ex-agachamento", exercise_name: "Agachamento Livre com Barra", muscle_group: "Quadríceps", sets: "4", reps: "8-10", rest_seconds: 90, cues: "Controle total" },
        { exercise_id: "ex-remada", exercise_name: "Remada Curvada Pegada Pronada", muscle_group: "Costas", sets: "3", reps: "10", rest_seconds: 75, cues: "Escápulas" },
      ],
    },
  ],
  ai_strength_plans: [
    { id: "strength-1", company_id: companyId, student_id: "student-mobile-1", training_cycle_id: "cycle-mobile-1", created_at: fixtureNow, sequence_number: 1, plan: { workouts: [] } },
  ],
  running_plans: [],
  nutrition_plans: [],
  prescription_bundles: [
    { id: "bundle-1", company_id: companyId, student_id: "student-mobile-1", training_cycle_id: "cycle-mobile-1", status: "active", created_at: fixtureNow },
  ],
  prescription_bundle_items: [],
  workout_logs: [],
  workout_sessions: [],
  payments: [],
  student_evaluations: [],
  student_checkins: [],
  cycle_feedback: [],
  company_ai_config: [{ company_id: companyId, ai_text_refinement_enabled: false }],
  muscle_groups: [{ id: "mg-1", name: "Quadríceps" }, { id: "mg-2", name: "Costas" }],
  exercise_library: [
    { id: "ex-agachamento", company_id: companyId, is_global: false, name: "Agachamento Livre com Barra", muscle_group: "Quadríceps", difficulty: "intermediate", video_path: null },
    { id: "ex-remada", company_id: companyId, is_global: false, name: "Remada Curvada Pegada Pronada", muscle_group: "Costas", difficulty: "intermediate", video_path: null },
    { id: "ex-global", company_id: null, is_global: true, name: "Prancha Frontal", muscle_group: "Core", difficulty: "beginner", video_path: null },
    { id: "ex-other", company_id: otherCompanyId, is_global: false, name: "Exercício Outro Tenant", muscle_group: "Sigilo", difficulty: "beginner", video_path: null },
  ],
  exercise_muscle_targets: [],
  workout_templates: [
    {
      id: "template-mobile-1",
      company_id: companyId,
      name: "Template QA Nome Visível",
      created_at: fixtureNow,
      workouts: [{ title: "A", exercises: [{ exercise_id: "legacy-old", exercise_name: "Agachamento Livre com Barra", sets: "3", reps: "10" }] }],
    },
  ],
  whatsapp_chats: [
    { id: "chat-1", company_id: companyId, student_id: "student-mobile-1", lead_id: null, remote_jid: "5548999990001@s.whatsapp.net", contact_name: longName, unread_count: 2, last_message_at: fixtureNow, last_message_text: "Pode revisar meu treino?", is_archived: false, assigned_trainer_id: userId },
    { id: "chat-2", company_id: companyId, student_id: null, lead_id: "lead-mobile-1", remote_jid: "5548999990003@s.whatsapp.net", contact_name: "Lead Interessada Mobile Com Sobrenome Enorme", unread_count: 0, last_message_at: "2026-09-13T12:00:00.000Z", last_message_text: "Quero saber dos planos", is_archived: false, assigned_trainer_id: userId },
    { id: "chat-other", company_id: otherCompanyId, student_id: "student-other-tenant", remote_jid: "5548999999999@s.whatsapp.net", contact_name: "Outro Tenant Invisível", unread_count: 10, last_message_at: fixtureNow },
  ],
  whatsapp_messages: [
    { id: "msg-1", chat_id: "chat-1", company_id: companyId, content: "Pode revisar meu treino?", source: "incoming", created_at: "2026-09-14T11:56:00.000Z", message_id_external: "wa-in-1", media_url: null, media_type: null },
    { id: "msg-2", chat_id: "chat-1", company_id: companyId, content: "Claro, vou olhar sem enviar nada real.", source: "outgoing", created_at: "2026-09-14T11:58:00.000Z", message_id_external: "wa-out-1", media_url: null, media_type: null },
  ],
  message_templates: [{ id: "tpl-1", company_id: companyId, title: "Boas-vindas", shortcut: "oi", content: "Olá {{nome}}" }],
  student_categories: [],
  whatsapp_labels: [],
  whatsapp_chat_labels: [],
};

const log = { writes: [] as string[], invokes: [] as string[], reads: [] as string[] };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const valueAt = (row: any, column: string) => column.split(".").reduce((acc, key) => acc?.[key], row);
const visibleRows = (table: string) => (rows[table] || []).filter((row) => !("company_id" in row) || row.company_id === companyId);

class QueryBuilder {
  private filters: Array<{ type: string; column: string; value: any; operator?: string }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private wantsSingle = false;
  private wantsMaybeSingle = false;
  private headOnly = false;
  private wantsCount = false;
  private selectedColumns = "";

  constructor(private table: string) {}
  select(columns?: string, options?: { count?: string; head?: boolean }) { this.selectedColumns = columns || ""; this.headOnly = Boolean(options?.head); this.wantsCount = Boolean(options?.count); return this; }
  eq(column: string, value: any) { this.filters.push({ type: "eq", column, value }); return this; }
  neq(column: string, value: any) { this.filters.push({ type: "neq", column, value }); return this; }
  is(column: string, value: any) { this.filters.push({ type: "is", column, value }); return this; }
  in(column: string, value: any[]) { this.filters.push({ type: "in", column, value }); return this; }
  lte(column: string, value: any) { this.filters.push({ type: "lte", column, value }); return this; }
  gte(column: string, value: any) { this.filters.push({ type: "gte", column, value }); return this; }
  lt(column: string, value: any) { this.filters.push({ type: "lt", column, value }); return this; }
  gt(column: string, value: any) { this.filters.push({ type: "gt", column, value }); return this; }
  not(column: string, operator: string, value: any) { this.filters.push({ type: "not", column, operator, value }); return this; }
  or() { return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orders.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.rowLimit = value; return this; }
  range() { return this; }
  maybeSingle() { this.wantsMaybeSingle = true; return this.execute(); }
  single() { this.wantsSingle = true; return this.execute(); }
  insert(value?: any) { log.writes.push(`${this.table}:insert:${JSON.stringify(value ?? {})}`); return Promise.resolve({ data: null, error: null }); }
  update(value?: any) { log.writes.push(`${this.table}:update:${JSON.stringify(value ?? {})}`); return this; }
  upsert(value?: any) { log.writes.push(`${this.table}:upsert:${JSON.stringify(value ?? {})}`); return Promise.resolve({ data: null, error: null }); }
  delete() { log.writes.push(`${this.table}:delete`); return this; }
  then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.execute().then(onfulfilled, onrejected);
  }
  private async execute() {
    log.reads.push(this.table);
    if (
      this.table === "training_cycles"
      && this.selectedColumns.includes("enrollments(")
      && !this.selectedColumns.includes("enrollments!training_cycles_enrollment_id_fkey(")
    ) {
      return {
        data: null,
        error: { code: "PGRST201", message: "Could not embed because more than one relationship was found" },
      };
    }
    let result = visibleRows(this.table).filter((row) => this.filters.every((filter) => {
      const value = valueAt(row, filter.column);
      if (filter.type === "eq") return value === filter.value;
      if (filter.type === "neq") return value !== filter.value;
      if (filter.type === "is") return value === filter.value;
      if (filter.type === "in") return Array.isArray(filter.value) && filter.value.includes(value);
      if (filter.type === "lte") return String(value) <= String(filter.value);
      if (filter.type === "gte") return String(value) >= String(filter.value);
      if (filter.type === "lt") return String(value) < String(filter.value);
      if (filter.type === "gt") return String(value) > String(filter.value);
      if (filter.type === "not" && filter.operator === "is") return value !== filter.value;
      return true;
    }));
    for (const order of this.orders) {
      result = [...result].sort((a, b) => {
        const av = valueAt(a, order.column) ?? "";
        const bv = valueAt(b, order.column) ?? "";
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (order.ascending ? 1 : -1);
      });
    }
    if (this.rowLimit !== null) result = result.slice(0, this.rowLimit);
    if (this.wantsSingle || this.wantsMaybeSingle) return { data: clone(result[0] ?? null), error: null };
    return { data: this.headOnly ? null : clone(result), count: this.wantsCount || this.headOnly ? result.length : null, error: null };
  }
}

const session = {
  access_token: "fixture-access-token",
  refresh_token: "fixture-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: userId, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: fixtureNow },
};

(supabase as any).auth = {
  getSession: async () => ({ data: { session }, error: null }),
  onAuthStateChange: (callback: any) => {
    window.setTimeout(() => callback("SIGNED_IN", session), 0);
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
  signOut: async () => ({ error: null }),
};

Object.defineProperty(supabase, "from", { configurable: true, value: (table: string) => new QueryBuilder(table) });
Object.defineProperty(supabase, "rpc", {
  configurable: true,
  value: (name: string, params?: Record<string, unknown>) => {
    if (name === "get_user_role") return Promise.resolve({ data: fixtureRole, error: null });
    if (name === "has_staff_permission") return Promise.resolve({ data: true, error: null });
    if (name === "replace_cycle_workout_revision") {
      log.writes.push(`${name}:rpc:${JSON.stringify(params ?? {})}`);
      const workouts = Array.isArray(params?.p_workouts) ? params.p_workouts : [];
      return Promise.resolve({
        data: {
          cycle_id: params?.p_cycle_id,
          revision_id: "revision-fixture-1",
          workouts_created: workouts.length,
          workout_rows: workouts.map((_, index) => ({ id: `saved-workout-${index + 1}`, updated_at: fixtureNow })),
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  },
});
Object.defineProperty(supabase, "functions", {
  configurable: true,
  value: {
    invoke: async (name: string) => {
      log.invokes.push(name);
      if (name === "ai-validate-prescription") return { data: { result: { status: "ok", warnings: [], blockers: [] } }, error: null };
      return { data: { ok: true, url: "https://example.test/mock" }, error: null };
    },
  },
});
Object.defineProperty(supabase, "storage", {
  configurable: true,
  value: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }), upload: async () => ({ data: null, error: null }), remove: async () => ({ data: null, error: null }) }) },
});
const membershipRefresh = new Set<() => void>();
Object.defineProperty(supabase, "channel", {
  configurable: true,
  value: () => {
    const callbacks = new Set<() => void>();
    const channel = {
      on: (_event: string, filter: { table?: string }, callback: () => void) => {
        if (["plans", "enrollments"].includes(filter.table || "")) {
          callbacks.add(callback);
          membershipRefresh.add(callback);
        }
        return channel;
      },
      subscribe: () => channel,
      unsubscribe: () => callbacks.forEach((callback) => membershipRefresh.delete(callback)),
    };
    return channel;
  },
});
Object.defineProperty(supabase, "removeChannel", {
  configurable: true,
  value: (channel: { unsubscribe: () => void }) => channel.unsubscribe(),
});

(window as any).__teacherMobileFixture = {
  getWrites: () => [...log.writes],
  getInvokes: () => [...log.invokes],
  getReads: () => [...log.reads],
  changeMembership: (athletic: boolean) => {
    if (!rows.plans.some((plan) => plan.id === "plan-athletic")) {
      rows.plans.push({ ...rows.plans[0], id: "plan-athletic", name: "Athletic Club Anual" });
    }
    rows.enrollments[0].plan_id = athletic ? "plan-athletic" : "plan-standard";
    membershipRefresh.forEach((callback) => callback());
  },
};

function ReadyRoutes() {
  const { companyId: readyCompanyId, loading } = useAuth();
  if (loading || readyCompanyId !== companyId) return <div>Carregando fixture...</div>;
  return (
    <MemoryRouter initialEntries={[fixtureParams.get("route") || "/trainer/registration"]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/trainer/registration" element={<RegistrationManager />} />
          <Route path="/admin/registration" element={<RegistrationManager />} />
          <Route path="/coordinator/registration" element={<RegistrationManager />} />
          <Route path="/master/registration" element={<RegistrationManager />} />
          <Route path="/trainer/whatsapp-chat" element={<WhatsAppChat />} />
          <Route path="/trainer/aluno/:id" element={<StudentDetail />} />
          <Route path="/trainer/students/:id" element={<StudentHub />} />
          <Route path="/trainer/workout/:cycleId" element={<WorkoutBuilder />} />
          <Route path="/trainer/studio" element={<PrescriptionStudio embeddedStudentId="student-mobile-1" />} />
          <Route path="/trainer/agenda" element={<AdminAgenda />} />
          <Route path="*" element={<Navigate to="/trainer/registration" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function FixtureApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <MasterProvider>
              <ThemeProvider>
                <ReadyRoutes />
                <Toaster />
              </ThemeProvider>
            </MasterProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<FixtureApp />);
