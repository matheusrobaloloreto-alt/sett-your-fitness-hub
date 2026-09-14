/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Toaster } from "../src/components/ui/toaster";
import { AuthProvider } from "../src/hooks/useAuth";
import { MasterProvider } from "../src/contexts/MasterContext";
import WorkoutBuilder from "../src/pages/admin/WorkoutBuilder";
import { supabase } from "../src/integrations/supabase/client";
import "../src/index.css";

const companyId = "20000000-0000-4000-8000-000000000001";
const studentId = "30000000-0000-4000-8000-000000000001";
const enrollmentId = "40000000-0000-4000-8000-000000000001";
const cycleId = "50000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

type FixtureExercise = {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  video_url: string | null;
  video_path: string | null;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
  set_types?: string[];
};

type FixtureWorkout = {
  id: string;
  company_id: string;
  cycle_id: string;
  title: string;
  name: string;
  description: string;
  exercises: FixtureExercise[];
  day_of_week: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  superseded_at: string | null;
  revision_id: string;
  superseded_by_revision_id?: string | null;
  superseded_reason?: string | null;
};

type SaveCall = {
  expectedRows: Array<{ id: string; updated_at: string }>;
  workoutTitles: string[];
  workoutsLength: number;
};

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

class WorkoutSaveFixtureState {
  private revision = 1;
  private workoutSequence = 1;
  private delayedSaves: number[] = [];

  saveCalls: SaveCall[] = [];
  workouts: FixtureWorkout[] = [
    this.buildWorkout({
      title: "Treino A - Superior",
      description: "Versão inicial confirmada",
      day_of_week: 1,
      sort_order: 1,
      exercises: [
        {
          exercise_id: "exercise-bench",
          exercise_name: "Supino reto",
          muscle_group: "Peitoral",
          video_url: null,
          video_path: null,
          sets: "3",
          reps: "10",
          rest: "60s",
          notes: "Controle total",
          set_types: ["normal", "normal", "failure"],
        },
      ],
    }),
  ];

  buildWorkout(input: {
    title: string;
    description: string;
    day_of_week: number | null;
    sort_order: number;
    exercises: FixtureExercise[];
  }): FixtureWorkout {
    const stamp = this.nextTimestamp();
    const id = `workout-${String(this.workoutSequence).padStart(4, "0")}`;
    this.workoutSequence += 1;
    return {
      id,
      company_id: companyId,
      cycle_id: cycleId,
      title: input.title,
      name: input.title,
      description: input.description,
      exercises: deepClone(input.exercises),
      day_of_week: input.day_of_week,
      sort_order: input.sort_order,
      created_at: stamp,
      updated_at: stamp,
      superseded_at: null,
      revision_id: `revision-${this.revision}`,
    };
  }

  currentRows() {
    return this.workouts
      .filter((workout) => workout.superseded_at === null)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((workout) => ({ id: workout.id, updated_at: workout.updated_at }));
  }

  currentWorkouts() {
    return this.workouts
      .filter((workout) => workout.superseded_at === null)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((workout) => deepClone(workout));
  }

  delayNextSave(milliseconds: number) {
    this.delayedSaves.push(milliseconds);
  }

  externalSave(title: string, description = "Edição externa confirmada") {
    const current = this.currentWorkouts();
    this.replaceFromPayload({
      expectedRows: this.currentRows(),
      payload: current.map((workout, index) => ({
        title: index === 0 ? title : workout.title,
        description: index === 0 ? description : workout.description,
        day_of_week: workout.day_of_week,
        exercises: workout.exercises,
      })),
      reason: "external-fixture-save",
    });
  }

  async replaceCycleWorkoutRevision(params: any) {
    const delayMs = this.delayedSaves.shift() ?? 0;
    if (delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }

    const expectedRows = Array.isArray(params?.p_expected_rows) ? params.p_expected_rows : [];
    const payload = Array.isArray(params?.p_workouts) ? params.p_workouts : [];
    this.saveCalls.push({
      expectedRows: deepClone(expectedRows),
      workoutTitles: payload.map((workout: any) => String(workout?.title || workout?.name || "")),
      workoutsLength: payload.length,
    });

    if (!this.matchesCurrentRows(expectedRows)) {
      return {
        data: null,
        error: {
          code: "P0001",
          message: "workout_revision_changed",
          details: "workout_revision_changed",
          hint: null,
        },
      };
    }

    return {
      data: this.replaceFromPayload({
        expectedRows,
        payload,
        reason: "manual-save",
      }),
      error: null,
    };
  }

  private replaceFromPayload({
    payload,
    reason,
  }: {
    expectedRows: Array<{ id: string; updated_at: string }>;
    payload: any[];
    reason: string;
  }) {
    this.revision += 1;
    const nextRevisionId = `revision-${this.revision}`;
    const supersededAt = this.nextTimestamp();
    this.workouts = this.workouts.map((workout) => (
      workout.superseded_at
        ? workout
        : {
            ...workout,
            superseded_at: supersededAt,
            superseded_by_revision_id: nextRevisionId,
            superseded_reason: reason,
          }
    ));

    const created = payload.map((workout, index) => this.buildWorkout({
      title: String(workout?.title || workout?.name || `Treino ${index + 1}`),
      description: String(workout?.description || ""),
      day_of_week: workout?.day_of_week ?? index + 1,
      sort_order: index + 1,
      exercises: Array.isArray(workout?.exercises) ? workout.exercises : [],
    })).map((workout) => ({ ...workout, revision_id: nextRevisionId }));

    this.workouts.push(...created);

    return {
      cycle_id: cycleId,
      revision_id: nextRevisionId,
      workouts_created: created.length,
      workout_ids: created.map((workout) => workout.id),
      workout_rows: created.map((workout) => ({ id: workout.id, updated_at: workout.updated_at })),
    };
  }

  private matchesCurrentRows(expectedRows: Array<{ id: string; updated_at: string }>) {
    const current = this.currentRows();
    if (current.length !== expectedRows.length) return false;
    return current.every((row, index) => (
      row.id === expectedRows[index]?.id && row.updated_at === expectedRows[index]?.updated_at
    ));
  }

  private nextTimestamp() {
    const stamp = new Date(Date.UTC(2026, 8, 14, 12, 0, this.workoutSequence + this.revision)).toISOString();
    return stamp;
  }
}

const fixtureState = new WorkoutSaveFixtureState();

class SupabaseQueryBuilder {
  private filters: Array<{ type: "eq" | "is" | "in"; column: string; value: any }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private wantsSingle = false;
  private wantsMaybeSingle = false;

  constructor(private table: string) {}

  select() {
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ type: "is", column, value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ type: "in", column, value });
    return this;
  }

  or() {
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  maybeSingle() {
    this.wantsMaybeSingle = true;
    return this.execute();
  }

  single() {
    this.wantsSingle = true;
    return this.execute();
  }

  insert() {
    return Promise.resolve({ data: null, error: null });
  }

  update() {
    return this;
  }

  upsert() {
    return Promise.resolve({ data: null, error: null });
  }

  delete() {
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    const rows = this.applyQuery(this.rowsForTable());
    if (this.wantsSingle || this.wantsMaybeSingle) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private rowsForTable(): any[] {
    switch (this.table) {
      case "company_members":
        return [{ company_id: companyId, user_id: userId }];
      case "user_roles":
        return [{ user_id: userId, role: "admin" }];
      case "company_ai_config":
        return [{
          company_id: companyId,
          assistant_name: "Setty QA",
          consultancy_name: "BN QA",
          methodology: null,
          plans_payment: null,
          tone: null,
          owner_credentials: null,
          niche_audience: null,
          exercise_preferences: null,
          progression_model: null,
          periodization_doctrine: null,
          strength_endurance_integration: null,
          assessment_protocol: null,
          red_lines: null,
          communication_style: null,
          nutrition_scope: null,
          ethical_limits: null,
          onboarding_completed: true,
        }];
      case "muscle_groups":
        return [
          { id: "muscle-pectoralis", name: "Peitoral" },
          { id: "muscle-back", name: "Costas" },
        ];
      case "training_cycles":
        return [{
          id: cycleId,
          company_id: companyId,
          enrollment_id: enrollmentId,
          cycle_number: 3,
          status: "active",
          start_date: "2026-09-01",
          end_date: "2026-10-12",
        }];
      case "enrollments":
        return [{
          id: enrollmentId,
          company_id: companyId,
          student_id: studentId,
          start_date: "2026-09-01",
          status: "active",
        }];
      case "students":
        return [{
          id: studentId,
          company_id: companyId,
          full_name: "Aluno QA Salvamento",
          name: "Aluno QA Salvamento",
          gender: "male",
          phone: "+5500000000000",
        }];
      case "workouts":
        return fixtureState.currentWorkouts();
      case "exercise_library":
        return [{
          id: "exercise-bench",
          name: "Supino reto",
          muscle_group: "Peitoral",
          company_id: companyId,
          is_global: false,
          category: "strength",
          categories: ["força"],
          body_regions: ["chest"],
          thumbnail_url: null,
          youtube_video_id: null,
          video_url: null,
          video_path: null,
          description: "Exercício sintético de QA",
        }];
      case "exercise_muscle_targets":
        return [];
      case "workout_templates":
        return [{
          id: "template-replace-current",
          company_id: companyId,
          name: "Template substitui rascunho",
          description: "Template sintético de QA",
          level: "intermediario",
          focus: "força",
          updated_at: "2026-09-14T11:00:00.000Z",
          workouts: [
            {
              title: "Template C - Full Body",
              description: "Substituição por template",
              day_of_week: 2,
              exercises: [
                {
                  exercise_id: "exercise-bench",
                  exercise_name: "Supino reto",
                  muscle_group: "Peitoral",
                  video_url: null,
                  video_path: null,
                  sets: "4",
                  reps: "8",
                  rest: "75s",
                  notes: "Template",
                },
              ],
            },
          ],
        }];
      case "leads":
      case "student_anamneses":
      case "functional_assessments":
      case "whatsapp_chats":
        return [];
      default:
        return [];
    }
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
        const av = a[order.column] ?? 0;
        const bv = b[order.column] ?? 0;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (order.ascending ? 1 : -1);
      });
    }

    if (this.rangeFrom !== null && this.rangeTo !== null) result = result.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.rowLimit !== null) result = result.slice(0, this.rowLimit);
    return deepClone(result);
  }
}

const session = {
  access_token: "fixture-access-token",
  refresh_token: "fixture-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: userId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-09-14T12:00:00.000Z",
  },
};

(supabase as any).auth = {
  getSession: async () => ({ data: { session }, error: null }),
  onAuthStateChange: (callback: any) => {
    window.setTimeout(() => callback("SIGNED_IN", session), 0);
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
  signOut: async () => ({ error: null }),
};

Object.defineProperty(supabase, "from", {
  configurable: true,
  value: (table: string) => new SupabaseQueryBuilder(table),
});
Object.defineProperty(supabase, "rpc", {
  configurable: true,
  value: (name: string, params?: any) => {
    if (name === "get_user_role") return Promise.resolve({ data: "admin", error: null });
    if (name === "replace_cycle_workout_revision") return fixtureState.replaceCycleWorkoutRevision(params);
    if (name === "get_company_ai_identity") {
      return { maybeSingle: async () => ({ data: { assistant_name: "Setty QA" }, error: null }) };
    }
    return Promise.resolve({ data: null, error: null });
  },
});
Object.defineProperty(supabase, "functions", {
  configurable: true,
  value: {
    invoke: async (name: string) => {
      if (name === "ai-validate-prescription") {
        return { data: { result: { status: "ok", warnings: [], blockers: [] } }, error: null };
      }
      if (name === "ai-bnito-coach") {
        return { data: { summary: "Auditoria sintética de QA", risk_level: "baixo", suggestions: [] }, error: null };
      }
      return { data: {}, error: null };
    },
  },
});
Object.defineProperty(supabase, "storage", {
  configurable: true,
  value: {
    from: () => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `/qa/${path}` } }),
    }),
  },
});

(window as any).__workoutSaveFixture = {
  cycleId,
  getCurrentRows: () => fixtureState.currentRows(),
  getCurrentWorkouts: () => fixtureState.currentWorkouts(),
  getSaveCalls: () => deepClone(fixtureState.saveCalls),
  delayNextSave: (milliseconds: number) => fixtureState.delayNextSave(milliseconds),
  externalSave: (title: string, description?: string) => fixtureState.externalSave(title, description),
};

function FixtureApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const route = `/admin/workout/${cycleId}?returnTo=/admin/workout/${cycleId}`;

  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <MasterProvider>
              <MemoryRouter initialEntries={[route]}>
                <Routes>
                  <Route path="/admin/workout/:cycleId" element={<WorkoutBuilder />} />
                  <Route path="/admin/students" element={<Navigate to={route} replace />} />
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
