// Requires a disposable, already migrated loopback database with the Studio fixtures.
// Run: PGHOST=127.0.0.1 PGPORT=... PGUSER=... PGDATABASE=... node supabase/tests/studio_integrated_modalities_race.mjs
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";

assert.match(process.env.PGHOST ?? "", /^(127\.0\.0\.1|localhost)$/);
assert.ok(process.env.PGDATABASE, "Use a disposable database");
const id = (suffix) => `00000000-0000-0000-0000-${String(suffix).padStart(12, "0")}`;
const staff = `set role authenticated; set request.jwt.claim.sub = '${id(3)}';`;
const psql = process.env.PSQL ?? "psql";
const args = ["-XqAt", "-v", "ON_ERROR_STOP=1", "-P", "pager=off"];
const sql = (command) => execFileSync(psql, args, { input: command, encoding: "utf8" }).trim();

sql(`
  insert into auth.users values ('${id(2)}'), ('${id(3)}');
  insert into companies values ('${id(1)}');
  insert into students (id, company_id, user_id) values ('${id(2)}', '${id(1)}', '${id(2)}');
  insert into enrollments values ('${id(4)}', '${id(1)}', '${id(2)}', 'active');
  insert into training_cycles (id, company_id, student_id, enrollment_id, status, start_date, end_date, cycle_number)
  values ('${id(10)}', '${id(1)}', '${id(2)}', '${id(4)}', 'active', '2026-11-01', '2026-12-12', 1);
  insert into prescription_bundles (id, company_id, student_id, training_cycle_id, has_strength, has_cardio, modalities, status, studio_modalities_draft)
  values ('${id(20)}', '${id(1)}', '${id(2)}', '${id(10)}', false, true, array['corrida'], 'generating', true);
  select public.write_studio_modality_draft('${id(20)}', '${id(10)}', '${id(1)}', '${id(2)}', 'corrida', '{}',
    '{"name":"Race","sport":"corrida","weeks":[{}]}');
  update prescription_bundles set status = 'draft' where id = '${id(20)}';
`);
const original = JSON.parse(sql(`
  select jsonb_build_object('id', id, 'updated_at', updated_at)
  from studio_modality_drafts where bundle_id = '${id(20)}';
`));
const publish = (version) => `select public.publish_studio_integrated_bundle('${id(20)}', '${id(10)}',
  '${JSON.stringify({ corrida: version })}'::jsonb)->>'replayed';`;
const edit = `select public.write_studio_modality_draft('${id(20)}', '${id(10)}', '${id(1)}', '${id(2)}',
  'corrida', '{"edited":true}', '{"weeks":[{"edited":true}]}', '${original.updated_at}', '${original.id}');`;

function start(name) {
  const child = spawn(psql, args, { env: { ...process.env, PGAPPNAME: name }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", data => { stdout += data; });
  child.stderr.setEncoding("utf8").on("data", data => { stderr += data; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
  return { child, done, output: () => stdout, write: sql => child.stdin.write(`${sql}\n`) };
}

async function until(check, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(message);
}

async function overlap(first, second, expectedFirst, expectedSecond) {
  const winner = start("studio-race-winner");
  const contender = start("studio-race-contender");
  try {
    winner.write(`begin; ${first} select 'winner-holds-transaction';`);
    await until(() => winner.output().includes("winner-holds-transaction"), "first session never acquired its locks");
    contender.write(second);
    await until(() => sql(`select exists (select 1 from pg_stat_activity
      where application_name = 'studio-race-contender' and wait_event_type = 'Lock');`) === "t",
    "second session never waited for a lock");
    winner.child.stdin.end("commit;\n");
    contender.child.stdin.end();
    const [committed, resumed] = await Promise.all([winner.done, contender.done]);
    assert.equal(committed.code, 0, committed.stderr);
    assert.match(committed.stdout, expectedFirst);
    if (typeof expectedSecond === "string") {
      assert.equal(resumed.code, 3, resumed.stdout);
      assert.ok(resumed.stderr.includes(expectedSecond), resumed.stderr);
    } else {
      assert.equal(resumed.code, 0, resumed.stderr);
      assert.match(resumed.stdout, expectedSecond);
    }
  } finally {
    for (const session of [winner, contender]) {
      if (session.child.exitCode === null) session.child.kill();
    }
  }
}

await overlap(edit, `${staff} ${publish(original)}`, /"edited": true/, "studio_bundle_changed");
const updated = JSON.parse(sql(`
  select jsonb_build_object('id', id, 'updated_at', updated_at)
  from studio_modality_drafts where bundle_id = '${id(20)}';
`));
await overlap(`${staff} ${publish(updated)}`, `${staff} ${publish(updated)}`, /^false$/m, /^true$/m);
assert.equal(sql(`select count(*) from running_plans where bundle_id = '${id(20)}' and weeks->0->>'edited' = 'true';`), "1");
assert.equal(sql(`select count(*) from prescription_bundle_items where bundle_id = '${id(20)}';`), "1");
console.log("Passed overlapping edit/publication and duplicate publication on native PostgreSQL.");
