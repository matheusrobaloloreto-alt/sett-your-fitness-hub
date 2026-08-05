import { describe, expect, it } from "vitest";
import { humanizeNutritionText, prepareImportedNutritionPlan } from "@/lib/nutritionPlanDisplay";

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
  it("separa as orientações gerais do café da manhã embutido no PDF", () => {
    const result = prepareImportedNutritionPlan(importedMeals);

    expect(result.overview).toEqual([
      "Beber 500 ml de água em temperatura ambiente",
      "Consumir no mínimo 35 ml de água por quilo de peso",
    ]);
    expect(result.meals[0].meal).toBe("Café da manhã");
    expect(result.meals[0].focus).toBeNull();
  });

  it("diferencia títulos, escolhas, detalhes longos e separadores", () => {
    const result = prepareImportedNutritionPlan(importedMeals);

    expect(result.meals[0].items.map((item) => item.kind)).toEqual(["heading", "choice", "separator", "choice"]);
    expect(result.meals[1].items.map((item) => item.kind)).toEqual(["heading", "choice", "detail"]);
  });

  it("normaliza caixa alta e unidades sem mudar o conteúdo", () => {
    expect(humanizeNutritionText("BEBER 500ML DE ÁGUA E 20G DE CASTANHAS")).toBe("Beber 500 ml de água e 20 g de castanhas");
  });
});
