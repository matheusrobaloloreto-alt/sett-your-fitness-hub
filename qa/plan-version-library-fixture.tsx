import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PlanVersionsCard } from "../src/components/admin/PlanVersionsCard";
import { Toaster } from "../src/components/ui/toaster";
import { supabase } from "../src/integrations/supabase/client";
import { ensureWorkoutLibraryReferences } from "../src/lib/workoutLibraryRecovery";
import type { WorkoutTemplateDraftWorkout } from "../src/lib/workoutTemplateDraft";
import "../src/index.css";

type Row = Record<string, unknown>;
type Result = { data: Row | Row[] | null; error: null };
const companyId = "20000000-0000-4000-8000-000000000001";
const otherCompanyId = "20000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000001";
const studentId = "30000000-0000-4000-8000-000000000001";
const foreignId = "40000000-0000-4000-8000-000000000002";
const variant = new URLSearchParams(location.search).get("variant") || "mixed";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const library: Row[] = [
  { id: "exercise-legacy", name: "Agachamento QA", company_id: companyId },
  { id: "exercise-weekly", name: "Remada QA", company_id: null, is_global: true },
  { id: "exercise-v2", name: "Flexora QA", company_id: companyId },
  { id: foreignId, name: "Linha oculta QA nao fornecida", company_id: otherCompanyId,
    equipment: "Equipamento privado QA", video_path: `${otherCompanyId}/private-qa.mp4`, is_global: false },
];
const originalHidden = JSON.stringify(library.find((row) => row.id === foreignId));
const legacy = {
  exercise_id: "exercise-legacy", exercise_name: "Agachamento QA", sets: "3", reps: "8,6,4", rest: "75s",
  notes: "Protocolo legado QA sem migracao", tempo: "3010", rir: "2", method: "biset", group_id: "group-qa",
  mfit_protocol: [{ reps: "8", load: "livre" }], custom_prescription: { keep: "legacy" },
};
const weekly = {
  exercise_id: "exercise-weekly", exercise_name: "Remada QA", sets: "9", reps: "99", rest: "90s",
  method: "cluster", group_id: "base-group", method_seconds: 30, weekly_ui_version: "individual-weeks-v1",
  weekly_prescription: [
    { week: 1, sets: 2, reps: "10", rest_seconds: 0, tempo: "2020", rir: "2-3", method: null, group_id: null,
      method_seconds: null, set_types: ["warmup", "failure"], instruction: "Instrucao semana um QA", extra_week: { keep: true } },
    { week: 7, sets: 4, reps: "5", rest_seconds: 0, tempo: "3030", rir: "1", method: "cluster", group_id: "week-seven",
      method_seconds: 15, set_types: ["normal", "normal", "normal", "failure"], instruction: "Instrucao semana sete QA" },
  ],
};
const v2 = { ...clone(weekly), exercise_id: "exercise-v2", exercise_name: "Flexora QA", weekly_ui_version: "individual-weeks-v2" };
const mixed = {
  revision_id: "revision-source-only", student_id: studentId,
  workouts: [
    { id: "runtime-a", updated_at: "2026-09-28T00:00:00Z", title: "Treino A QA", description: "Descricao A QA",
      day_of_week: 3, custom_workout: { keep: "session-a" }, exercises: [legacy, weekly] },
    { id: "runtime-b", updated_at: "2026-09-28T00:00:00Z", title: "Treino B QA", description: "Descricao B QA",
      day_of_week: null, exercises: [v2] },
  ],
};
const rawAi = {
  cycle_name: "AI anterior QA", duration_weeks: 8, student_id: studentId,
  workouts: [{ name: "Sessao AI antiga QA", notes: "Observacao de sessao antiga QA", exercises: [{
    exercise_id: "exercise-legacy", library_exercise_name: "Agachamento QA", sets: 3, reps: "10", rest_seconds: 0,
    cues: "Cue AI antigo QA", biomechanical_note: "Nota tecnica AI QA", tempo: "3020", rir: "2",
  }] }],
};
const plan: Row = variant === "raw-ai" ? rawAi : clone(mixed);
if (variant === "invalid-b") {
  (plan.workouts as Row[])[1].exercises = [{ ...v2, exercise_id: foreignId, exercise_name: "Snapshot fornecido QA",
    muscle_group: "Dorsal", equipment: "Halteres snapshot QA", category: "pesos_livre", categories: ["pesos_livre"],
    video_url: "https://example.test/supplied-qa.mp4", video_path: `${companyId}/supplied-qa.mp4`,
    company_id: otherCompanyId, is_global: true, created_by: "forged-actor-qa" }];
}
if (variant === "missing") {
  plan.workouts = [{ title: "Treino ausente QA", exercises: [{ ...clone(weekly), exercise_id: null,
    exercise_name: "Exercicio ausente QA", muscle_group: "Dorsal", equipment: "Cabo QA",
    video_url: "https://example.test/draft-qa.mp4", video_path: `${companyId}/draft-qa.mp4`,
    company_id: otherCompanyId, is_global: true, created_by: "forged-actor-qa" }] }];
}
if (variant === "malformed") {
  plan.workouts = [{ title: "Estrutura invalida QA", exercises: null }];
}
if (variant === "malformed-text") {
  plan.workouts = [{ title: { unexpected: "object" }, exercises: [{ exercise_name: { unexpected: "object" } }] }];
}
const originalSource = JSON.stringify(plan);
const versions: Row[] = Array.from({ length: variant === "pagination" ? 21 : 1 }, (_, index) => ({
  id: `version-${String(index).padStart(3, "0")}`, company_id: companyId, student_id: studentId,
  created_at: "2026-09-29T12:00:00.000Z", edited: index % 2 === 0, edit_summary: "Snapshot sintetico QA",
  plan: index === 20 ? { workouts: [{ title: "Versao 21 QA", exercises: [legacy] }] } : plan,
}));
const templates: Row[] = [];
const log = { reads: [] as Row[], writes: [] as Row[], rpcs: [] as Row[], errors: [] as string[] };
type RecoveryMode = "normal" | "reject-once" | "lost-ack-once" | "wrong-company-once";
let recoveryMode: RecoveryMode = "normal";
let recoveryQueue: Promise<unknown> = Promise.resolve();
const nameKey = (value: unknown) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
let holdCatalog = false;
let releaseCatalog: (() => void) | null = null;

class Query {
  private filters: Array<[string, unknown]> = [];
  private from = 0;
  private to = Number.MAX_SAFE_INTEGER;
  private catalogCompany: string | null = null;
  private payload: Row | null = null;
  constructor(private table: string) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  order() { return this; }
  range(from: number, to: number) { this.from = from; this.to = to; return this.execute(false); }
  or(filter: string) {
    const match = /^company_id\.eq\.([a-zA-Z0-9_-]+),is_global\.eq\.true$/.exec(filter);
    if (!match) throw new Error("Unscoped catalog request in QA");
    this.catalogCompany = match[1];
    return this;
  }
  insert(payload: Row) { this.payload = clone(payload); return this; }
  maybeSingle() { return this.execute(true); }
  private async execute(single: boolean): Promise<Result> {
    if (this.payload) {
      if (this.table !== "workout_templates") throw new Error("Non-library write attempted in QA");
      log.writes.push({ table: this.table, operation: "insert", payload: clone(this.payload) });
      templates.push(clone(this.payload));
      return { data: clone(this.payload), error: null };
    }
    log.reads.push({ table: this.table, filters: clone(this.filters), from: this.from, to: this.to, catalogCompany: this.catalogCompany });
    let data: Row[];
    if (this.table === "ai_plan_versions") {
      if (!this.filters.some(([key]) => key === "company_id") || !this.filters.some(([key]) => key === "student_id")) {
        throw new Error("Unscoped history request in QA");
      }
      data = versions.filter((row) => this.filters.every(([key, value]) => row[key] === value));
    } else if (this.table === "exercise_library") {
      if (!this.catalogCompany) throw new Error("Missing catalog company in QA");
      if (holdCatalog) { holdCatalog = false; await new Promise<void>((resolve) => { releaseCatalog = resolve; }); }
      data = library.filter((row) => row.is_global === true || row.company_id === this.catalogCompany);
    } else throw new Error(`Unexpected QA table: ${this.table}`);
    const page = data.slice(this.from, this.to + 1);
    return { data: clone(single ? page[0] || null : page), error: null };
  }
}

Object.defineProperty(supabase, "from", { configurable: true, value: (table: string) => new Query(table) });
Object.defineProperty(supabase, "auth", { configurable: true, value: {
  getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }),
} });
Object.defineProperty(supabase, "rpc", { configurable: true, value: (name: string, args: Row) => {
  if (name !== "ensure_workout_library_references") throw new Error("Unexpected RPC in QA");
  log.rpcs.push({ name, args: clone(args) });
  const run = recoveryQueue.then(() => {
    const mode = recoveryMode;
    recoveryMode = "normal";
    if (mode === "reject-once") return { data: null, error: { code: "42501", message: "Synthetic recovery denied" } };
    if (args.p_company_id !== companyId || !Array.isArray(args.p_exercises)) throw new Error("Unexpected recovery tenant or payload in QA");
    let created = 0;
    const mappings = (args.p_exercises as Row[]).map((metadata, input_index) => {
      if (Object.keys(metadata).some((key) => !["name", "muscle_group", "equipment", "category", "categories"].includes(key))) {
        throw new Error("Unsafe recovery metadata in QA");
      }
      if (typeof metadata.name !== "string" || !nameKey(metadata.name)) throw new Error("Missing recovery name in QA");
      let row = library.find((candidate) => (candidate.company_id === companyId || candidate.is_global === true)
        && nameKey(candidate.name) === nameKey(metadata.name));
      if (!row) {
        row = { ...clone(metadata), id: crypto.randomUUID(), company_id: companyId, is_global: false, created_by: userId };
        library.push(row);
        log.writes.push({ table: "exercise_library", operation: "insert", payload: clone(row) });
        created++;
      }
      return { input_index, exercise_id: row.id };
    });
    if (mode === "lost-ack-once") return { data: null, error: { code: "NETWORK", message: "Synthetic ACK lost after registration" } };
    return { data: { ok: true, actor_id: userId, company_id: mode === "wrong-company-once" ? otherCompanyId : companyId,
      created_count: created, mappings }, error: null };
  });
  recoveryQueue = run.then(() => undefined, () => undefined);
  return run;
} });

declare global {
  interface Window {
    __planLibraryQA: {
      log: () => typeof log;
      source: () => string;
      originalSource: string;
      templates: () => Row[];
      library: () => Row[];
      hiddenUnchanged: () => boolean;
      setRecoveryMode: (mode: RecoveryMode) => void;
      recoverCopies: (count: number) => Promise<string[]>;
      holdCatalog: () => void;
      releaseCatalog: () => void;
    };
  }
}
window.__planLibraryQA = {
  log: () => clone(log), source: () => JSON.stringify(plan), originalSource, templates: () => clone(templates),
  library: () => clone(library), hiddenUnchanged: () => JSON.stringify(library.find((row) => row.id === foreignId)) === originalHidden,
  setRecoveryMode: (mode) => { recoveryMode = mode; },
  recoverCopies: async (count) => Promise.all(Array.from({ length: count }, async () => {
    const result = await ensureWorkoutLibraryReferences(supabase, {
      workouts: clone(plan.workouts) as WorkoutTemplateDraftWorkout[], companyId,
    });
    return result.resolvedDraft.workouts[0].exercises![0].exercise_id!;
  })),
  holdCatalog: () => { holdCatalog = true; },
  releaseCatalog: () => { releaseCatalog?.(); releaseCatalog = null; },
};

class QaBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { log.errors.push(error.message); }
  render() { return this.state.failed ? <p role="alert">Erro de render QA</p> : this.props.children; }
}

export function Fixture() {
  const [company, setCompany] = useState(companyId);
  return <>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <h1 className="text-lg font-semibold">Historico sintetico QA</h1>
      <button type="button" className="text-sm underline" onClick={() => setCompany(company === companyId ? otherCompanyId : companyId)}>Trocar empresa QA</button>
    </header>
    <main className="mx-auto max-w-4xl p-4">
      <QaBoundary><PlanVersionsCard studentId={studentId} companyId={company} studentName="Aluno sintetico QA" createdBy={userId} /></QaBoundary>
    </main>
    <Toaster />
  </>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);
