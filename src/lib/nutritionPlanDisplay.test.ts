import { describe, expect, it } from "vitest";
import {
  humanizeNutritionText,
  prepareImportedNutritionPlan,
  selectCurrentNutritionPlan,
} from "@/lib/nutritionPlanDisplay";

const importedMeals = [
  {
    meal: "Refeição 1",
    focus: "Cardápio informado pelo nutricionista",
    eat: [
      "PLANO ALIMENTAR ALESSANDRA DE SOUZA 29/07/2026",
      "DIARIAMENTE:",
      "BEBER 500ML DE ÁGUA EM TEMPERATURA AMBIENTE",
      "AO LONGO DO DIA:",
      "CONSUMIR NO MÍNIMO 35ML DE ÁGUA POR QUILO DE PESO",
      "CAFÉ DA MANHÃ",
      "ESCOLHER UMA DAS OPÇÕES ABAIXO:",
      "1 UN. DE PÃO FRANCÊS OU",
      "OU",
      "1 FATIA (40G) DE PÃO DE FERMENTAÇÃO NATURAL",
    ],
  },
  {
    meal: "ALMOÇO",
    eat: [
      "FONTES DE PROTEÍNA",
      "CARNE DE FRANGO",
      "VERDURAS: ALFACE, COUVE, RÚCULA, ESPINAFRE, AGRIÃO, ESCAROLA",
    ],
  },
];

describe("prepareImportedNutritionPlan", () => {
  it("separa as orientações gerais do café da manhã sem reescrever o PDF", () => {
    const result = prepareImportedNutritionPlan(importedMeals);

    expect(result.overview).toEqual([
      "DIARIAMENTE:",
      "BEBER 500ML DE ÁGUA EM TEMPERATURA AMBIENTE",
      "AO LONGO DO DIA:",
      "CONSUMIR NO MÍNIMO 35ML DE ÁGUA POR QUILO DE PESO",
    ]);
    expect(result.meals[0].meal).toBe("Café da manhã");
    expect(result.meals[0].focus).toBeNull();
  });

  it("diferencia títulos, escolhas, detalhes longos e separadores", () => {
    const result = prepareImportedNutritionPlan(importedMeals);

    expect(result.meals[0].items.map((item) => item.kind)).toEqual(["heading", "choice", "separator", "choice"]);
    expect(result.meals[1].items.map((item) => item.kind)).toEqual(["heading", "choice", "detail"]);
  });

  it("preserva caixa, unidades e pontuação do nutricionista", () => {
    expect(humanizeNutritionText("BEBER 500ML DE ÁGUA E 20G DE CASTANHAS")).toBe("BEBER 500ML DE ÁGUA E 20G DE CASTANHAS");
  });

  it("prioriza o documento de origem e mantém texto e arquivo auditáveis", () => {
    const result = prepareImportedNutritionPlan(importedMeals, {
      raw_text: "ALMOÇO\n80G DE ARROZ",
      source_file_name: "cardapio-original.pdf",
      overview: ["ORIENTAÇÃO EXATA"],
      meals: [{ meal: "ALMOÇO", source_lines: ["80G DE ARROZ"] }],
    });

    expect(result.sourceFileName).toBe("cardapio-original.pdf");
    expect(result.rawText).toBe("ALMOÇO\n80G DE ARROZ");
    expect(result.overview).toEqual(["ORIENTAÇÃO EXATA"]);
    expect(result.meals[0].items[0].text).toBe("80G DE ARROZ");
  });

  it("define um único plano vigente por status, datas e recência", () => {
    const current = selectCurrentNutritionPlan([
      { status: "inactive", start_date: "2026-08-10", created_at: "2026-08-10T12:00:00Z" },
      { status: "active", start_date: "2026-07-01", created_at: "2026-08-12T12:00:00Z" },
      { status: "active", start_date: "2026-08-01", created_at: "2026-08-11T12:00:00Z" },
      { status: "active", start_date: "2026-09-01", created_at: "2026-08-14T12:00:00Z" },
    ], "2026-08-14");

    expect(current).toMatchObject({ start_date: "2026-08-01" });
  });

  it("não exibe plano inativo e só usa registro sem status como legado", () => {
    expect(selectCurrentNutritionPlan([
      { status: "inactive", start_date: "2026-08-01" },
      { status: null, start_date: null, created_at: "2026-07-01T12:00:00Z" },
    ], "2026-08-14")).toMatchObject({ status: null });
    expect(selectCurrentNutritionPlan([
      { status: "inactive", start_date: "2026-08-01" },
    ], "2026-08-14")).toBeNull();
  });
});
