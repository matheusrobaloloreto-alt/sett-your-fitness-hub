import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrescriptionStudio from "./PrescriptionStudio";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn(), rpc: vi.fn(), operatorId: "operator" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke },
} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: mocks.operatorId }, companyId: "company", role: "trainer", loading: false,
}) }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock("@/lib/companyAiConfig", () => ({ useCompanyAiConfig: () => ({ config: {} }) }));
vi.mock("@/components/BnitoFloatingAssistant", () => ({ BnitoContextButton: () => null }));
vi.mock("@/components/VideoAssessment", () => ({ default: () => null }));
vi.mock("@/lib/businessDate", () => ({ businessDateYmd: () => "2026-11-07" }));

const enrollment = {
  id: "enrollment", student_id: "student", company_id: "company",
  status: "active", start_date: "2026-10-26", end_date: "2026-12-06",
  plans: { duration_days: 42, cycle_duration_days: 42 },
};
const cycle = {
  id: "cycle", enrollment_id: enrollment.id, student_id: "student", company_id: "company",
  cycle_number: 1, start_date: enrollment.start_date, end_date: enrollment.end_date, status: "pending",
};
const winner = {
  id: "stored-winner", updated_at: "2026-11-07T12:00:00Z", draft_only: true,
  plan: { cycle_name: "Força QA", workouts: [] },
};
const disconnected = () => ({ data: null, error: new FunctionsFetchError(new TypeError("offline")) });
const success = { data: winner, error: null };
type Row = Record<string, unknown>;
let bundleWrites: { insert?: Row; update?: Row }[];
let committedWinner: boolean;
let publishedWinner: boolean;
let bundleStatus: string;
let notes: string;
let historyError: Error | null;

function queryFor(table: string) {
  const filters = new Map<string, unknown>();
  let write: Row | undefined;
  const result = (one = false) => {
    let data: unknown = one ? null : [];
    switch (table) {
      case "students": data = [{ id: "student", full_name: "Aluno QA" }]; break;
      case "student_anamneses": data = { id: "anamnese", notes, wants_strength: true }; break;
      case "enrollments": data = [enrollment]; break;
      case "training_cycles": data = [cycle]; break;
      case "prescription_bundles":
        if (write) data = { id: filters.get("id") };
        else if (one && filters.get("id") === bundleWrites[0]?.insert?.id) data = {
          id: filters.get("id"), status: bundleStatus, studio_strength_draft: !publishedWinner,
          studio_strength_snapshot: { start_date: cycle.start_date, end_date: cycle.end_date, bundle_id: null },
        };
        break;
      case "ai_strength_plans":
        if (one && committedWinner && filters.get("bundle_id") === bundleWrites[0]?.insert?.id) {
          data = publishedWinner
            ? { studio_publication: { cycle_id: cycle.id, bundle_id: filters.get("bundle_id") } }
            : { studio_draft_cycle_id: cycle.id };
        }
        break;
    }
    return { data, error: null };
  };
  const query = {
    select: () => query, in: () => query, is: () => query, or: () => query,
    range: () => query, limit: () => query, order: () => query, gte: () => query,
    eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
    insert: (insert: Row) => {
      if (table === "prescription_bundles") bundleWrites.push({ insert });
      return query;
    },
    update: (update: Row) => {
      if (table === "prescription_bundles") {
        bundleWrites.push({ update });
        if (update.status) bundleStatus = String(update.status);
      }
      write = update;
      return query;
    },
    maybeSingle: async () => result(true),
    single: async () => result(true),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return query;
}

async function mountStudio(label = "Gerar rascunho · ciclo 1") {
  const tree = () => (
    <MemoryRouter initialEntries={[{ pathname: "/trainer/studio", state: { tab: "prescricao", studentId: "student" } }]}>
      <PrescriptionStudio />
    </MemoryRouter>
  );
  const view = render(tree());
  const generate = await screen.findByRole("button", { name: label });
  await waitFor(() => expect(generate).toBeEnabled());
  return { ...view, generate, refresh: () => view.rerender(tree()) };
}

async function mountStudioWithPending() {
  const { generate } = await mountStudio("Consultar rascunho pendente · ciclo 1");
  fireEvent.click(generate);
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.from.mockClear();
  mocks.operatorId = "operator";
  bundleWrites = [];
  committedWinner = false;
  bundleStatus = "generating";
  notes = "contexto sensível sintético";
  publishedWinner = false;
  historyError = null;
  mocks.from.mockImplementation((table: string) => {
    if (table === "running_plans" && historyError) throw historyError;
    return queryFor(table);
  });
  mocks.invoke.mockReset().mockResolvedValue(success);
  mocks.rpc.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Studio strength generation", { timeout: 30_000 }, () => {
  it("coalesces two same-render clicks, then reuses the exact request after connection loss", async () => {
    const { generate } = await mountStudio();
    mocks.invoke.mockResolvedValueOnce(disconnected());
    act(() => {
      generate.click();
      generate.click();
    });
    const retry = await screen.findByRole("button", { name: "Retentar musculação · ciclo 1" });
    expect(bundleWrites.filter(({ insert }) => insert)).toHaveLength(1);
    expect(bundleWrites.some(({ update }) => update?.status === "failed")).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await screen.findByRole("button", { name: "Revisar rascunho · ciclo 1" });
    expect(mocks.invoke.mock.calls[1]).toEqual(mocks.invoke.mock.calls[0]);

    fireEvent.click(generate);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(3));
    expect(bundleWrites.filter(({ insert }) => insert)).toHaveLength(2);
    expect(mocks.invoke.mock.calls[2][1].body.bundle_id).not.toBe(mocks.invoke.mock.calls[0][1].body.bundle_id);
  });

  it("recovers the stored winner after reload without saving the generation body in session storage", async () => {
    const { generate, unmount } = await mountStudio();
    mocks.invoke.mockImplementationOnce(async () => {
      committedWinner = true;
      return disconnected();
    });
    fireEvent.click(generate);
    await screen.findByRole("button", { name: "Retentar musculação · ciclo 1" });
    expect(Object.values(sessionStorage).join("")).not.toContain(notes);
    unmount();
    await mountStudioWithPending();
    await screen.findByRole("button", { name: "Revisar rascunho · ciclo 1" });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls[1]).toEqual(["ai-prescribe-workout", { body: {
      student_id: "student", company_id: "company", bundle_id: bundleWrites[0].insert?.id,
      training_cycle_id: "cycle", draft_only: true, recover_draft_only: true,
      expected_cycle_start: cycle.start_date, expected_cycle_end: cycle.end_date,
    } }]);
    expect(bundleWrites.filter(({ insert }) => insert)).toHaveLength(1);
    expect(bundleStatus).toBe("draft");
    expect(sessionStorage.length).toBe(0);
  });

  it("retries only the strength request in mixed generation, once, with its original body", async () => {
    await mountStudio();
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError({ status: 503 }) })
      .mockResolvedValueOnce(success).mockResolvedValueOnce({
      data: { id: "running", draft_only: true, updated_at: winner.updated_at, plan: { weeks: [] } }, error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /Corrida Zonas/ }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho integrado/ }));
    await waitFor(() => expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual([
      "ai-prescribe-workout", "ai-prescribe-workout", "ai-running-plan",
    ]), { timeout: 5_000 });
    expect(mocks.invoke.mock.calls[1]).toEqual(mocks.invoke.mock.calls[0]);
    await screen.findByRole("button", { name: "Revisar rascunho · ciclo 1" });
  });

  it("generates every modality privately and publishes only through the complete bundle RPC", async () => {
    await mountStudio();
    const version = winner.updated_at;
    const strength = { ...winner, plan: { workouts: [{ name: "Força", exercises: [{ exercise_name: "Agachamento", exercise_id: "lib" }] }] } };
    const modalities = ["corrida", "ciclismo", "natacao", "nutricao"];
    mocks.invoke.mockImplementation(async (name, { body }) => name === "ai-prescribe-workout"
      ? { data: strength, error: null }
      : { data: { id: body.sport || "nutricao", updated_at: version, draft_only: true, plan: { weeks: [], meals: [] } }, error: null });
    for (const label of ["Corrida", "Ciclismo", "Natação", "Nutrição"]) {
      fireEvent.click(screen.getByText(label, { exact: true }));
    }
    fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho integrado/ }));
    const publish = await screen.findByRole("button", { name: /Publicar pacote completo/ });
    expect(screen.queryByRole("button", { name: /Publicar musculação/ })).not.toBeInTheDocument();
    expect(bundleWrites[0].insert).toMatchObject({ studio_strength_draft: true, studio_modalities_draft: true, status: "generating" });
    expect(bundleWrites.map(write => write.update).filter(Boolean)).toEqual([{ status: "draft", generation_error: null }]);
    expect(mocks.invoke.mock.calls).toHaveLength(5);
    expect(mocks.invoke.mock.calls.every(([, { body }]) => body.draft_only === true
      && body.bundle_id === bundleWrites[0].insert?.id && body.training_cycle_id === cycle.id)).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();

    const versions = Object.fromEntries(modalities.map(id => [id, { id, updated_at: version }]));
    mocks.rpc.mockResolvedValueOnce({ data: {
      cycle_id: cycle.id, bundle_id: bundleWrites[0].insert?.id, strength_plan_id: strength.id,
      revision_id: "revision", workouts_created: 1, modalities: versions, current: true, replayed: true,
    }, error: null });
    fireEvent.click(publish);
    await screen.findByText("Pacote completo publicado para o ciclo.");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("publish_studio_integrated_bundle", expect.objectContaining({
      p_bundle_id: bundleWrites[0].insert?.id, p_cycle_id: cycle.id, p_draft_id: strength.id, p_expected_modalities: versions,
    }));
  }, 90_000);

  it("does not finalize or offer publication for an unconfirmed modality", async () => {
    await mountStudio();
    mocks.invoke.mockResolvedValueOnce(success).mockResolvedValueOnce({
      data: { id: "legacy-running", updated_at: winner.updated_at, plan: { weeks: [] } }, error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /Corrida Zonas/ }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho integrado/ }));
    await screen.findByText("O servidor não confirmou o rascunho de corrida.");
    expect(bundleWrites.some(({ update }) => update?.status === "draft")).toBe(false);
    expect(screen.queryByRole("button", { name: /Publicar/ })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows a definitive rejection without offering a transport retry", async () => {
    const { generate } = await mountStudio();
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError({
      status: 422, json: async () => ({ error: "Ciclo bloqueado pela validação." }),
    }) });
    fireEvent.click(generate);
    await screen.findByText("Ciclo bloqueado pela validação.");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Retentar musculação/ })).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });

  it("keeps a recovered draft pending when read-only Edge recovery rejects its clinical gate", async () => {
    const { generate, unmount } = await mountStudio();
    committedWinner = true;
    mocks.invoke.mockResolvedValueOnce(disconnected()).mockResolvedValueOnce({
      data: null, error: new FunctionsHttpError({
        status: 409, json: async () => ({ error: "Dor acima de EVA 5 exige handoff." }),
      }),
    });
    fireEvent.click(generate);
    await screen.findByRole("button", { name: "Retentar musculação · ciclo 1" });
    unmount();
    await mountStudioWithPending();
    await screen.findByText("Dor acima de EVA 5 exige handoff.");
    expect(screen.queryByRole("button", { name: /Revisar rascunho/ })).not.toBeInTheDocument();
    expect(bundleWrites.filter(({ update }) => update)).toHaveLength(0);
    expect(sessionStorage.length).toBe(1);
  });

  it.each([true, false])("publishes a reviewed draft only when the server permits it (review required: %s)", async (reviewRequired) => {
    const { generate } = await mountStudio();
    mocks.invoke.mockResolvedValueOnce({
      data: { ...winner, plan: { ...winner.plan, workouts: [
        { name: "Treino QA", exercises: [{ exercise_id: "exercise", exercise_name: "Agachamento QA", sets: 3, reps: 10 }] },
      ] } }, error: null,
    });
    fireEvent.click(generate);
    const publish = await screen.findByRole("button", { name: "Publicar musculação · ciclo 1" });
    const bundleId = bundleWrites[0].insert?.id;
    mocks.rpc.mockResolvedValueOnce(reviewRequired
      ? { data: null, error: { message: "studio_strength_intercycle_review_required" } }
      : { data: { cycle_id: cycle.id, bundle_id: bundleId, strength_plan_id: winner.id,
        revision_id: "new-revision", workouts_created: 1, scheduled: true, replayed: false }, error: null });
    fireEvent.click(publish);
    if (reviewRequired) {
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Revise a nova Anamnese interciclos com o treinador antes de publicar. O rascunho foi preservado.",
      );
      expect(publish).toBeEnabled();
      expect(screen.queryByText(/Treino agendado/)).not.toBeInTheDocument();
      expect(mocks.from).not.toHaveBeenCalledWith("ai_decision_logs");
    } else {
      await screen.findByText(/Treino agendado/);
      expect(publish).not.toBeInTheDocument();
    }
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("publish_studio_strength_draft", expect.objectContaining({
      p_draft_id: winner.id, p_cycle_id: cycle.id,
    }));
    expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual(["ai-prescribe-workout"]);
  });

  it("uses the durable publication receipt after reload and never opens a published plan as a draft", async () => {
    const { generate, unmount } = await mountStudio();
    committedWinner = true;
    publishedWinner = true;
    mocks.invoke.mockResolvedValueOnce(disconnected());
    fireEvent.click(generate);
    await screen.findByRole("button", { name: "Retentar musculação · ciclo 1" });
    unmount();
    await mountStudioWithPending();
    await screen.findByRole("button", { name: "Gerar rascunho · ciclo 1" });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(bundleWrites.filter(({ update }) => update)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Revisar rascunho/ })).not.toBeInTheDocument();
  });

  it("rejects a legacy draft_only false response and releases the lock after a thrown history query", async () => {
    const { generate } = await mountStudio();
    historyError = new Error("Histórico indisponível.");
    fireEvent.click(generate);
    await screen.findByText("Histórico indisponível.");
    expect(mocks.invoke).not.toHaveBeenCalled();

    historyError = null;
    mocks.invoke.mockResolvedValueOnce({ data: { ...winner, draft_only: false }, error: null });
    fireEvent.click(generate);
    await screen.findByText("O servidor precisa ser atualizado para confirmar o rascunho da musculação.");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Revisar rascunho/ })).not.toBeInTheDocument();
  });

  it("requires fresh intent after two unconfirmed mixed strength attempts, including after reload", async () => {
    const { unmount } = await mountStudio();
    mocks.invoke.mockResolvedValue(disconnected());
    fireEvent.click(screen.getByRole("button", { name: /Corrida Zonas/ }));
    fireEvent.click(screen.getByRole("button", { name: /Nutrição Dicas/ }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar rascunho integrado/ }));
    await screen.findByText("A resposta da musculação não foi confirmada. Confira o ciclo antes de iniciar outra geração.");
    expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual(["ai-prescribe-workout", "ai-prescribe-workout"]);
    expect(bundleWrites.filter(({ update }) => update)).toHaveLength(0);
    unmount();

    const { generate } = await mountStudio("Iniciar nova geração");
    expect(screen.queryByRole("button", { name: /Retentar musculação|Consultar rascunho pendente/ })).not.toBeInTheDocument();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(generate);
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("vai criar outro pacote"));
    expect(bundleWrites.filter(({ insert }) => insert)).toHaveLength(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);

    mocks.invoke.mockResolvedValueOnce(success);
    fireEvent.click(generate);
    await screen.findByRole("button", { name: "Revisar rascunho · ciclo 1" });
    expect(mocks.invoke.mock.calls[2][1].body.bundle_id).not.toBe(mocks.invoke.mock.calls[0][1].body.bundle_id);
    expect(bundleWrites.filter(({ insert }) => insert)).toHaveLength(2);
  }, 90_000);

  it("drops a late retry response from the previous authenticated scope", async () => {
    const { generate, refresh } = await mountStudio();
    mocks.invoke.mockResolvedValueOnce(disconnected());
    fireEvent.click(generate);
    const retry = await screen.findByRole("button", { name: "Retentar musculação · ciclo 1" });
    let finish!: (result: typeof success) => void;
    mocks.invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    fireEvent.click(retry);
    expect(screen.getByPlaceholderText("Digite ou selecione um aluno...")).toBeDisabled();
    expect(mocks.invoke).toHaveBeenCalledTimes(2);

    mocks.operatorId = "another-operator";
    refresh();
    await act(async () => { finish(success); });
    expect(screen.queryByRole("button", { name: /Revisar rascunho|Retentar musculação/ })).not.toBeInTheDocument();
    expect(bundleWrites.filter(({ update }) => update)).toHaveLength(0);
    expect(sessionStorage.length).toBe(1);
  });
});
