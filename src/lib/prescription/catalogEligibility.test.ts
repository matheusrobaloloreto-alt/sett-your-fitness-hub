import { describe, expect, it } from "vitest";
import { isPrescriptionCatalogEligible } from "../../../supabase/functions/_shared/prescription/catalogEligibility.ts";

describe("prescription catalog eligibility", () => {
  it("accepts a classified exercise with a general muscle group", () => {
    expect(isPrescriptionCatalogEligible({
      id: "global-1",
      name: "Supino máquina",
      muscle_group: "Peitoral",
      targets: [],
    })).toBe(true);
  });

  it("accepts a classified exercise with a target even without the legacy group", () => {
    expect(isPrescriptionCatalogEligible({
      id: "company-1",
      name: "Remada sentada",
      muscle_group: null,
      targets: [{ muscle_group: "Costas", role: "primary", volume_percentage: 100 }],
    })).toBe(true);
  });

  it("rejects an unclassified import so neither engine path can prescribe it", () => {
    expect(isPrescriptionCatalogEligible({
      id: "mfit-unclassified",
      name: "Exercício importado",
      muscle_group: null,
      targets: [],
    })).toBe(false);
  });

  it("rejects rows without stable identity", () => {
    expect(isPrescriptionCatalogEligible({ id: "", name: "Sem id", muscle_group: "Geral", targets: [] })).toBe(false);
    expect(isPrescriptionCatalogEligible({ id: "id", name: " ", muscle_group: "Geral", targets: [] })).toBe(false);
  });
});
