import { describe, expect, it } from "vitest";
import { pickCatalogExercise } from "../../../supabase/functions/_shared/prescription/exerciseScoring";
import type { ExerciseCatalogEntry, RestrictionRule } from "../../../supabase/functions/_shared/prescription/types";

function exercise(
  id: string,
  name: string,
  overrides: Partial<ExerciseCatalogEntry> = {},
): ExerciseCatalogEntry {
  return {
    id,
    name,
    description: "",
    muscle_group: "quadriceps",
    equipment: "peso corporal",
    difficulty: "intermediario",
    contraindications: [],
    regressions: [],
    progressions: [],
    equivalent_substitutes: [],
    pain_limitation_tags: [],
    targets: [],
    ...overrides,
  };
}

const kneeRestriction: RestrictionRule = {
  key: "knee",
  label: "Restrição de joelho",
  active: true,
  severity: "severa",
  affectedRegions: ["joelho"],
  avoidKeywords: ["impacto"],
  preferKeywords: ["controle"],
  recommendation: "Preferir controle sem impacto.",
  explanationCode: "knee_restriction",
};

describe("exercise scoring optimized selection semantics", () => {
  it("preserves the first catalog item when scores tie", () => {
    const first = exercise("first", "Agachamento controle A");
    const second = exercise("second", "Agachamento controle B");
    expect(pickCatalogExercise({ catalog: [first, second], keywords: ["agachamento controle"] })?.id).toBe("first");
  });

  it("preserves equivalent priority before the general ranking", () => {
    const source = exercise("source", "Agachamento", { equivalent_substitutes: ["equivalent"] });
    const equivalent = exercise("equivalent", "Agachamento no banco");
    const strongerKeywordMatch = exercise("ranked", "Agachamento controle perfeito");
    expect(pickCatalogExercise({
      catalog: [source, equivalent, strongerKeywordMatch],
      keywords: ["agachamento"],
      usedIds: new Set(["source"]),
    })?.id).toBe("equivalent");
  });

  it("keeps equipment, hard exclusion, used ids and clinical restrictions in the decision", () => {
    const machine = exercise("machine", "Agachamento máquina", { equipment: "máquina" });
    const hardExcluded = exercise("excluded", "Agachamento controle sem impacto");
    const used = exercise("used", "Agachamento controle corporal");
    const safe = exercise("safe", "Agachamento controle corporal seguro", {
      pain_limitation_tags: ["controle do joelho"],
    });

    expect(pickCatalogExercise({
      catalog: [machine, hardExcluded, used, safe],
      keywords: ["agachamento"],
      equipment: "peso corporal",
      hardExcludedIds: new Set(["excluded"]),
      usedIds: new Set(["used"]),
      restrictions: [kneeRestriction],
    })?.id).toBe("safe");
  });
});
