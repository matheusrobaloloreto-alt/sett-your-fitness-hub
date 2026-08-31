import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260831200000_reclassify_exercise_filters.sql");

describe("exercise filter reclassification migration", () => {
  it("é idempotente, tolera schema drift e não altera muscle_group", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("v_categories_udt = '_text'");
    expect(sql).toContain("v_categories_udt = 'jsonb'");
    expect(sql).toContain("is distinct from rebuilt.categories");
    expect(sql).not.toMatch(/set\s+muscle_group\s*=/i);
  });

  it("migra Controle Motor, Fisioterapia e Performance para filtros canônicos", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("'controle_motor', 'funcional', 'funcionais'");
    expect(sql).toContain("then 'funcionais'");
    expect(sql).toContain("then 'pliometria'");
    expect(sql).toContain("('fisioterapia', 'fisio')");
  });
});
