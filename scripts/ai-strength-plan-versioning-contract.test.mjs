import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260903100000_restore_ai_strength_plan_versioning.sql",
  import.meta.url,
);
const functionPath = new URL(
  "../supabase/functions/ai-prescribe-workout/index.ts",
  import.meta.url,
);

test("strength plan persistence has an optimistic-lock version column and trigger", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /alter table public\.ai_strength_plans[\s\S]+add column if not exists updated_at timestamptz/i);
  assert.match(sql, /update public\.ai_strength_plans[\s\S]+set updated_at = coalesce\(updated_at, created_at, now\(\)\)/i);
  assert.match(sql, /alter column updated_at set default now\(\)/i);
  assert.match(sql, /alter column updated_at set not null/i);
  assert.match(sql, /create trigger update_ai_strength_plans_updated_at/i);
  assert.match(sql, /execute function public\.update_updated_at_column\(\)/i);
});

test("prescription persistence reports a safe concrete database failure", async () => {
  const source = await readFile(functionPath, "utf8");
  assert.match(source, /throw new HttpError\(503, "Falha ao salvar a prescrição de musculação\."\)/);
  assert.doesNotMatch(source, /throw persistence\.error \|\| new Error\("Versão do plano não confirmada\."\)/);
});
