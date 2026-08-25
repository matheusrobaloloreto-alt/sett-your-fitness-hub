import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentMethodGroup } from "./StudentMethodGroup";

describe("StudentMethodGroup", () => {
  it("uses an accessible accordion header and preserves child state while collapsed", () => {
    render(
      <StudentMethodGroup
        blockName="Bloco 1"
        method="biset"
        instruction="Faça a dupla sem descanso."
        summary="2 exercícios em sequência"
        defaultOpen
      >
        <input aria-label="Carga da primeira série" defaultValue="20" />
      </StudentMethodGroup>,
    );

    const trigger = screen.getByRole("button", { name: /Bloco 1.*Bi-set.*Faça a dupla sem descanso/i });
    const input = screen.getByRole("textbox", { name: "Carga da primeira série" });
    fireEvent.change(input, { target: { value: "32" } });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getByRole("textbox", { name: "Carga da primeira série" })).toHaveValue("32");
  });

  it("does not wrap a normal exercise in a method accordion", () => {
    render(<StudentMethodGroup method={null}><p>Série normal</p></StudentMethodGroup>);
    expect(screen.getByText("Série normal")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
