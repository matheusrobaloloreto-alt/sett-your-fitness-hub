/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Toaster } from "../src/components/ui/toaster";
import { AuthProvider } from "../src/hooks/useAuth";
import { MasterProvider } from "../src/contexts/MasterContext";
import ExerciseLibrary from "../src/pages/admin/ExerciseLibrary";
import WorkoutBuilder from "../src/pages/admin/WorkoutBuilder";
import { supabase } from "../src/integrations/supabase/client";
import "../src/index.css";

const fixtureParams = new URLSearchParams(window.location.search);
const fixtureTheme = fixtureParams.get("theme") === "dark" ? "dark" : "light";
document.documentElement.classList.toggle("dark", fixtureTheme === "dark");
document.documentElement.dataset.themeMode = fixtureTheme;

const companyId = "20000000-0000-4000-8000-000000000101";
const studentId = "30000000-0000-4000-8000-000000000101";
const enrollmentId = "40000000-0000-4000-8000-000000000101";
const cycleId = "50000000-0000-4000-8000-000000000101";
const userId = "10000000-0000-4000-8000-000000000101";

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

type MuscleGroup = { id: string; name: string };
type ExerciseRow = {
  id: string;
  company_id: string | null;
  is_global: boolean;
  name: string;
  description: string | null;
  muscle_group: string | null;
  category: string | null;
  categories: string[] | null;
  body_regions?: string[] | null;
  video_url: string | null;
  video_path: string | null;
  thumbnail_url: string | null;
  youtube_video_id?: string | null;
  equipment?: string | null;
  difficulty?: string | null;
  created_by?: string | null;
};
type TargetRow = {
  exercise_id: string;
  muscle_group_id: string;
  role: "primary" | "secondary" | null;
  is_primary: boolean | null;
  volume_percentage: number;
};

type WorkoutRow = {
  id: string;
  company_id: string;
  cycle_id: string;
  title: string;
  name: string;
  description: string;
  exercises: Array<{ exercise_id: string; exercise_name: string; muscle_group: string; sets: string; reps: string; rest: string; notes: string; video_url: null; video_path: null }>;
  day_of_week: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  superseded_at: string | null;
};

const muscleGroups: MuscleGroup[] = [
  { id: "mg-abdomen", name: "Abdômen" },
  { id: "mg-quadriceps", name: "Quadríceps" },
  { id: "mg-posterior", name: "Posterior de coxa" },
  { id: "mg-gluteos", name: "Glúteos" },
  { id: "mg-adutores", name: "Adutores" },
  { id: "mg-panturrilha", name: "Panturrilha" },
  { id: "mg-deltoide-lateral", name: "Deltoide Lateral" },
  { id: "mg-deltoide-posterior", name: "Deltoide Posterior" },
  { id: "mg-deltoide-anterior", name: "Deltoide Anterior" },
  { id: "mg-antebraco", name: "Antebraço" },
  { id: "mg-biceps", name: "Biceps" },
  { id: "mg-triceps", name: "Triceps" },
  { id: "mg-dorsal", name: "Dorsal" },
  { id: "mg-trapezio", name: "Trapezio" },
  { id: "mg-peitoral", name: "Peitoral" },
  { id: "mg-core", name: "Core" },
  { id: "mg-peitoral-alias", name: "Peito" },
];

function exercise(input: Partial<ExerciseRow> & Pick<ExerciseRow, "id" | "name">): ExerciseRow {
  return {
    company_id: companyId,
    is_global: false,
    description: null,
    muscle_group: null,
    category: null,
    categories: [],
    body_regions: null,
    video_url: null,
    video_path: null,
    thumbnail_url: null,
    youtube_video_id: null,
    created_by: userId,
    ...input,
  };
}

const fillerExercises = Array.from({ length: 1005 }, (_, index) => exercise({
  id: `exercise-filler-${String(index + 1).padStart(4, "0")}`,
  name: `Z Filler ${String(index + 1).padStart(4, "0")}`,
  muscle_group: "Peitoral",
  category: "base",
  categories: ["base"],
}));

class FixtureState {
  insertSequence = 1;
  insertedExercises: ExerciseRow[] = [];
  updatedExercises: Array<{ id: string; patch: Partial<ExerciseRow> }> = [];
  replacedTargets: Array<{ exerciseId: string; targets: TargetRow[] }> = [];
  exerciseRows: ExerciseRow[] = [
    exercise({ id: "exercise-prancha", name: "Prancha category-only", muscle_group: null, category: "core", categories: ["core", "peso_corporal"] }),
    exercise({ id: "exercise-mobility", name: "Mobilidade category-only", muscle_group: null, category: "mobilidades", categories: ["mobilidades"] }),
    exercise({ id: "exercise-legacy-one", name: "Supino legado 1%", muscle_group: "Peitoral", category: "base", categories: ["base"] }),
    exercise({ id: "exercise-edit", name: "Editar alvo existente", muscle_group: "Peitoral", category: "pesos_livre", categories: ["pesos_livre"] }),
    exercise({ id: "exercise-rosca", name: "Rosca Scott sem anatomia inferida", muscle_group: null, category: "pesos_livre", categories: ["pesos_livre"] }),
    ...fillerExercises,
  ];
  targetRows: TargetRow[] = [
    { exercise_id: "exercise-legacy-one", muscle_group_id: "mg-peitoral-alias", role: "secondary", is_primary: false, volume_percentage: 1 },
    { exercise_id: "exercise-legacy-one", muscle_group_id: "mg-peitoral", role: "primary", is_primary: true, volume_percentage: 1 },
    { exercise_id: "exercise-legacy-one", muscle_group_id: "mg-biceps", role: "secondary", is_primary: false, volume_percentage: 1 },
    { exercise_id: "exercise-edit", muscle_group_id: "mg-peitoral", role: "primary", is_primary: true, volume_percentage: 100 },
  ];
  workoutRows: WorkoutRow[] = [{
    id: "workout-taxonomy-a",
    company_id: companyId,
    cycle_id: cycleId,
    title: "Treino A - Taxonomia",
    name: "Treino A - Taxonomia",
    description: "Fixture real de WorkoutBuilder",
    exercises: [{
      exercise_id: "exercise-legacy-one",
      exercise_name: "Supino legado 1%",
      muscle_group: "Peitoral",
      sets: "4",
      reps: "10",
      rest: "60s",
      notes: "Volume legado deve virar 4/2",
      video_url: null,
      video_path: null,
    }],
    day_of_week: 1,
    sort_order: 1,
    created_at: "2026-09-14T12:00:00.000Z",
    updated_at: "2026-09-14T12:00:00.000Z",
    superseded_at: null,
  }];

  rows(table: string) {
    switch (table) {
      case "company_members": return [{ company_id: companyId, user_id: userId, companies: { tier: "advanced" } }];
      case "user_roles": return [{ user_id: userId, role: "admin" }];
      case "platform_settings": return [{ id: "settings-taxonomy", company_id: companyId, platform_title: "SETT QA", primary_color: "#1D2D5C", background_color: "#FAFAF7", card_color: "#F2F0EA", text_color: "#0A0A0A", logo_url: null, layout_style: "classico" }];
      case "company_ai_config": return [{ company_id: companyId, assistant_name: "Setty QA", onboarding_completed: true }];
      case "muscle_groups": return muscleGroups;
      case "exercise_library": return this.exerciseRows;
      case "exercise_muscle_targets": return this.targetRows;
      case "training_cycles": return [{ id: cycleId, company_id: companyId, enrollment_id: enrollmentId, student_id: studentId, cycle_number: 2, status: "active", start_date: "2026-09-01", end_date: "2026-10-12" }];
      case "enrollments": return [{ id: enrollmentId, company_id: companyId, student_id: studentId, status: "active", created_at: "2026-09-01T00:00:00.000Z" }];
      case "students": return [{ id: studentId, company_id: companyId, full_name: "Aluno Taxonomia", name: "Aluno Taxonomia", gender: "male", phone: "+5500000000000" }];
      case "workouts": return this.workoutRows;
      case "workout_templates":
      case "leads":
      case "student_anamneses":
      case "functional_assessments":
      case "whatsapp_chats":
      case "announcements":
      case "role_permissions":
        return [];
      default: return [];
    }
  }

  insertExercise(payload: Partial<ExerciseRow> | Partial<ExerciseRow>[]) {
    const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => exercise({
      id: `exercise-created-${this.insertSequence++}`,
      name: String(row.name || "Exercício criado"),
      ...row,
    } as ExerciseRow));
    this.exerciseRows.push(...rows);
    this.insertedExercises.push(...deepClone(rows));
    return rows;
  }

  updateExercise(id: string, patch: Partial<ExerciseRow>) {
    this.exerciseRows = this.exerciseRows.map((row) => row.id === id ? { ...row, ...patch } : row);
    this.updatedExercises.push({ id, patch: deepClone(patch) });
  }

  replaceTargets(exerciseId: string, targets: TargetRow[]) {
    this.targetRows = this.targetRows.filter((row) => row.exercise_id !== exerciseId);
    this.targetRows.push(...targets.map((target) => ({ ...target, exercise_id: exerciseId })));
    this.replacedTargets.push({ exerciseId, targets: deepClone(targets) });
  }
}

const state = new FixtureState();

class SupabaseQueryBuilder {
  private filters: Array<{ type: "eq" | "is" | "in"; column: string; value: any }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private wantsSingle = false;
  private wantsMaybeSingle = false;
  private mutation: null | { type: "insert"; payload: any } | { type: "update"; payload: any } | { type: "delete" } = null;

  constructor(private table: string) {}

  select() { return this; }
  eq(column: string, value: any) { this.filters.push({ type: "eq", column, value }); return this; }
  is(column: string, value: any) { this.filters.push({ type: "is", column, value }); return this; }
  in(column: string, value: any[]) { this.filters.push({ type: "in", column, value }); return this; }
  or() { return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orders.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.rowLimit = value; return this; }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; }
  maybeSingle() { this.wantsMaybeSingle = true; return this.execute(); }
  single() { this.wantsSingle = true; return this.execute(); }
  insert(payload: any) { this.mutation = { type: "insert", payload }; return this; }
  update(payload: any) { this.mutation = { type: "update", payload }; return this; }
  upsert(payload: any) { this.mutation = { type: "insert", payload }; return this; }
  delete() { this.mutation = { type: "delete" }; return this; }

  then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.mutation?.type === "insert" && this.table === "exercise_library") {
      const rows = state.insertExercise(this.mutation.payload);
      return this.wrap(rows);
    }
    if (this.mutation?.type === "update" && this.table === "exercise_library") {
      const id = this.filters.find((filter) => filter.type === "eq" && filter.column === "id")?.value;
      if (id) state.updateExercise(id, this.mutation.payload);
      return this.wrap([]);
    }
    if (this.mutation?.type === "delete" && this.table === "exercise_library") {
      const id = this.filters.find((filter) => filter.type === "eq" && filter.column === "id")?.value;
      if (id) state.exerciseRows = state.exerciseRows.filter((row) => row.id !== id);
      return this.wrap([]);
    }
    return this.wrap(this.applyQuery(state.rows(this.table)));
  }

  private wrap(rows: any[]) {
    const output = deepClone(rows);
    if (this.wantsSingle || this.wantsMaybeSingle) return { data: output[0] ?? null, error: null };
    return { data: output, error: null };
  }

  private applyQuery(rows: any[]) {
    let result = rows.filter((row) => this.filters.every((filter) => {
      if (filter.type === "eq") return row[filter.column] === filter.value;
      if (filter.type === "is") return row[filter.column] === filter.value;
      if (filter.type === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
      return true;
    }));
    for (const order of this.orders) {
      result = [...result].sort((a, b) => {
        const av = a[order.column] ?? "";
        const bv = b[order.column] ?? "";
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (order.ascending ? 1 : -1);
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) result = result.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.rowLimit !== null) result = result.slice(0, this.rowLimit);
    return result;
  }
}

const session = {
  access_token: "fixture-access-token",
  refresh_token: "fixture-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: userId, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-09-14T12:00:00.000Z" },
};

(supabase as any).auth = {
  getSession: async () => ({ data: { session }, error: null }),
  onAuthStateChange: (callback: any) => {
    window.setTimeout(() => callback("SIGNED_IN", session), 0);
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
  signOut: async () => ({ error: null }),
};
Object.defineProperty(supabase, "from", { configurable: true, value: (table: string) => new SupabaseQueryBuilder(table) });
Object.defineProperty(supabase, "rpc", {
  configurable: true,
  value: (name: string, params?: any) => {
    if (name === "get_user_role") return Promise.resolve({ data: "admin", error: null });
    if (name === "replace_exercise_muscle_targets") {
      state.replaceTargets(params.p_exercise_id, params.p_targets || []);
      return Promise.resolve({ data: null, error: null });
    }
    if (name === "get_company_ai_identity") return { maybeSingle: async () => ({ data: { assistant_name: "Setty QA" }, error: null }) };
    if (name === "replace_cycle_workout_revision") return Promise.resolve({ data: { workout_ids: state.workoutRows.map((row) => row.id), workout_rows: state.workoutRows.map((row) => ({ id: row.id, updated_at: row.updated_at })) }, error: null });
    return Promise.resolve({ data: null, error: null });
  },
});
Object.defineProperty(supabase, "functions", { configurable: true, value: { invoke: async () => ({ data: { result: { status: "ok", warnings: [], blockers: [] } }, error: null }) } });
Object.defineProperty(supabase, "storage", {
  configurable: true,
  value: { from: () => ({ upload: async () => ({ data: null, error: null }), remove: async () => ({ data: null, error: null }), getPublicUrl: (path: string) => ({ data: { publicUrl: `/qa/${path}` } }) }) },
});

(window as any).__exerciseTaxonomyFixture = {
  getInsertedExercises: () => deepClone(state.insertedExercises),
  getUpdatedExercises: () => deepClone(state.updatedExercises),
  getReplacedTargets: () => deepClone(state.replacedTargets),
  getExerciseRows: () => deepClone(state.exerciseRows),
  getTargetRows: () => deepClone(state.targetRows),
};

function FixtureApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const route = fixtureParams.get("route") === "workout" ? `/admin/workout/${cycleId}` : "/admin/exercises";
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <MasterProvider>
              <MemoryRouter initialEntries={[route]}>
                <Routes>
                  <Route path="/admin/exercises" element={<ExerciseLibrary />} />
                  <Route path="/admin/workout/:cycleId" element={<WorkoutBuilder />} />
                </Routes>
              </MemoryRouter>
            </MasterProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<FixtureApp />);
