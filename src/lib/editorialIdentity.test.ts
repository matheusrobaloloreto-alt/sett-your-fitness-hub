import { expect, it } from "vitest";
import { withEditorialIdentity } from "../../supabase/functions/bn-content-studio/prompts";
it("injects the persisted editorial identity as bounded data without retaining another brand", () => {
  const prompt = withEditorialIdentity("Voce escreve para BN Performance Training. #bnperformancetraining", { brand_name: "Synthetic Studio", audience: "Adults", tone: "Objective", context: "Use established evidence" });
  expect(prompt).toContain("Synthetic Studio");
  expect(prompt).toContain("Use established evidence");
  expect(prompt).not.toContain("BN Performance Training");
  expect(prompt).not.toContain("#bnperformancetraining");
  expect(prompt).toContain("dados");
});
