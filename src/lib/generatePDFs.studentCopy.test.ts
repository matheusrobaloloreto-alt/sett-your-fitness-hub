import { describe, expect, it } from "vitest";
import { generateCardioPDF } from "./generatePDFs";

const META = { studentName: "Aluno Teste", date: "2026-08-25", professional: "Prof. BN" };

function renderedText(run: () => ReturnType<typeof generateCardioPDF>) {
  return run().internal.pages.flat().join(" ");
}

describe("student-facing cardio PDF copy", () => {
  it("translates RIR in weekly focus, summary, session notes and guidance", () => {
    const text = renderedText(() => generateCardioPDF({
      model: "Polarizado",
      duration_weeks: 4,
      safety_check: { restrictions: ["Evite RIR 1"] },
      weeks: [{
        week_number: 1,
        focus: "Base com RIR 3-4",
        resumo: "Feche em RIR 3",
        sessions: [{ day: "Segunda", title: "Corrida leve", notes: "Mantenha RIR 3" }],
      }],
      complementary_strength: ["Agachamento em RIR 2-3"],
      nutrition_alert: "Reforce após sessão em RIR 2",
      general_tips: "Use RIR como referência",
      warnings: ["Interrompa se RIR não refletir o esforço"],
    }, META, "Corrida"));

    expect(text).not.toMatch(/\bRIR\b/i);
    expect(text).toContain("Repetições restantes: 3-4");
    expect(text).toContain("repetições restantes como referência");
  });

  it("translates RIR in the representative-week fallback", () => {
    const text = renderedText(() => generateCardioPDF({
      model: "Contínuo",
      duration_weeks: 2,
      sample_week: [{ day: "Sábado", workout: "Pedal contínuo em RIR 3" }],
    }, META, "Ciclismo"));

    expect(text).not.toMatch(/\bRIR\b/i);
    expect(text).toContain("Repetições restantes: 3");
  });
});
