import { lazy, Suspense, useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("route load failure containment", () => {
  it("keeps navigation and a conversation draft mounted when a lazy route fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unmountChat = vi.fn();
    const loadAgenda = vi.fn().mockRejectedValue(new TypeError(
      "Failed to fetch dynamically imported module: https://example.test/assets/Agenda-missing.js",
    ));
    const Agenda = lazy(loadAgenda);
    function Conversation() {
      const [draft, setDraft] = useState("");
      useEffect(() => unmountChat, []);
      return <label>Mensagem em edição<input value={draft} onChange={event => setDraft(event.target.value)} /></label>;
    }
    function Shell() {
      const location = useLocation();
      return <>
        <nav><Link to="/agenda">Agenda</Link><Link to="/alunos">Alunos</Link></nav>
        <Conversation />
        <ErrorBoundary scope="section" resetKey={`${location.pathname}${location.search}`}>
          <Suspense fallback={<p>Carregando</p>}><Outlet /></Suspense>
        </ErrorBoundary>
      </>;
    }
    render(<MemoryRouter initialEntries={["/alunos"]}><Routes><Route element={<Shell />}>
      <Route path="/alunos" element={<h1>Lista de alunos</h1>} />
      <Route path="/agenda" element={<Agenda />} />
    </Route></Routes></MemoryRouter>);

    fireEvent.change(screen.getByLabelText("Mensagem em edição"), { target: { value: "Rascunho preservado" } });
    fireEvent.click(screen.getByRole("link", { name: "Agenda" }));
    expect(await screen.findByRole("heading", { name: "Não foi possível abrir esta tela" })).toBeVisible();
    expect(screen.getByRole("navigation")).toBeVisible();
    expect(screen.getByLabelText("Mensagem em edição")).toHaveValue("Rascunho preservado");
    expect(screen.getByRole("button", { name: "Recarregar esta tela" })).toBeVisible();
    expect(unmountChat).not.toHaveBeenCalled();
    expect(loadAgenda).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("link", { name: "Alunos" }));
    expect(await screen.findByRole("heading", { name: "Lista de alunos" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mensagem em edição")).toHaveValue("Rascunho preservado");
    expect(unmountChat).not.toHaveBeenCalled();
  });

  it("does not reset a healthy editor when the route query changes", () => {
    function Editor() {
      const [value, setValue] = useState("");
      return <label>Observações<input value={value} onChange={event => setValue(event.target.value)} /></label>;
    }
    const view = render(<ErrorBoundary scope="section" resetKey="/aluno?tab=treino"><Editor /></ErrorBoundary>);
    fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "Em edição" } });
    view.rerender(<ErrorBoundary scope="section" resetKey="/aluno?tab=cadastro"><Editor /></ErrorBoundary>);
    expect(screen.getByLabelText("Observações")).toHaveValue("Em edição");
  });

  it("keeps persistent failures bounded without reloading or re-rendering the failed child repeatedly", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Crash = vi.fn(() => { throw new Error("Ocorreu uma falha no formulário"); });
    const view = render(<ErrorBoundary scope="section" resetKey="same"><Crash /></ErrorBoundary>);
    const attempts = Crash.mock.calls.length;
    view.rerender(<ErrorBoundary scope="section" resetKey="same"><Crash /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Ocorreu uma falha no formulário");
    expect(Crash).toHaveBeenCalledTimes(attempts);
  });
});
