import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BnContentSetup } from "./BnContentSetup";
import { BN_CONTENT_DEFAULT_SPEC } from "../../../supabase/functions/_shared/bnContent";
afterEach(cleanup);
describe("reference selection", () => {
  const props = { onChange: vi.fn(), onUpload: vi.fn(), onReference: vi.fn(), onDocument: vi.fn(), assets: {} };
  it("applies only individually selected criteria across references", () => {
    render(<BnContentSetup {...props} spec={{ ...BN_CONTENT_DEFAULT_SPEC, references: [
      { id: "a", url: "", criteria: ["font"], design: { font: "serif", background: "#000000" } },
      { id: "b", url: "", criteria: ["background"], design: { background: "#ffffff", font: "sans" } },
    ] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar critérios selecionados" }));
    expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ design: { font: "serif", background: "#ffffff" } }));
  });
  it("blocks conflicting references instead of silently picking the last", () => {
    render(<BnContentSetup {...props} spec={{ ...BN_CONTENT_DEFAULT_SPEC, references: [
      { id: "a", url: "", criteria: ["font"], design: { font: "serif" } },
      { id: "b", url: "", criteria: ["font"], design: { font: "sans" } },
    ] }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Conflitos em Fonte");
    expect(screen.getByRole("button", { name: "Aplicar critérios selecionados" })).toBeDisabled();
  });
  it("requires clarification when extraction cannot identify a selected criterion", () => {
    render(<BnContentSetup {...props} spec={{ ...BN_CONTENT_DEFAULT_SPEC, references: [
      { id: "a", url: "", criteria: ["font"], design: { background: "#ffffff" } },
    ] }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Referência 1: Fonte");
    expect(screen.getByRole("button", { name: "Aplicar critérios selecionados" })).toBeDisabled();
  });
});
