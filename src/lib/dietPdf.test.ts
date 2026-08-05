import { describe, expect, it } from "vitest";
import { normalizeDietPdfPages } from "@/lib/dietPdf";

describe("normalizeDietPdfPages", () => {
  it("preserva linhas e separa páginas para o parser determinístico de refeições", () => {
    expect(normalizeDietPdfPages([
      " Café da manhã  07:00 \n ovos e pão ",
      "\nAlmoço 12:30\n arroz, feijão e frango\n",
    ])).toBe("Café da manhã 07:00\novos e pão\n\nAlmoço 12:30\narroz, feijão e frango");
  });

  it("remove páginas vazias sem unir palavras", () => {
    expect(normalizeDietPdfPages(["", "Jantar\n peixe e legumes", "   "])).toBe("Jantar\npeixe e legumes");
  });
});
