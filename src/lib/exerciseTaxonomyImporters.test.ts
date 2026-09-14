import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const syncPath = resolve(process.cwd(), "scripts/sync-exercise-prescription-links.mjs");
const mfitPath = resolve(process.cwd(), "scripts/mfit-active-workouts-migration.mjs");

describe("exercise taxonomy importer guardrails", () => {
  it("prescription-link sync não infere anatomia por nome de movimento", async () => {
    const sql = await readFile(syncPath, "utf8");
    const inferFunction = sql.slice(sql.indexOf("function inferMuscleGroup"), sql.indexOf("function inferEquipment"));
    for (const forbidden of ["rosca", "remada", "puxada", "elevacao", "desenvolvimento", "face", "aducao", "pegada", "punho", "grip"]) {
      expect(inferFunction).not.toContain(forbidden);
    }
    expect(inferFunction).toContain("canonicalAnatomicalGroup(exercise.muscle_group)");
    expect(sql).toContain('"posterior de coxa": "Posterior de coxa"');
    expect(sql).not.toContain("Posterior de Coxa");
  });

  it("MFIT active-workouts migration normaliza só grupos anatômicos explícitos e não usa category como muscle_group", async () => {
    const script = await readFile(mfitPath, "utf8");
    expect(script).toContain("function canonicalMfitMuscleGroup");
    expect(script).toContain("CANONICAL_MFIT_MUSCLE_GROUPS");
    expect(script).toContain('firstValue(row, ["muscle_group", "muscleGroup", "group", "grupo", "exerciseGroup.nome"])');
    expect(script).not.toContain('"category"]),\n    ) || "geral"');
    expect(script).not.toContain('muscle_group: cleanText(\n      firstValue(row, ["muscle_group", "muscleGroup", "group", "grupo", "exerciseGroup.nome", "category"]),');
  });
});
