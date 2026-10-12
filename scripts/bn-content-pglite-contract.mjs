import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pgliteVersion = "0.3.16";
async function loadPglite() {
  if (process.env.PGLITE_MODULE_PATH) {
    return import(process.env.PGLITE_MODULE_PATH);
  }
  const candidates = [];
  try {
    candidates.push(import.meta.resolve("@electric-sql/pglite"));
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  }
  const cache = join(homedir(), ".npm", "_npx");
  try {
    for (const entry of (await readdir(cache)).sort()) {
      candidates.push(
        pathToFileURL(
          join(cache, entry, "node_modules/@electric-sql/pglite/dist/index.js"),
        ).href,
      );
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const candidate of candidates) {
    try {
      const metadata = JSON.parse(
        await readFile(new URL("../package.json", candidate), "utf8"),
      );
      if (
        metadata.name === "@electric-sql/pglite" &&
        metadata.version === pgliteVersion
      ) return import(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    "PGlite 0.3.16 unavailable. See supabase/functions/bn-content-studio/README.md for an isolated /tmp runtime; no repository dependency changes required.",
  );
}
const { PGlite } = await loadPglite();
const db = new PGlite();
const migration = new URL(
  "../supabase/migrations/20261012074421_bn_content_studio_cloud.sql",
  import.meta.url,
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const master1 = id(1), master2 = id(2), outsider = id(3);
const spec = {
  format: "carrossel",
  aesthetic: "l1_educativo",
  topic: "Carga",
  audience: "misto",
  slides: [{ role: "capa", title: "Carga com criterio" }, {
    role: "cta",
    title: "Salve",
  }],
  caption: "Treino individualizado comeca na avaliacao.",
  hashtags: ["#BN"],
};
let checks = 0;
async function role(name, actor = "") {
  assert.ok(["anon", "authenticated", "service_role"].includes(name));
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
  await db.exec(`set role ${name}`);
}
async function denied(sql, params = []) {
  await assert.rejects(
    db.query(sql, params),
    (error) => error.code === "42501",
  );
  checks++;
}
async function save(
  actor,
  postId = null,
  version = null,
  value = spec,
  status = "draft",
) {
  return (await db.query(
    "select public.bn_content_studio_save($1,$2,$3,$4,$5,$6) result",
    [actor, postId, version, "Brief sintetico", value, status],
  )).rows[0].result;
}
async function quota(actor, kind) {
  return (await db.query(
    "select public.bn_content_studio_take_quota($1,$2) ok",
    [actor, kind],
  )).rows[0].ok;
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${master1}'),('${master2}'),('${outsider}');
    create type public.app_role as enum ('master','admin','trainer','student');
    create table public.qa_master_roles(user_id uuid primary key);
    insert into public.qa_master_roles values ('${master1}'),('${master2}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.has_role(_user_id uuid,_role public.app_role) returns boolean
      language sql stable security definer set search_path=public as $$
      select _role='master' and exists(select 1 from qa_master_roles where user_id=_user_id) $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant all on storage.objects to anon,authenticated,service_role;
    create policy "Legacy archive untouched" on storage.objects for all to anon,authenticated using (true) with check (true);
    insert into storage.buckets values ('bn-content-archive','bn-content-archive',false,10485760,array['image/png']);
    insert into storage.objects(bucket_id,name) values ('bn-content-archive','manifest.json');
  `);
  const before = (await db.query(
    "select * from pg_policies where policyname='Legacy archive untouched'",
  )).rows;
  const archiveBefore = (await db.query(
    "select * from storage.buckets where id='bn-content-archive'",
  )).rows;
  await db.exec(await readFile(migration, "utf8"));
  assert.deepEqual(
    (await db.query(
      "select * from pg_policies where policyname='Legacy archive untouched'",
    )).rows,
    before,
  );
  assert.deepEqual(
    (await db.query(
      "select * from storage.buckets where id='bn-content-archive'",
    )).rows,
    archiveBefore,
  );
  checks += 2;

  for (
    const [name, actor] of [["anon", ""], ["authenticated", outsider], [
      "authenticated",
      master1,
    ]]
  ) {
    await role(name, actor);
    await denied("select public.bn_content_studio_take_quota($1,'text')", [
      master1,
    ]);
    await denied(
      "select public.bn_content_studio_save($1,null,null,'forged',$2,'draft')",
      [master1, spec],
    );
    await denied(
      "insert into public.bn_content_studio_posts(brief,spec,created_by,updated_by) values ('forged',$1,$2,$2)",
      [spec, master1],
    );
    await denied(
      "insert into public.bn_content_studio_calendars(calendar,created_by) values ('{}',$1)",
      [master1],
    );
    await denied("select * from public.bn_content_studio_quota");
  }
  await role("anon");
  await denied("select * from public.bn_content_studio_posts");
  await denied("select * from public.bn_content_studio_calendars");
  await role("service_role");
  const first = await save(master1);
  assert.equal(first.version, 1);
  assert.equal(first.brief, "Brief sintetico");
  assert.equal(first.created_by, undefined);
  const calendarId = id(5);
  await db.query(
    "insert into public.bn_content_studio_calendars(id,calendar,created_by) values ($1,'{\"weeks\":[]}',$2)",
    [calendarId, master1],
  );
  checks++;

  for (const actor of [master1, master2]) {
    await role("authenticated", actor);
    assert.equal(
      (await db.query("select id from public.bn_content_studio_posts")).rows[0]
        .id,
      first.id,
    );
    assert.equal(
      (await db.query("select id from public.bn_content_studio_calendars"))
        .rows[0].id,
      calendarId,
    );
    await denied(
      "update public.bn_content_studio_posts set version=999 where id=$1",
      [first.id],
    );
    await denied("delete from public.bn_content_studio_calendars where id=$1", [
      calendarId,
    ]);
    checks += 2;
  }
  await role("authenticated", outsider);
  assert.equal(
    (await db.query("select * from public.bn_content_studio_posts")).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.bn_content_studio_calendars")).rows
      .length,
    0,
  );
  checks += 2;
  // RLS still denies anon if a future table grant accidentally broadens SELECT.
  await db.exec("reset role");
  await db.exec(
    "grant select on public.bn_content_studio_posts,public.bn_content_studio_calendars to anon",
  );
  await role("anon");
  assert.equal(
    (await db.query("select * from public.bn_content_studio_posts")).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.bn_content_studio_calendars")).rows
      .length,
    0,
  );
  checks += 2;

  await role("service_role");
  await assert.rejects(() => save(outsider), (e) => e.code === "42501");
  await assert.rejects(
    () => quota(outsider, "text"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () => quota(master1, "forged"),
    (e) => e.code === "22023",
  );
  const updated = await save(master2, first.id, 1, spec, "approved");
  assert.equal(updated.version, 2);
  const authors = (await db.query(
    "select created_by,updated_by from public.bn_content_studio_posts where id=$1",
    [first.id],
  )).rows[0];
  assert.deepEqual(authors, { created_by: master1, updated_by: master2 });
  const race = await Promise.allSettled([
    save(master1, first.id, 2),
    save(master2, first.id, 2),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(race.find((r) => r.status === "rejected").reason.code, "40001");
  const afterRace = (await db.query(
    "select version from public.bn_content_studio_posts where id=$1",
    [first.id],
  )).rows[0];
  assert.equal(afterRace.version, 3);
  await assert.rejects(
    () => save(master1, first.id, 1),
    (e) => e.code === "40001",
  );
  checks += 7;

  for (
    const broken of [
      null,
      {},
      { ...spec, slides: [] },
      { ...spec, slides: Array(21).fill(spec.slides[0]) },
      { ...spec, caption: "" },
      { ...spec, slides: [{ role: "capa", title: "" }] },
      {
        ...spec,
        slides: [{
          role: "capa",
          title: "x",
          background_path: "https://foreign/image.png",
        }],
      },
      { ...spec, created_by: master1 },
      { ...spec, hashtags: ["bad hashtag"] },
    ]
  ) {
    await assert.rejects(
      () => save(master1, null, null, broken, "approved"),
      (e) => e.code === "22023",
    );
    checks++;
  }
  const textAttempts = await Promise.all(
    Array.from({ length: 40 }, () => quota(master1, "text")),
  );
  const imageAttempts = await Promise.all(
    Array.from({ length: 20 }, () => quota(master1, "image")),
  );
  assert.equal(textAttempts.filter(Boolean).length, 30);
  assert.equal(imageAttempts.filter(Boolean).length, 10);
  assert.equal(await quota(master2, "text"), true);
  await role("authenticated", master1);
  await denied("delete from public.bn_content_studio_quota");
  await role("service_role");
  assert.equal(await quota(master1, "text"), false);
  await db.query(
    "update public.bn_content_studio_quota set hour_start=hour_start-interval '1 hour' where user_id=$1",
    [master1],
  );
  assert.equal(await quota(master1, "text"), true);
  checks += 5;

  const path = `studio/${first.id}/assets/${id(8)}.png`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values ('bn-content-studio',$1)",
    [path],
  );
  for (const actor of [master1, master2]) {
    await role("authenticated", actor);
    assert.equal(
      (await db.query(
        "select name from storage.objects where bucket_id='bn-content-studio'",
      )).rows[0].name,
      path,
    );
    await denied(
      "insert into storage.objects(bucket_id,name) values ('bn-content-studio','forged.png')",
    );
    assert.equal(
      (await db.query(
        "update storage.objects set name='forged.png' where bucket_id='bn-content-studio' returning id",
      )).rows.length,
      0,
    );
    assert.equal(
      (await db.query(
        "delete from storage.objects where bucket_id='bn-content-studio' returning id",
      )).rows.length,
      0,
    );
    await denied(
      "update storage.objects set bucket_id='bn-content-studio' where bucket_id='bn-content-archive'",
    );
    checks += 3;
  }
  for (const [name, actor] of [["anon", ""], ["authenticated", outsider]]) {
    await role(name, actor);
    assert.equal(
      (await db.query(
        "select * from storage.objects where bucket_id='bn-content-studio'",
      )).rows.length,
      0,
    );
    assert.equal(
      (await db.query(
        "select * from storage.objects where bucket_id='bn-content-archive'",
      )).rows.length,
      1,
    );
    await denied(
      "insert into storage.objects(bucket_id,name) values ('bn-content-studio','forged.png')",
    );
    checks += 2;
  }
  await db.exec("reset role");
  assert.deepEqual(
    (await db.query(
      "select * from pg_policies where policyname='Legacy archive untouched'",
    )).rows,
    before,
  );
  assert.deepEqual(
    (await db.query(
      "select * from storage.buckets where id='bn-content-archive'",
    )).rows,
    archiveBefore,
  );
  assert.equal(
    (await db.query("select count(*) n from public.bn_content_studio_posts"))
      .rows[0].n,
    1,
  );
  console.log(JSON.stringify({
    ok: true,
    checks,
    pglite: process.env.PGLITE_MODULE_PATH
      ? "explicit runtime override"
      : pgliteVersion,
    migration: migration.pathname.split("/").at(-1),
    coverage:
      "RLS/grants/shared masters/author/CAS/quota/storage/archive isolation",
  }));
} finally {
  await db.close();
}
