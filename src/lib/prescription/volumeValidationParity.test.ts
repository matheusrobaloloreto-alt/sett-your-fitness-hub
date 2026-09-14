import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as volumeRules from "../../../supabase/functions/_shared/prescription/volumeRules.ts";
import { buildCatalogVolumeSummary } from "../../../supabase/functions/_shared/prescription/catalogVolume.ts";
import { buildPrescriptionInputFromEdgePayload } from "../../../supabase/functions/_shared/prescription/adapters/inputAdapter.ts";
import { clinicalRiskText, prescriptionRiskText } from "../../../supabase/functions/_shared/prescription/clinicalContext.ts";
import { MUSCLE_GROUP_OPTIONS, CATEGORY_OPTIONS, canonicalCategorySlug, canonicalMuscleSlug } from "../exerciseTaxonomy";
import { selectMethodologyPreset } from "../../../supabase/functions/_shared/prescription/presets.ts";

// Execute the actual pure endpoint functions without starting serve or loading credentials.
function readSource(path: string) {
  return process.env.REGRESSION_BASE_REF
    ? execFileSync("git", ["show", `${process.env.REGRESSION_BASE_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
}

function loadValidator(endpoint: string, name: string) {
  const source = readSource(`supabase/functions/${endpoint}/index.ts`);
  const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => d.name.getText(ast) === "clean")));
  const code = ts.transpileModule(declarations.map((node) => node.getText(ast)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const dependencies = { ...volumeRules, buildCatalogVolumeSummary, buildPrescriptionInputFromEdgePayload, clinicalRiskText, prescriptionRiskText };
  return new Function(...Object.keys(dependencies), `${code}\nreturn ${name};`)(...Object.values(dependencies));
}

const standalone = loadValidator("ai-validate-prescription", "validatePrescription");
const prescribe = loadValidator("ai-prescribe-workout", "validatePrescriptionPlan");
const taxonomySource = ts.createSourceFile("taxonomy.ts", readSource("supabase/functions/_shared/exerciseTaxonomy.ts"), ts.ScriptTarget.Latest, true);
const categoryFunction = taxonomySource.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "normalizeExerciseCategories")!;
const categoryCode = ts.transpileModule(categoryFunction.getText(taxonomySource), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const normalizeExerciseCategories = new Function("exports", "canonicalCategorySlug", `${categoryCode}\nreturn normalizeExerciseCategories;`)({}, canonicalCategorySlug);

describe("volume classification parity across engine and both endpoints", () => {
  const cases = [
    { label: "beginner lateral deltoid", group: "Deltoide Lateral", sets: 10, fitness_level: "iniciante", objective: "hipertrofia" },
    { label: "small group below range", group: "Biceps", sets: 2, fitness_level: "iniciante", objective: "hipertrofia" },
    { label: "intermediate chest cap", group: "Peitoral", sets: 17, fitness_level: "intermediario", objective: "hipertrofia" },
    { label: "strength objective", group: "Peitoral", sets: 10, fitness_level: "iniciante", objective: "forca" },
    { label: "endurance legs", group: "Quadriceps", sets: 10, fitness_level: "iniciante", objective: "hipertrofia", running_days_context: { days_per_week: 3 } },
    { label: "structured shoulder pain", group: "Deltoide Lateral", sets: 6, fitness_level: "iniciante", objective: "hipertrofia", pain_reports: [{ region: "ombro", eva: 5 }] },
    { label: "exact lateral deltoid cap", group: "Deltoide Lateral", sets: 7, fitness_level: "iniciante", objective: "hipertrofia" },
  ];
  it.each(cases.flatMap((payload) => ["standalone", "prescribe"].map((endpoint) => ({ ...payload, endpoint }))))("$endpoint: $label", (payload) => {
    const catalog = [{ id: "exercise", name: "Synthetic exercise", muscle_group: payload.group, categories: ["base"], targets: [], contraindications: [], pain_limitation_tags: [] }];
    const { input } = buildPrescriptionInputFromEdgePayload({ payload, catalog });
    const plan = { duration_weeks: 6, workouts: [{ exercises: [{ exercise_id: "exercise", muscle_group: payload.group, sets: payload.sets }] }] };
    const expected = volumeRules.reviewVolume(plan as never, input, selectMethodologyPreset(input)).find((r) => r.weekly_sets === payload.sets)!;
    const result = payload.endpoint === "standalone"
      ? standalone({ ...payload, plan, catalog, volumeInput: input })
      : prescribe({ plan, catalog: { exercises: catalog }, libraryValidation: { valid: true }, objective: payload.objective, fitnessLevel: payload.fitness_level, volumeInput: input });
      const review = result.volume_review.find((r: { muscle_group: string }) => canonicalMuscleSlug(r.muscle_group) === expected.muscle_group);
      expect(review.status).toBe(expected.status);
      expect(review.weekly_sets).toBe(expected.weekly_sets);
      if (expected.status === "alto") {
        const cap = volumeRules.getVolumeRangeForGroup(payload.group, input.fitnessLevel, input).mrv;
        expect(result.warnings.find((w: { source: string }) => w.source === "volume").recommendation).toContain(String(cap));
      }
    if (payload.label === "beginner lateral deltoid") expect(expected.status).toBe("alto");
  });
});

describe("explicit category selections", () => {
  it("preserves an empty selection for Abdomen despite stale legacy category", () => {
    expect(normalizeExerciseCategories({ muscle_group: "Abdomen", category: "Core", categories: [] })).toEqual([]);
  });
  it("uses only selected categories and falls back only when categories are absent", () => {
    expect(normalizeExerciseCategories({ muscle_group: "Abdomen", category: "Core", categories: ["Base"] })).toEqual(["base"]);
    expect(normalizeExerciseCategories({ muscle_group: "Abdomen" })).toEqual(["core"]);
    expect(normalizeExerciseCategories({ muscle_group: "Abdomen", categories: null })).toEqual(["core"]);
    expect(MUSCLE_GROUP_OPTIONS).toHaveLength(15);
    expect(CATEGORY_OPTIONS).toHaveLength(8);
  });
});
