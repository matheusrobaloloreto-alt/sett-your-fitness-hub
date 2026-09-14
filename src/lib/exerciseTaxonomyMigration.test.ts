import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const legacyMigrationPath = resolve(process.cwd(), "supabase/migrations/20260831200000_reclassify_exercise_filters.sql");
const taxonomyMigrationPath = resolve(process.cwd(), "supabase/migrations/20260914124000_exercise_taxonomy_contract.sql");

describe("exercise filter reclassification migration", () => {
  it("é idempotente, tolera schema drift e não altera muscle_group", async () => {
    const sql = await readFile(legacyMigrationPath, "utf8");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("v_categories_udt = '_text'");
    expect(sql).toContain("v_categories_udt = 'jsonb'");
    expect(sql).toContain("is distinct from rebuilt.categories");
    expect(sql).not.toMatch(/set\s+muscle_group\s*=/i);
  });
});

describe("exercise taxonomy contract migration", () => {
  it("declara a função SQL canônica que o volume usa antes da migration do root", async () => {
    const sql = await readFile(taxonomyMigrationPath, "utf8");
    expect(sql).toContain("create or replace function public.canonical_volume_muscle_group");
    expect(sql).toContain("comment on function public.canonical_volume_muscle_group(text)");
  });

  it("mantém exatamente os 15 slugs de volume pedidos", async () => {
    const sql = await readFile(taxonomyMigrationPath, "utf8");
    const expectedSlugs = [
      "abdomen", "quadriceps", "posterior_de_coxa", "gluteos", "adutores", "panturrilha",
      "deltoide_lateral", "deltoide_posterior", "deltoide_anterior", "antebraco", "biceps",
      "triceps", "dorsal", "trapezio", "peitoral",
    ];
    const returnedSlugs = [...sql.matchAll(/then return '([^']+)'/g)].map((match) => match[1]);
    const returnedVolumeSlugs = returnedSlugs.filter((slug) => expectedSlugs.includes(slug));
    expect(new Set(returnedVolumeSlugs)).toEqual(new Set(expectedSlugs));
    expect(sql).not.toMatch(/then return 'deltoide';/);
    expect(sql).not.toMatch(/then return 'ombro';/);
  });

  it("não mapeia categoria ou movimento como músculo de volume", async () => {
    const sql = await readFile(taxonomyMigrationPath, "utf8");
    const muscleFunction = sql.slice(
      sql.indexOf("create or replace function public.canonical_volume_muscle_group"),
      sql.indexOf("create or replace function public.volume_muscle_group_label"),
    );
    for (const forbidden of ["core", "mobilidade", "funcional", "fisioterapia", "performance", "rosca", "remada", "puxada", "face_pull", "grip", "manguito", "lombar", "tibial"]) {
      expect(muscleFunction).not.toContain(`'${forbidden}'`);
    }
  });

  it("preserva snapshot original e normaliza inclusive resultados vazios", async () => {
    const sql = await readFile(taxonomyMigrationPath, "utf8");
    expect(sql).toContain("taxonomy_legacy_categories jsonb");
    expect(sql).toContain("coalesce(e.taxonomy_legacy_categories, jsonb_build_object(");
    expect(sql).not.toContain("cardinality(normalized.categories) > 0");
    expect(sql).not.toContain("and normalized.categories is not null");
    expect(sql).toContain("when p_categories is null or p_categories = 'null'::jsonb");
    expect(sql).toContain("when jsonb_typeof(p_categories) = 'array' then p_categories");
    expect(sql).not.toContain("not valid");
  });

  it("replace_exercise_muscle_targets aceita limpar alvos e fixa 100/50 por role", async () => {
    const sql = await readFile(taxonomyMigrationPath, "utf8");
    expect(sql).toContain("coalesce(p_targets, '[]'::jsonb)");
    expect(sql).toContain("jsonb_array_length(v_targets) > 0");
    expect(sql).toContain("case when target.role = 'primary' then 100 else 50 end");
    expect(sql).toContain("target.is_primary is distinct from (target.role = 'primary')");
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain("Grupamento muscular duplicado na taxonomia canônica");
    expect(sql).not.toContain("company_exercise_volumes");
  });
});
