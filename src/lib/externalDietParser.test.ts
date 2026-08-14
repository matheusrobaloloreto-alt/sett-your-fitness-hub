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
      "PROTEÍNA: 120G DE FRANGO",
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

  it("não confunde porção de alimento com meta diária", () => {
    const targets = extractExternalNutritionTargets([
      "ALMOÇO",
      "PROTEÍNA: 120G DE FRANGO",
      "CARBOIDRATO: 80G DE ARROZ",
      "GORDURA: 10G DE AZEITE",
    ].join("\n"));

    expect(targets).toMatchObject({
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    });
  });

  it("registra a evidência da meta e preserva overview mesmo com linhas em branco", () => {
    const document = buildExternalNutritionDocument([
      "META DIÁRIA: PROTEÍNA 135G",
      "",
      "ORIENTAÇÃO SEM ALTERAÇÃO",
      "",
      "ALMOÇO",
      "80G DE ARROZ",
    ].join("\n"), "plano.pdf");

    expect(document.overview).toEqual(["META DIÁRIA: PROTEÍNA 135G", "ORIENTAÇÃO SEM ALTERAÇÃO"]);
    expect(document.target_evidence.protein_g).toBe("META DIÁRIA: PROTEÍNA 135G");
  });
});
