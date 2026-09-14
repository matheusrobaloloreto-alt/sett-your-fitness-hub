#!/usr/bin/env node
// Local PostgreSQL contract only: synthetic fixtures, no network or remote writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const company = id(1), otherCompany = id(2), staff = id(3), user = id(4), outsider = id(5);
const student = id(6), otherStudent = id(7), unlinkedStudent = id(8), cycle = id(9);
const exercise = id(20), categoryExercise = id(21), legacyExercise = id(22), foreignExercise = id(23);

try {
  await db.exec(`
    create schema auth;
    create role anon; create role authenticated; create role service_role;
    create type public.app_role as enum ('master', 'admin', 'trainer');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create function public.has_role(uuid, public.app_role) returns boolean language sql stable as $$ select false $$;
    create function public.is_company_staff(actor uuid, company uuid) returns boolean language sql stable as $$
      select coalesce(actor = '${staff}'::uuid and company = '${company}'::uuid, false)
    $$;
    create table students(id uuid primary key, company_id uuid, user_id uuid);
    create table exercise_library(id uuid primary key, name text, description text, equipment text,
      muscle_group text, category text, categories text[], company_id uuid, is_global boolean);
    create table muscle_groups(id uuid primary key, name text);
    create table exercise_muscle_targets(exercise_id uuid, muscle_group_id uuid, role text,
      is_primary boolean, volume_percentage numeric, primary key(exercise_id, muscle_group_id));
    create table company_exercise_volumes(company_id uuid, exercise_id uuid, muscle_group_id uuid, role text, volume_percentage numeric);
    create table training_cycles(id uuid primary key, student_id uuid, status text, start_date date, end_date date, created_at timestamptz);
    create table workouts(id uuid primary key, cycle_id uuid, company_id uuid, superseded_at timestamptz);
    create table workout_exercise_entries(workout_id uuid, exercise_order int, exercise_id uuid, sets numeric, direct_muscle_group text);
    create table volume_recommendations(muscle_group_name text, min_sets numeric, optimal_sets numeric, max_sets numeric);
    insert into students values ('${student}','${company}','${user}'), ('${otherStudent}','${otherCompany}','${outsider}'), ('${unlinkedStudent}','${company}',null);
    insert into exercise_library values
      ('${exercise}','Supino sintético',null,'barra','Peito','Ativação',array['Base','Categoria antiga'],'${company}',false),
      ('${categoryExercise}','Prancha sintética',null,null,'Core','Fisioterapia',array['Core'],'${company}',false),
      ('${legacyExercise}','Exercício legado',null,null,'Glúteo',null,array[]::text[],'${company}',false),
      ('${foreignExercise}','Catálogo outra empresa',null,null,'Dorsal',null,array[]::text[],'${otherCompany}',false);
    insert into muscle_groups values
      ('${id(30)}','Peito'), ('${id(31)}','Peitoral'), ('${id(32)}','Tríceps'), ('${id(33)}','Core'),
      ('${id(34)}','Deltoide Anterior'), ('${id(35)}','Deltoide Lateral'), ('${id(36)}','Deltoide Posterior'), ('${id(37)}','Dorsal');
    insert into exercise_muscle_targets values
      ('${exercise}','${id(30)}','primary',true,1), ('${exercise}','${id(31)}','secondary',false,1),
      ('${exercise}','${id(32)}','secondary',false,100), ('${exercise}','${id(33)}','primary',true,100),
      ('${exercise}','${id(34)}','secondary',false,20), ('${exercise}','${id(35)}','secondary',false,0.5), ('${exercise}','${id(36)}','secondary',false,1),
      ('${categoryExercise}','${id(33)}','primary',true,1), ('${legacyExercise}','${id(33)}','primary',true,1), ('${foreignExercise}','${id(37)}','primary',true,1);
    insert into company_exercise_volumes values ('${company}','${exercise}','${id(32)}','primary',99);
    insert into training_cycles values ('${cycle}','${student}','active',current_date-1,current_date+40,now());
    insert into workouts values ('${id(40)}','${cycle}','${company}',null), ('${id(41)}','${cycle}','${company}',now()), ('${id(42)}','${cycle}','${otherCompany}',null);
    insert into workout_exercise_entries values
      ('${id(40)}',1,'${exercise}',4,'Peito'), ('${id(40)}',2,'${categoryExercise}',5,'Core'), ('${id(40)}',3,'${legacyExercise}',3,'Glúteo'),
      ('${id(41)}',1,'${exercise}',99,'Peito'), ('${id(42)}',1,'${exercise}',99,'Peito');
    insert into volume_recommendations values ('Peitoral',2,3,5), ('Core',1,2,3);
  `);

  for (const file of ["20260914124000_exercise_taxonomy_contract.sql", "20260914130000_fix_fixed_muscle_volume.sql"]) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  for (const [legacy, canonical] of [["Deltóide Frontal", "deltoide_anterior"], ["Trapézio Inferior", "trapezio"], ["Braquiorradial", "antebraco"], ["Core", null]]) {
    const alias = await db.query("select canonical_volume_muscle_group($1) as muscle", [legacy.normalize("NFD")]);
    assert.equal(alias.rows[0].muscle, canonical);
  }
  const authenticate = async (actor, role = "authenticated") => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)", [actor || "", role]);
  };
  const volume = () => db.query("select * from public.get_weekly_volume($1)", [student]);
  await authenticate(user);
  const result = await volume();
  const totals = Object.fromEntries(result.rows.map((row) => [row.muscle_group, Number(row.effective_sets)]));
  assert.deepEqual(totals, { deltoide_anterior: 2, deltoide_lateral: 2, deltoide_posterior: 2, gluteos: 3, peitoral: 4, triceps: 2 });
  const effective = await db.query("select * from public.get_effective_exercise_targets($1,$2::uuid[])", [student, [exercise, categoryExercise, foreignExercise]]);
  assert(effective.rows.every((row) => row.exercise_id === exercise && row.muscle_group_name !== "Core"));
  assert(effective.rows.every((row) => Number(row.volume_percentage) === (row.role === "primary" ? 100 : 50)));
  assert.equal((await db.query("select volume_percentage from company_exercise_volumes")).rows[0].volume_percentage, "99");
  const preserved = (await db.query("select taxonomy_legacy_categories from exercise_library where id=$1", [exercise])).rows[0].taxonomy_legacy_categories;
  assert.deepEqual(preserved.categories, ["Base", "Categoria antiga"]);

  await authenticate(outsider);
  await assert.rejects(volume, /Acesso negado/);
  await authenticate(null);
  await assert.rejects(() => db.query("select * from get_weekly_volume($1)", [unlinkedStudent]), /Acesso negado/);
  await assert.rejects(() => db.query("select * from get_effective_exercise_targets($1,$2::uuid[])", [unlinkedStudent, [exercise]]), /Acesso negado/);
  await authenticate(staff);
  assert.deepEqual((await volume()).rows, result.rows);
  const replace = (targets) => db.query("select replace_exercise_muscle_targets($1,$2::jsonb)", [exercise, JSON.stringify(targets)]);
  await assert.rejects(() => replace([{ muscle_group_id: id(33), role: "primary", is_primary: true }]), /fora da taxonomia/);
  await assert.rejects(() => replace([{ muscle_group_id: id(30), role: "primary", is_primary: true }, { muscle_group_id: id(31), role: "secondary", is_primary: false }]), /duplicado/);
  await replace([{ muscle_group_id: id(30), role: "primary", is_primary: true, volume_percentage: 1 }, { muscle_group_id: id(32), role: "secondary", is_primary: false, volume_percentage: 99 }]);
  assert.deepEqual((await db.query("select volume_percentage from exercise_muscle_targets where exercise_id=$1 order by muscle_group_id", [exercise])).rows.map((row) => Number(row.volume_percentage)), [100, 50]);
  console.log(JSON.stringify({ ok: true, totals, tenantIsolation: true, anonymousDenied: true, historyPreserved: true, fixedTargetWrite: true }, null, 2));
} finally {
  await db.close();
}
