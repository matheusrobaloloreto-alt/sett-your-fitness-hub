import { describe, expect, it } from "vitest";
import { parseExternalDietText, sanitizeExternalMeals } from "../../supabase/functions/ai-nutrition-meals/external-plan";

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
});
