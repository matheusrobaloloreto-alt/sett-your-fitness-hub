import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkoutBuilder from "./WorkoutBuilder";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), getSession: vi.fn(),
  toast: vi.fn(), setPageContext: vi.fn(), register: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke },
  auth: { getSession: mocks.getSession },
} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "10000000-0000-4000-8000-000000000001" },
  companyId: "20000000-0000-4000-8000-000000000001", role: "trainer",
}) }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useAssistantName", () => ({ useAssistantName: () => "QA" }));
vi.mock("@/components/BnitoFloatingAssistant", () => ({
  useBnitoAssistant: () => ({ setPageContext: mocks.setPageContext }), BnitoContextButton: () => null,
}));
vi.mock("@/components/BenitoSprite", () => ({ BenitoSprite: () => null }));
vi.mock("@/components/body/BodyMap", () => ({ BodyMap: () => null }));
vi.mock("@/components/admin/PreRegistrationDetails", () => ({ PreRegistrationDetails: () => null }));
vi.mock("@/lib/preRegistrationData", () => ({ loadStudentPreRegistration: vi.fn().mockResolvedValue(null), updateStudentPreRegistration: vi.fn() }));

const companyId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
const recoveredId = "40000000-0000-4000-8000-000000000001";
type Row = Record<string, unknown>;
type Reply = { data: unknown; error: { code?: string; message?: string } | null };
type Query = {
  select: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  is: (...args: unknown[]) => Query;
  or: (...args: unknown[]) => Query;
  limit: (...args: unknown[]) => Query;
  eq: (key: string, value: unknown) => Query;
  range: (...args: unknown[]) => Promise<Reply>;
  maybeSingle: () => Promise<Reply>;
  then: (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
};
const clone = <T,>(value: T): T => structuredClone(value);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const sourceRows = (cycle: string): Row[] => [{
  id: `row-${cycle}`, updated_at: "2026-09-29T00:00:00Z", cycle_id: cycle,
  title: `Treino ${cycle} QA`, description: "Snapshot sintetico", sort_order: 0,
  exercises: [{ exercise_id: "", exercise_name: `Exercicio ${cycle} QA`, muscle_group: "Dorsal",
    sets: "3", reps: "8,6,4", rest: "0s", tempo: "3010", notes: "Legado intacto QA",
    set_types: ["normal", "normal", "falha"], method: null, group_id: null,
    mfit_protocol: { sequence: [1, 2] }, video_url: null, video_path: null }],
}];
let catalog: Row[];
let rows: Map<string, Row[]>;
let events: string[];
let templates: Row[];

function queryFor(table: string) {
  const filters = new Map<string, unknown>();
  const result = (): Reply => {
    switch (table) {
      case "muscle_groups": case "exercise_muscle_targets": return { data: [], error: null };
      case "exercise_library": return { data: clone(catalog), error: null };
      case "workout_templates": return { data: clone(templates), error: null };
      case "workouts": return { data: clone(rows.get(String(filters.get("cycle_id"))) || []), error: null };
      case "training_cycles": return { data: { cycle_number: 1, enrollment_id: `enrollment-${filters.get("id")}`, company_id: companyId, status: "active" }, error: null };
      case "enrollments": return { data: { student_id: "student-synthetic-qa", company_id: companyId }, error: null };
      case "students": return { data: { full_name: "Aluno sintetico QA", gender: "male" }, error: null };
      case "student_anamneses": case "functional_assessments": return { data: null, error: null };
      default: throw new Error(`Unexpected synthetic table ${table}`);
    }
  };
  const query: Query = {
    select: vi.fn(() => query), order: vi.fn(() => query), is: vi.fn(() => query),
    or: vi.fn(() => query), limit: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => { filters.set(key, value); return query; }),
    range: vi.fn(async () => result()), maybeSingle: vi.fn(async () => result()),
    then: (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  };
  return query;
}

const recoveryAck = (id = recoveredId): Reply => ({ data: {
  ok: true, company_id: companyId, actor_id: actorId, created_count: 1,
  mappings: [{ input_index: 0, exercise_id: id }],
}, error: null });

function mountBuilder() {
  return render(<MemoryRouter initialEntries={["/admin/workouts/cycle-a?returnTo=%2Fdone"]}>
    <Link to="/admin/workouts/cycle-b?returnTo=%2Fdone">Outro ciclo QA</Link>
    <Routes>
      <Route path="/admin/workouts/:cycleId" element={<WorkoutBuilder />} />
      <Route path="/done" element={<p>Save confirmado QA</p>} />
    </Routes>
  </MemoryRouter>);
}
const saveButton = () => screen.getByRole("button", { name: /^Salvar Tudo$/ });
const waitForDraft = (cycle = "cycle-a") => waitFor(() => expect(screen.getByDisplayValue(`Treino ${cycle} QA`)).toBeInTheDocument());

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External requests forbidden in synthetic Builder QA"); }));
  catalog = [];
  rows = new Map(["cycle-a", "cycle-b"].map((cycle) => [cycle, sourceRows(cycle)]));
  events = [];
  templates = [];
  mocks.from.mockImplementation(queryFor);
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: actorId } } }, error: null });
  mocks.register.mockImplementation(async (args: Row) => {
    const metadata = (args.p_exercises as Row[])[0];
    catalog.push({ ...clone(metadata), id: recoveredId, company_id: companyId, is_global: false });
    return recoveryAck();
  });
  mocks.invoke.mockImplementation(async (name: string) => {
    if (name !== "ai-validate-prescription") throw new Error(`Unexpected Edge call ${name}`);
    events.push("validate");
    return { data: { result: { status: "ok", warnings: [], blockers: [] } }, error: null };
  });
  mocks.rpc.mockImplementation(async (name: string, args: Row) => {
    if (name === "ensure_workout_library_references") {
      events.push("register");
      return mocks.register(args);
    }
    if (name !== "replace_cycle_workout_revision") throw new Error(`Unexpected RPC ${name}`);
    events.push("replace");
    const cycle = String(args.p_cycle_id);
    const saved = (args.p_workouts as Row[]).map((workout, index) => ({
      ...clone(workout), id: `saved-${cycle}-${index}`, updated_at: "2026-09-29T01:00:00Z", cycle_id: cycle,
    }));
    rows.set(cycle, saved);
    return { data: { cycle_id: cycle, revision_id: "revision-qa", workouts_created: saved.length,
      workout_rows: saved.map(({ id, updated_at }) => ({ id, updated_at })) }, error: null };
  });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("mounted WorkoutBuilder recovery integration", () => {
  const prepareTemplate = () => {
    catalog.push({ id: recoveredId, name: "Exercicio cycle-a QA", company_id: companyId, is_global: false });
    templates.push({ id: "template-qa", company_id: companyId, name: "Plano extra QA", workouts: [
      { title: "Sessao extra QA", description: "Somar sem apagar", exercises: [{
        exercise_id: recoveredId, exercise_name: "Exercicio cycle-a QA", muscle_group: "Dorsal",
        sets: "4", reps: "12", rest: "60s", notes: "Nota da biblioteca QA",
      }] },
    ] });
  };

  it("direct Add appends library sessions and saves the combined draft while preserving legacy metrics", async () => {
    prepareTemplate();
    const originalRows = clone(rows.get("cycle-a"));
    const originalTemplates = clone(templates);
    mountBuilder();
    await waitForDraft();
    fireEvent.click(screen.getByRole("button", { name: /Usar treino da biblioteca/ }));
    const dialog = await screen.findByRole("dialog", { name: "Usar treino da biblioteca" });
    await within(dialog).findByRole("heading", { name: "Plano extra QA" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Adicionar$/ }));
    expect(screen.queryByRole("dialog", { name: "Usar treino da biblioteca" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Treino cycle-a QA" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sessao extra QA" })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(rows.get("cycle-a")).toEqual(originalRows);
    expect(templates).toEqual(originalTemplates);
    fireEvent.click(saveButton());
    expect(await screen.findByText("Save confirmado QA")).toBeInTheDocument();
    const call = mocks.rpc.mock.calls.find(([name]) => name === "replace_cycle_workout_revision")![1];
    expect(call.p_workouts.map((workout: Row) => workout.title)).toEqual(["Treino cycle-a QA", "Sessao extra QA"]);
    expect(call.p_expected_rows).toEqual([{ id: "row-cycle-a", updated_at: "2026-09-29T00:00:00Z" }]);
    expect(call.p_workouts[0].exercises[0]).toMatchObject({
      sets: "3", reps: "8,6,4", rest: "0s", tempo: "3010", notes: "Legado intacto QA",
      mfit_protocol: { sequence: [1, 2] },
    });
    expect(call.p_workouts[0].exercises[0]).not.toHaveProperty("weekly_ui_version");
    expect(call.p_workouts[1].exercises[0].weekly_prescription).toHaveLength(6);
    expect(templates).toEqual(originalTemplates);
  }, 20000);

  it("replacement still requires confirmation and cancel preserves the current draft", async () => {
    prepareTemplate();
    mountBuilder();
    await waitForDraft();
    fireEvent.click(screen.getByRole("button", { name: /Usar treino da biblioteca/ }));
    const dialog = await screen.findByRole("dialog", { name: "Usar treino da biblioteca" });
    await within(dialog).findByRole("heading", { name: "Plano extra QA" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Usar este treino" }));
    expect(within(dialog).getByRole("button", { name: "Substituir treino atual" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(within(dialog).getByRole("button", { name: /^Adicionar$/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Treino cycle-a QA")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Usar este treino" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Substituir treino atual" }));
    expect(screen.queryByRole("tab", { name: "Treino cycle-a QA" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sessao extra QA" })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  }, 20000);

  it("registers missing references before validation and revision RPC; blocks a second pending save", async () => {
    const pending = deferred<Reply>();
    mocks.register.mockReturnValue(pending.promise);
    const before = clone(rows.get("cycle-a"));
    mountBuilder();
    await waitForDraft();
    const save = saveButton();
    try {
      fireEvent.click(save); fireEvent.click(save);
      await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("button", { name: /^Salvando\.\.\.$/ })).toBeDisabled();
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["ensure_workout_library_references"]);
      expect(rows.get("cycle-a")).toEqual(before);
    } finally {
      await act(async () => {
        catalog.push({ id: recoveredId, name: "Exercicio cycle-a QA", company_id: companyId, is_global: false });
        pending.resolve(recoveryAck());
      });
    }
    expect(await screen.findByText("Save confirmado QA")).toBeInTheDocument();
    expect(events).toEqual(["register", "validate", "replace"]);
    const body = mocks.invoke.mock.calls[0][1].body;
    expect(body).toMatchObject({ company_id: companyId, cycle_id: "cycle-a", plan: { workouts: [{ exercises: [{ exercise_id: recoveredId }] }] } });
    const replace = mocks.rpc.mock.calls.find(([name]) => name === "replace_cycle_workout_revision")![1];
    expect(replace.p_expected_rows).toEqual([{ id: "row-cycle-a", updated_at: "2026-09-29T00:00:00Z" }]);
    expect(replace.p_workouts[0].exercises[0]).toMatchObject({
      exercise_id: recoveredId, sets: "3", reps: "8,6,4", rest: "0s", tempo: "3010",
      notes: "Legado intacto QA", method: null, group_id: null, mfit_protocol: { sequence: [1, 2] },
    });
    expect(replace.p_workouts[0].exercises[0]).not.toHaveProperty("weekly_ui_version");
  }, 20000);

  it("failed recovery leaves the real Builder editable without validation or revision writes", async () => {
    mocks.register.mockResolvedValue({ data: null, error: { code: "42501", message: "Denied QA" } });
    const before = clone(rows.get("cycle-a"));
    mountBuilder();
    await waitForDraft();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Não foi possível preparar os exercícios" })));
    expect(saveButton()).toBeEnabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["ensure_workout_library_references"]);
    expect(rows.get("cycle-a")).toEqual(before);
  }, 20000);

  it("route scope change unlocks a new save while old recovery is held and ignores the old ACK", async () => {
    const pending = deferred<Reply>();
    mocks.register.mockReturnValueOnce(pending.promise);
    mountBuilder();
    await waitForDraft();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    try {
      fireEvent.click(screen.getByRole("link", { name: "Outro ciclo QA" }));
      await waitForDraft("cycle-b");
      expect(saveButton()).toBeEnabled();
      fireEvent.click(saveButton());
      await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(2));
      expect(await screen.findByText("Save confirmado QA")).toBeInTheDocument();
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
      expect(mocks.invoke.mock.calls[0][1].body.cycle_id).toBe("cycle-b");
      expect(mocks.rpc.mock.calls.filter(([name]) => name === "replace_cycle_workout_revision").map(([, args]) => args.p_cycle_id)).toEqual(["cycle-b"]);
    } finally {
      await act(async () => pending.resolve(recoveryAck()));
    }
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "replace_cycle_workout_revision")).toHaveLength(1);
    expect(rows.get("cycle-a")).toEqual(sourceRows("cycle-a"));
  }, 20000);

  it("an old ACK cannot unlock or complete a newer pending operation", async () => {
    const oldRequest = deferred<Reply>();
    const newRequest = deferred<Reply>();
    const newId = "40000000-0000-4000-8000-000000000002";
    mocks.register.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    mountBuilder();
    await waitForDraft();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    try {
      fireEvent.click(screen.getByRole("link", { name: "Outro ciclo QA" }));
      await waitForDraft("cycle-b");
      fireEvent.click(saveButton());
      await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(2));
      await act(async () => oldRequest.resolve(recoveryAck()));
      const busyButton = screen.getByRole("button", { name: /^Salvando\.\.\.$/ });
      expect(busyButton).toBeDisabled();
      fireEvent.click(busyButton); fireEvent.click(busyButton);
      expect(mocks.register).toHaveBeenCalledTimes(2);
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
        "ensure_workout_library_references", "ensure_workout_library_references",
      ]);
      expect(screen.getByDisplayValue("Treino cycle-b QA")).toBeInTheDocument();
      expect(mocks.toast).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        oldRequest.resolve(recoveryAck());
        catalog.push({ id: newId, name: "Exercicio cycle-b QA", company_id: companyId, is_global: false });
        newRequest.resolve(recoveryAck(newId));
      });
    }
    expect(await screen.findByText("Save confirmado QA")).toBeInTheDocument();
    expect(events).toEqual(["register", "register", "validate", "replace"]);
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({
      cycle_id: "cycle-b", plan: { workouts: [{ exercises: [{ exercise_id: newId }] }] },
    });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "replace_cycle_workout_revision").map(([, args]) => args.p_cycle_id)).toEqual(["cycle-b"]);
    expect(rows.get("cycle-a")).toEqual(sourceRows("cycle-a"));
  }, 20000);

  it.each(["result", "edge-error", "transport-error"])("discards obsolete deferred validation %s after a route change", async (kind) => {
    const pending = deferred<Reply>();
    mocks.invoke.mockReturnValueOnce(pending.promise);
    mountBuilder();
    await waitForDraft();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body.cycle_id).toBe("cycle-a");
    expect(screen.getByRole("button", { name: /^Salvando\.\.\.$/ })).toBeDisabled();
    try {
      fireEvent.click(screen.getByRole("link", { name: "Outro ciclo QA" }));
      await waitForDraft("cycle-b");
      expect(saveButton()).toBeEnabled();
      mocks.toast.mockClear();
    } finally {
      await act(async () => {
        if (kind === "transport-error") pending.reject(new Error("Obsolete transport error QA"));
        else if (kind === "edge-error") pending.resolve({ data: null, error: { message: "Obsolete edge error QA" } });
        else pending.resolve({ data: { result: {
          status: "blocked", blockers: [{ severity: "blocker", message: "Obsolete blocker QA" }],
          warnings: [{ severity: "warning", message: "Obsolete warning QA" }],
        } }, error: null });
      });
    }
    expect(saveButton()).toBeEnabled();
    expect(screen.getByDisplayValue("Treino cycle-b QA")).toBeInTheDocument();
    expect(screen.queryByText(/Obsolete (blocker|warning|edge|transport)/)).not.toBeInTheDocument();
    expect(screen.queryByText("Validador pré-salvar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workout-save-gate-panel")).not.toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["ensure_workout_library_references"]);
    expect(rows.get("cycle-a")).toEqual(sourceRows("cycle-a"));
    expect(rows.get("cycle-b")).toEqual(sourceRows("cycle-b"));
  }, 20000);

  it("does not invoke validation after an obsolete held anamnesis lookup", async () => {
    const pending = deferred<Reply>();
    mocks.from.mockImplementation((table: string) => {
      const query = queryFor(table);
      if (table === "student_anamneses") query.maybeSingle = vi.fn(() => pending.promise);
      return query;
    });
    mountBuilder();
    await waitForDraft();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith("student_anamneses"));
    expect(mocks.invoke).not.toHaveBeenCalled();
    try {
      fireEvent.click(screen.getByRole("link", { name: "Outro ciclo QA" }));
      await waitForDraft("cycle-b");
      mocks.toast.mockClear();
    } finally {
      await act(async () => pending.resolve({ data: { objective: "Synthetic obsolete QA", experience_months: 12 }, error: null }));
    }
    expect(saveButton()).toBeEnabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["ensure_workout_library_references"]);
    expect(rows.get("cycle-a")).toEqual(sourceRows("cycle-a"));
    expect(rows.get("cycle-b")).toEqual(sourceRows("cycle-b"));
  }, 20000);
});
