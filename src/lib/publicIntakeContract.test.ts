import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const anamnesisSource = readFileSync("src/pages/PublicAnamnesis.tsx", "utf8");
const registrationSource = readFileSync("src/pages/PublicRegistration.tsx", "utf8");
const anamnesisEdgeSource = readFileSync("supabase/functions/public-anamnesis/index.ts", "utf8");
const registrationEdgeSource = readFileSync("supabase/functions/public-registration/index.ts", "utf8");

describe("public intake contract", () => {
  it("offers Gravel in every public cycling form", () => {
    expect(anamnesisSource).toContain('<option value="gravel">Gravel</option>');
    expect(registrationSource).toContain('<SelectItem value="gravel">Gravel</SelectItem>');
  });

  it("keeps meal times dynamic through the seventh meal", () => {
    expect(anamnesisSource).toContain("mealSchedulePayload(mealsPerDay, mealTimes)");
    expect(registrationSource).toContain("mealSchedulePayload(mealsPerDay, mealTimes)");
    expect(anamnesisEdgeSource).toContain("Array.from({ length: 7 }");
    expect(registrationEdgeSource).toContain("Array.from({ length: 7 }");
  });

  it("uses the modality-specific goal without repeating it in health screening", () => {
    expect(anamnesisSource).toContain("goals: sportGoal || objective");
    expect(registrationSource).toContain("goals: sportGoal || objective");
    expect(anamnesisSource).not.toContain("Quais as suas metas com o treino?");
    expect(registrationSource).not.toContain("Quais são suas metas com o treino?");
  });
});
