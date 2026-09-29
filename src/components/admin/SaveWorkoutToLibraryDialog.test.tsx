import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveWorkoutToLibraryDialog, type SaveWorkoutToLibraryDialogProps } from "./SaveWorkoutToLibraryDialog";

const mocks = vi.hoisted(() => ({ from: vi.fn(), range: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn(), getSession: vi.fn(), toast: vi.fn(), or: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, auth: { getSession: mocks.getSession } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

const workouts = [
  { id: "row-a", updated_at: "old-a", title: "Treino A", exercises: [{ exercise_id: "exercise-a", exercise_name: "Agachamento", sets: "3", mfit_protocol: { sequence: [1, 2] } }] },
  { id: "row-b", updated_at: "old-b", title: "Treino B", exercises: [{ exercise_id: "exercise-b", exercise_name: "Remada", sets: "4" }] },
];
const props = (): SaveWorkoutToLibraryDialogProps => ({ open: true, onOpenChange: vi.fn(), workouts: structuredClone(workouts), companyId: "company-a", createdBy: "user-a", defaultName: "Plano sintético" });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const clickSave = () => fireEvent.click(screen.getByRole("button", { name: "Salvar na biblioteca" }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  mocks.range.mockResolvedValue({ data: [{ id: "exercise-a", name: "Agachamento", company_id: "company-a" }, { id: "exercise-b", name: "Remada", is_global: true }], error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user-a" } } }, error: null });
  const catalog = { select: vi.fn(), order: vi.fn(), or: mocks.or, range: mocks.range };
  catalog.select.mockReturnValue(catalog); catalog.order.mockReturnValue(catalog); mocks.or.mockReturnValue(catalog);
  const template = { insert: mocks.insert, select: vi.fn(), maybeSingle: mocks.maybeSingle };
  mocks.insert.mockReturnValue(template); template.select.mockReturnValue(template);
  mocks.maybeSingle.mockImplementation(async () => ({ data: { id: mocks.insert.mock.calls[0][0].id, company_id: "company-a" }, error: null }));
  mocks.from.mockImplementation((table) => {
    if (table === "exercise_library") return catalog;
    if (table === "workout_templates") return template;
    throw new Error(`Unexpected table ${table}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("SaveWorkoutToLibraryDialog", () => {
  it("salva plano completo nomeado com ACK positivo sem alterar o rascunho", async () => {
    const original = props();
    const before = structuredClone(original.workouts);
    render(<SaveWorkoutToLibraryDialog {...original} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Salvar na biblioteca");
    fireEvent.change(screen.getByLabelText("Nome na biblioteca"), { target: { value: "  Plano completo  " } });
    clickSave();
    await waitFor(() => expect(original.onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const payload = mocks.insert.mock.calls[0][0];
    expect(payload).toMatchObject({ company_id: "company-a", created_by: "user-a", name: "Plano completo", is_public: false, is_official: false });
    expect(payload.workouts.map((item) => item.title)).toEqual(["Treino A", "Treino B"]);
    expect(payload.workouts[0]).not.toHaveProperty("id");
    expect(payload.workouts[0]).not.toHaveProperty("updated_at");
    expect(payload.workouts[0].exercises[0].mfit_protocol).toEqual({ sequence: [1, 2] });
    expect(original.workouts).toEqual(before);
  });

  it("inicializa B e valida apenas B mesmo se A estiver inválido", async () => {
    const original = { ...props(), initialWorkoutIndex: 1, workouts: [{ ...workouts[0], exercises: [] }, workouts[1]] };
    render(<SaveWorkoutToLibraryDialog {...original} />);
    expect(screen.getByRole("radio", { name: "Treino específico" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Treino" })).toHaveValue("1");
    clickSave();
    await waitFor(() => expect(original.onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.insert.mock.calls[0][0].workouts.map((item) => item.title)).toEqual(["Treino B"]);
  });

  it("seleciona A via picker sem salvar B", async () => {
    render(<SaveWorkoutToLibraryDialog {...props()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Treino específico" }));
    fireEvent.change(screen.getByLabelText("Treino", { exact: true }), { target: { value: "0" } });
    clickSave();
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    expect(mocks.insert.mock.calls[0][0].workouts.map((item) => item.title)).toEqual(["Treino A"]);
  });

  it("mostra fallback para título malformado sem impedir a cópia de outro treino válido", async () => {
    const malformed = [workouts[0], { ...workouts[1], title: { invalid: true }, name: ["invalid"] }] as unknown as SaveWorkoutToLibraryDialogProps["workouts"];
    render(<SaveWorkoutToLibraryDialog {...props()} workouts={malformed} initialWorkoutIndex={0} />);
    expect(screen.getByRole("option", { name: "Treino 2" })).toBeInTheDocument();
    clickSave();
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    expect(mocks.insert.mock.calls[0][0].workouts.map((item) => item.title)).toEqual(["Treino A"]);
  });

  it("mantém a versão malformada legível e bloqueia sua cópia sem escrever", async () => {
    const malformed = [{ ...workouts[0], title: { invalid: true } }] as unknown as SaveWorkoutToLibraryDialogProps["workouts"];
    render(<SaveWorkoutToLibraryDialog {...props()} workouts={malformed} initialWorkoutIndex={0} />);
    expect(screen.getByRole("option", { name: "Treino 1" })).toBeInTheDocument();
    clickSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("texto inválido");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("mantém plano inválido aberto sem insert", async () => {
    const original = { ...props(), workouts: [{ ...workouts[0], exercises: [] }] };
    render(<SaveWorkoutToLibraryDialog {...original} />);
    clickSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("não possui exercícios");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(original.onOpenChange).not.toHaveBeenCalled();
  });

  it.each(["null", "wrong-id", "wrong-company", "error"])("não anuncia sucesso com ACK %s", async (kind) => {
    mocks.maybeSingle.mockImplementation(async () => ({
      data: kind === "null" ? null : { id: kind === "wrong-id" ? "wrong" : mocks.insert.mock.calls[0][0].id, company_id: kind === "wrong-company" ? "other" : "company-a" },
      error: kind === "error" ? { message: "db error" } : null,
    }));
    const original = props();
    render(<SaveWorkoutToLibraryDialog {...original} />);
    clickSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("Salvamento não confirmado");
    expect(screen.getByLabelText("Nome na biblioteca")).toHaveValue(original.defaultName);
    expect(original.onOpenChange).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("impede cliques duplicados enquanto catálogo está pendente", async () => {
    const pending = deferred<{ data: unknown[]; error: null }>();
    mocks.range.mockReturnValue(pending.promise);
    render(<SaveWorkoutToLibraryDialog {...props()} />);
    const button = screen.getByRole("button", { name: "Salvar na biblioteca" });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.range).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: [{ id: "exercise-a", name: "Agachamento", company_id: "company-a" }, { id: "exercise-b", name: "Remada", is_global: true }], error: null }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
  });

  it("mantém seleção e nome após falha de transporte no insert", async () => {
    mocks.maybeSingle.mockRejectedValue(new Error("Falha sintética de transporte"));
    const original = { ...props(), initialWorkoutIndex: 1 };
    render(<SaveWorkoutToLibraryDialog {...original} />);
    clickSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha sintética de transporte");
    expect(screen.getByLabelText("Nome na biblioteca")).toHaveValue(original.defaultName);
    expect(screen.getByRole("combobox", { name: "Treino" })).toHaveValue("1");
    expect(screen.getByRole("button", { name: "Salvar na biblioteca" })).toBeEnabled();
    expect(original.onOpenChange).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it.each(["company", "user", "snapshot", "closed", "aba"])("descarta carga obsoleta após troca de %s", async (change) => {
    const pending = deferred<{ data: unknown[] }>();
    mocks.range.mockReturnValue(pending.promise);
    const original = props();
    const view = render(<SaveWorkoutToLibraryDialog {...original} />);
    clickSave();
    const next = { ...original,
      ...(change === "company" || change === "aba" ? { companyId: "company-b" } : {}),
      ...(change === "user" ? { createdBy: "user-b" } : {}),
      ...(change === "snapshot" ? { workouts: [{ ...workouts[0], title: "Outra versão" }] } : {}),
      ...(change === "closed" ? { open: false } : {}),
    };
    view.rerender(<SaveWorkoutToLibraryDialog {...next} />);
    if (change === "aba") view.rerender(<SaveWorkoutToLibraryDialog {...original} />);
    await act(async () => pending.resolve({ data: [{ id: "exercise-a", name: "Agachamento", company_id: "company-a" }] }));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("descarta carga após desmontagem", async () => {
    const pending = deferred<{ data: unknown[] }>(); mocks.range.mockReturnValue(pending.promise);
    const view = render(<SaveWorkoutToLibraryDialog {...props()} />);
    clickSave(); view.unmount();
    await act(async () => pending.resolve({ data: [] }));
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("não usa resposta de insert antigo para fechar o novo escopo", async () => {
    const pending = deferred<{ data: unknown; error: null }>(); mocks.maybeSingle.mockReturnValue(pending.promise);
    const original = props(); const view = render(<SaveWorkoutToLibraryDialog {...original} />);
    clickSave(); await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    const payload = mocks.insert.mock.calls[0][0];
    view.rerender(<SaveWorkoutToLibraryDialog {...original} companyId="company-b" defaultName="Novo escopo" />);
    await act(async () => pending.resolve({ data: { id: payload.id, company_id: "company-a" }, error: null }));
    expect(payload.company_id).toBe("company-a");
    expect(original.onOpenChange).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome na biblioteca")).toHaveValue("Novo escopo");
  });

  it("rejeita sessão de outro usuário antes do insert", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "other" } } } });
    render(<SaveWorkoutToLibraryDialog {...props()} />); clickSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("sessão mudou"); expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("trata falha de catálogo e desbloqueia controles", async () => {
    mocks.range.mockRejectedValue(new Error("Falha sintética"));
    render(<SaveWorkoutToLibraryDialog {...props()} />); clickSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha sintética");
    expect(screen.getByRole("button", { name: "Salvar na biblioteca" })).toBeEnabled(); expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("não permite nome vazio ou escrita global/sem usuário", () => {
    const original = props(); const view = render(<SaveWorkoutToLibraryDialog {...original} companyId={null} />);
    expect(screen.getByRole("button", { name: "Salvar na biblioteca" })).toBeDisabled();
    view.rerender(<SaveWorkoutToLibraryDialog {...original} createdBy={null} />);
    expect(screen.getByRole("button", { name: "Salvar na biblioteca" })).toBeDisabled();
    view.rerender(<SaveWorkoutToLibraryDialog {...original} />);
    fireEvent.change(screen.getByLabelText("Nome na biblioteca"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Salvar na biblioteca" })).toBeDisabled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
