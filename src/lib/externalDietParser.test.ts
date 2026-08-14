import { describe, expect, it } from "vitest";
import {
  buildExternalNutritionDocument,
  extractExternalNutritionTargets,
  parseExternalDietText,
  sanitizeExternalMeals,
} from "../../supabase/functions/ai-nutrition-meals/external-plan";

describe("external diet parser", () => {
  it("reconhece cabeçalhos acentuados como Café da manhã e Almoço", () => {
    const meals = parseExternalDietText([
      "CAFÉ DA MANHÃ",
      "ovos e pão",
      "ALMOÇO",
      "arroz, feijão e frango",
    ].join("\n"), 4);

    expect(meals.map((meal) => meal.meal)).toEqual(["Café da manhã", "Almoço"]);
    expect(meals[0].eat).toContain("ovos e pão");
  });

  it("preserva cardápios extensos sem truncar em dez itens", () => {
    const items = Array.from({ length: 16 }, (_, index) => `opção ${index + 1}`);
    const meals = sanitizeExternalMeals(parseExternalDietText(["ALMOÇO", ...items, "JANTAR", "sopa"].join("\n"), 4));

    expect(meals[0].eat).toHaveLength(16);
  });

  it("preserva texto, nome do arquivo e linhas sem deduplicar", () => {
    const raw = "ALMOÇO\n100G DE ARROZ\n100G DE ARROZ\nOBS: NÃO SUBSTITUIR";
    const document = buildExternalNutritionDocument(raw, "Plano Nutri.pdf");

    expect(document.raw_text).toBe(raw);
    expect(document.source_file_name).toBe("Plano Nutri.pdf");
    expect(document.meals[0].source_lines).toEqual([
      "100G DE ARROZ",
      "100G DE ARROZ",
      "OBS: NÃO SUBSTITUIR",
    ]);
  });

  it("extrai apenas metas explicitamente informadas", () => {
    const targets = extractExternalNutritionTargets([
      "META: 2100 KCAL",
      "PROTEÍNA: 140G",
      "CARBOIDRATOS: 230G",
      "GORDURAS: 65G",
      "FIBRAS: 30G",
      "CONSUMIR 35ML POR KG",
      "ALMOÇO",
      "120G DE FRANGO",
    ].join("\n"));

    expect(targets).toMatchObject({
      calories_kcal: 2100,
      protein_g: 140,
      carbs_g: 230,
      fat_g: 65,
      fiber_g: 30,
      water_ml_per_kg: 35,
    });
    expect(targets.water_ml).toBeNull();
  });
});
