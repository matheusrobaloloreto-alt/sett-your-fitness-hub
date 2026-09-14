#!/usr/bin/env node
// Synthetic local PostgreSQL contract. Never opens a remote connection.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const migration = await readFile("supabase/migrations/20260914124000_exercise_taxonomy_contract.sql", "utf8");
const fixtures = [
  { name: "unknown", categories: ["unmapped"], category: "unmapped", muscle: "Peitoral", expected: [] },
  { name: "mixed", categories: ["Base", "unmapped", "Core", "Base", null], expected: ["base", "core"] },
  { name: "empty abdomen", categories: [], category: "Core", muscle: "Abdomen", expected: [] },
  { name: "selected abdomen", categories: ["Base"], category: "Core", muscle: "Abdomen", expected: ["base"] },
  { name: "legacy absence", categories: null, muscle: "Abdomen", expected: ["core"] },
];

for (const type of ["text[]", "jsonb", "missing"]) {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create type public.app_role as enum ('master');
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
      create function public.has_role(uuid, public.app_role) returns boolean language sql as $$ select false $$;
      create function public.is_company_staff(uuid, uuid) returns boolean language sql as $$ select false $$;
      create table exercise_library(id uuid primary key, name text, description text, equipment text,
        muscle_group text, category text, ${type === "missing" ? "" : `categories ${type},`} company_id uuid, is_global boolean);
      create table muscle_groups(id uuid primary key, name text);
      create table exercise_muscle_targets(exercise_id uuid, muscle_group_id uuid, role text, is_primary boolean, volume_percentage numeric);
    `);
    const rows = type === "missing" ? [fixtures[4]] : [...fixtures];
    if (type === "jsonb") rows.push(
      { name: "mixed types", categories: ["Base", 42, { old: "Core" }, ["Core"], false], expected: ["base"] },
      { name: "scalar alias", categories: "Base", expected: ["base"] },
      { name: "unknown object", categories: { original: ["old"] }, expected: [] },
      { name: "json null", categories: null, jsonNull: true, muscle: "Abdomen", expected: ["core"] },
    );
    for (const [index, row] of rows.entries()) {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const params = [id, row.name, row.category ?? null, row.muscle ?? null];
      if (type !== "missing") params.push(type === "jsonb" && (row.categories !== null || row.jsonNull) ? JSON.stringify(row.categories) : row.categories);
      await db.query(`insert into exercise_library(id,name,category,muscle_group${type === "missing" ? "" : ",categories"}) values ($1,$2,$3,$4${type === "missing" ? "" : `,$5::${type}`})`, params);
    }
    if (type === "text[]") {
      // Reproduce a previously installed NOT VALID constraint with stranded rows.
      await db.exec(`alter table exercise_library add constraint exercise_library_categories_canonical
        check (categories <@ array['core','mobilidades','funcionais','base','pesos_livre','peso_corporal','maquinas','pliometria']::text[]) not valid`);
      await assert.rejects(() => db.exec("update exercise_library set description='before repair'"), /exercise_library_categories_canonical/);
    }
    await db.exec(migration);
    const first = (await db.query("select id,name,category,categories,muscle_group,taxonomy_legacy_categories from exercise_library order by id")).rows;
    for (const [index, actual] of first.entries()) {
      const original = rows[index];
      assert.deepEqual(actual.categories, original.expected, `${type}: ${original.name}`);
      assert.equal(actual.category, original.expected[0] ?? null);
      assert.equal(actual.muscle_group, original.muscle ?? null);
      assert.deepEqual(actual.taxonomy_legacy_categories, {
        category: original.category ?? null,
        categories: type === "missing" ? null : original.categories,
        muscle_group: original.muscle ?? null,
      }, `${type}: original snapshot`);
    }
    // A NOT VALID constraint must not strand legacy rows on unrelated updates.
    await db.exec("update exercise_library set description='unrelated update'");
    await db.exec(migration);
    const second = (await db.query("select id,name,category,categories,muscle_group,taxonomy_legacy_categories from exercise_library order by id")).rows;
    assert.deepEqual(second, first, `${type}: migration must be idempotent including backup`);
    const constraints = (await db.query("select convalidated from pg_constraint where conrelid='exercise_library'::regclass and conname='exercise_library_categories_canonical'")).rows;
    assert.deepEqual(constraints, [{ convalidated: true }]);
    const columnType = type === "jsonb" ? "jsonb" : "text[]";
    const invalid = type === "jsonb" ? '["unknown"]' : ["unknown"];
    await assert.rejects(() => db.query(`update exercise_library set categories=$1::${columnType}`, [invalid]), /exercise_library_categories_canonical/);
    console.log(`${type}: ${rows.length} fixtures, original backup, unrelated update, rerun and constraint OK`);
  } finally {
    await db.close();
  }
}
