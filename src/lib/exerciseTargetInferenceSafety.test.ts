import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("exercise target inference safety", () => {
  it("falha fechado quando só há pista de categoria, sem inventar alvo anatômico", async () => {
    const source = await readFile(
      resolve(process.cwd(), "scripts/sync-exercise-prescription-links.mjs"),
      "utf8",
    );

    for (const category of [
      "Cardio Longo",
      "Mobilidade",
      "Fisioterapia",
      "Controle Motor",
      "Performance",
      "Peso Corporal",
      "Funcional",
      "Pliometria",
    ]) {
      expect(source).not.toContain(`return "${category}"`);
    }
    expect(source).toMatch(/performance\|plio[^\n]+return null/);
  });
});
