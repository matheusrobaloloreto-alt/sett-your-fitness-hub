import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { EditorialPageHeader } from "./EditorialPageHeader";
import { EditorialTabStrip } from "./EditorialTabStrip";

const tabs = [
  { value: "overview", label: "Visão Geral" },
  { value: "program", label: "Programa" },
  { value: "anamnesis", label: "Anamnese" },
  { value: "evaluations", label: "Avaliações" },
  { value: "financial", label: "Financeiro" },
  { value: "analytics", label: "Análises" },
];

describe("editorial visual primitives", () => {
  it("renders a mobile-safe page header without truncating the full title", () => {
    render(
      <EditorialPageHeader
        overline="Aluno"
        title="ALDYLAYNE RODRIGUES DOS SANTOS"
        context="Detalhe do aluno"
        actions={<button type="button">Editar</button>}
      />,
    );

    const heading = screen.getByRole("heading", { name: "ALDYLAYNE RODRIGUES DOS SANTOS" });
    expect(heading).toHaveClass("break-words");
    expect(heading.className).not.toMatch(/\btruncate\b/);
    expect(heading).toHaveAttribute("title", "ALDYLAYNE RODRIGUES DOS SANTOS");
    expect(screen.getByRole("region", { name: "Ações da página" })).toBeInTheDocument();
  });

  it("renders complete editorial tabs with accessible labels and horizontal overflow", () => {
    render(
      <Tabs defaultValue="overview">
        <EditorialTabStrip tabs={tabs} ariaLabel="Seções do aluno" onValueChange={vi.fn()} />
      </Tabs>,
    );

    const tablist = screen.getByRole("tablist", { name: "Seções do aluno" });
    expect(tablist).toHaveClass("overflow-x-auto");
    expect(tablist).toHaveClass("snap-x");
    expect(tablist).toHaveClass("scroll-px-4");

    for (const tab of tabs) {
      const trigger = screen.getByRole("tab", { name: tab.label });
      expect(trigger).toHaveTextContent(tab.label);
      expect(trigger).toHaveClass("min-h-11");
      expect(trigger.className).not.toMatch(/\btruncate\b/);
    }
  });
});
