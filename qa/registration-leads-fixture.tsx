import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/index.css";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Result = { data: unknown; error: Error | null; count?: number };
type Call = { kind: "read" | "update" | "rpc" | "function"; name: string; args?: Row; ids?: unknown[]; ok: boolean };

const scenario = new URLSearchParams(location.search).get("scenario") || "normal";
const storageKey = `sett-registration-leads-fixture-v1:${scenario}`;
const companyId = "20000000-0000-4000-8000-000000000071";
const userId = "10000000-0000-4000-8000-000000000071";
const clone = <T,>(value: T): T => structuredClone(value);
const calls: Call[] = [];
const blockedNetwork: string[] = [];

// Keep the SDK away from any real session on this development origin.
const persistentStorage = window.localStorage;
const ephemeralStorage = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    get length() { return ephemeralStorage.size; },
    key: (index: number) => [...ephemeralStorage.keys()][index] ?? null,
    getItem: (key: string) => key === storageKey ? persistentStorage.getItem(key) : ephemeralStorage.get(key) ?? null,
    setItem: (key: string, value: string) => key === storageKey
      ? persistentStorage.setItem(key, value) : ephemeralStorage.set(key, value),
    removeItem: (key: string) => key === storageKey ? persistentStorage.removeItem(key) : ephemeralStorage.delete(key),
    clear: () => ephemeralStorage.clear(),
  } satisfies Storage,
});

window.fetch = async (input) => {
  const target = input instanceof Request ? input.url : String(input);
  blockedNetwork.push(target);
  throw new Error("Network disabled in registration QA fixture");
};
XMLHttpRequest.prototype.open = function () {
  blockedNetwork.push("XMLHttpRequest");
  throw new Error("XMLHttpRequest disabled in registration QA fixture");
};

const createdAt = "2026-10-01T12:00:00.000Z";
const student = (id: string, fullName: string, salesStage: string): Row => ({
  id, company_id: companyId, full_name: fullName, email: `${id}@example.test`,
  phone: null, whatsapp: null, status: "pending", sales_stage: salesStage,
  fiscal_completed_at: null, payment_link_sent_at: null, activated_at: null,
  assessment_due_at: null, onboarding_instructions_sent_at: null,
  selected_plan_id: null, assigned_trainer_id: null, created_at: createdAt, updated_at: createdAt,
});
const lead = (id: string, fullName: string, stage: string): Row => ({
  id, company_id: companyId, full_name: fullName, phone: null, stage,
  converted_to_student_id: null, budget_range: "300_400", preferred_contact_period: "evening",
  contact_outcome: null, interest_notes: "Synthetic fixture only", submitted_at: createdAt,
  pre_registration_answers: { objective: "performance", goals: "QA synthetic goal", age: 30 },
  created_at: createdAt, updated_at: createdAt,
});
const seeds: Tables = {
  companies: [{ id: companyId, slug: "registration-qa", name: "Registration QA", tier: "standard" }],
  company_members: [{ company_id: companyId, user_id: userId }],
  user_roles: [{ user_id: userId, role: "admin" }],
  students: [
    student("student-contact", "QA Pending Contact", "contacted"),
    student("student-fiscal", "QA Pending Fiscal", "fiscal_registration_pending"),
    student("student-lost", "QA Lost Student", "lost"),
  ],
  leads: [
    lead("lead-interested", "QA Interested Lead", "interested"),
    lead("lead-lost", "QA Lost Lead", "lost"),
    { ...lead("lead-converted", "QA Pending Contact", "contacted"), converted_to_student_id: "student-contact" },
  ],
  student_anamneses: [{ id: "anamnesis-contact", company_id: companyId, student_id: "student-contact", objective: "performance" }],
  student_funnel_events: [], functional_assessments: [], intercycle_anamneses: [], plans: [], enrollments: [],
};
let tables: Tables = clone(seeds);
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) tables = JSON.parse(saved) as Tables;
} catch {
  localStorage.removeItem(storageKey);
}
const persist = () => localStorage.setItem(storageKey, JSON.stringify(tables));
persist();

class MockQuery implements PromiseLike<Result> {
  private filters: ((row: Row) => boolean)[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private bounds?: [number, number];
  private maxRows?: number;
  private one = false;
  private patch?: Row;
  private result?: Promise<Result>;
  constructor(private table: string) {}
  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => row[column] !== value); return this; }
  is(column: string, value: unknown) { return this.eq(column, value); }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false }); return this;
  }
  range(from: number, to: number) { this.bounds = [from, to]; return this; }
  limit(count: number) { this.maxRows = count; return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  update(patch: Row) { this.patch = clone(patch); return this; }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.result ??= Promise.resolve().then(() => this.execute());
    return this.result.then(onfulfilled, onrejected);
  }
  private execute(): Result {
    const kind = this.patch ? "update" : "read";
    if (!(this.table in tables)) throw new Error(`Unmocked table: ${this.table}`);
    if ((scenario === "read-error" && this.table === "students" && !this.patch)
      || (scenario === "error" && this.patch)) {
      calls.push({ kind, name: this.table, ok: false });
      return { data: null, error: new Error("Synthetic registration fixture error") };
    }
    let rows = tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
    if (this.patch) {
      if (!["students", "leads"].includes(this.table)) throw new Error(`Write denied: ${this.table}`);
      rows.forEach((row) => Object.assign(row, clone(this.patch)));
      persist();
    }
    calls.push({ kind, name: this.table, args: this.patch, ids: rows.map((row) => row.id), ok: true });
    rows = [...rows].sort((a, b) => {
      for (const { column, ascending } of this.orders) {
        if (a[column] === b[column]) continue;
        return (String(a[column] ?? "") < String(b[column] ?? "") ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1);
    if (this.maxRows !== undefined) rows = rows.slice(0, this.maxRows);
    return { data: clone(this.one ? rows[0] ?? null : rows), count: rows.length, error: null };
  }
}

// Import all modules that use Supabase only after the storage/network sandbox exists.
const { supabase } = await import("../src/integrations/supabase/client");
supabase.auth.stopAutoRefresh();
const session = {
  access_token: "synthetic-fixture-token", refresh_token: "synthetic-fixture-refresh",
  expires_in: 3600, token_type: "bearer",
  user: { id: userId, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: createdAt },
};
Object.defineProperty(supabase, "auth", { configurable: true, value: {
  getSession: async () => ({ data: { session }, error: null }),
  getUser: async () => ({ data: { user: session.user }, error: null }),
  onAuthStateChange: (callback: (event: string, value: typeof session) => void) => {
    const timer = window.setTimeout(() => callback("SIGNED_IN", session), 0);
    return { data: { subscription: { unsubscribe: () => window.clearTimeout(timer) } } };
  },
  signOut: async () => ({ error: null }),
} });
Object.defineProperty(supabase, "from", { configurable: true, value: (table: string) => new MockQuery(table) });
Object.defineProperty(supabase, "rpc", { configurable: true, value: async (name: string, args: Row = {}): Promise<Result> => {
  if (name === "get_user_role") return { data: "admin", error: null };
  if (name === "has_staff_permission") return { data: false, error: null };
  if (name !== "set_registration_lead_stage") throw new Error(`Unmocked RPC: ${name}`);
  const table = args._entity_type === "student" ? "students" : "leads";
  const column = table === "students" ? "sales_stage" : "stage";
  const row = tables[table].find((candidate) => candidate.id === args._record_id && candidate.company_id === args._company_id);
  const rawStage = row?.[column];
  const currentStage = rawStage === "fiscal_registration" ? "fiscal_registration_pending" : rawStage;
  const valid = row && args._company_id === companyId && currentStage === args._expected_stage
    && (args._target_stage === "lost" || (currentStage === "lost" && args._target_stage === "contacted"));
  const ok = Boolean(valid) && scenario !== "error";
  calls.push({ kind: "rpc", name, args: clone(args), ids: row ? [row.id] : [], ok });
  if (!ok) return { data: null, error: new Error("Synthetic registration fixture error") };
  if (scenario === "ack-missing") return { data: null, error: null };
  const result = await new MockQuery(table).update({ [column]: args._target_stage, updated_at: new Date().toISOString() })
    .eq("id", args._record_id).eq("company_id", args._company_id).single();
  return result.error ? result : { data: { id: row!.id, stage: args._target_stage }, error: null };
} });
Object.defineProperty(supabase, "functions", { configurable: true, value: {
  invoke: async (name: string, args: Row) => {
    calls.push({ kind: "function", name, args: clone(args), ok: false });
    return { data: null, error: new Error(`Function disabled in fixture: ${name}`) };
  },
} });
const channel = { on: () => channel, subscribe: () => channel, unsubscribe: async () => "ok" };
Object.defineProperty(supabase, "channel", { configurable: true, value: () => channel });
Object.defineProperty(supabase, "removeChannel", { configurable: true, value: async () => "ok" });

const fixture = { snapshot: () => clone(tables), getCalls: () => clone(calls), getBlockedNetwork: () => [...blockedNetwork], storageKey };
declare global { interface Window { __registrationLeadsFixture: typeof fixture } }
window.__registrationLeadsFixture = fixture;

const { AuthProvider } = await import("../src/hooks/useAuth");
const { MasterProvider } = await import("../src/contexts/MasterContext");
const { default: RegistrationManager } = await import("../src/pages/admin/RegistrationManager");
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <MasterProvider>
            <MemoryRouter initialEntries={["/admin/registration"]}>
              <main className="min-h-screen min-w-0 bg-background p-4 text-foreground md:p-8">
                <RegistrationManager />
              </main>
            </MemoryRouter>
            <Toaster />
          </MasterProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
