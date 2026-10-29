// Actual migration in a disposable native PostgreSQL container. No shared DB or provider.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
const container = `sett-login-claims-qa-${process.pid}`,
  image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  DOCKER_HOST: "unix:///Users/macbookpro/.colima/default/docker.sock",
};
const args = [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-w",
  "-h",
  "/login-qa",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-Atq",
];
function sql(statement) {
  const r = spawnSync("docker", args, {
    env,
    input: statement,
    encoding: "utf8",
    timeout: 20000,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(r.stderr);
  return r.stdout.trim();
}
const actor = "10000000-0000-4000-8000-000000000001",
  company = "20000000-0000-4000-8000-000000000001",
  student = "30000000-0000-4000-8000-000000000001",
  chat = "40000000-0000-4000-8000-000000000001",
  user = "50000000-0000-4000-8000-000000000001",
  instance = "60000000-0000-4000-8000-000000000001";
const nonce = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const version = "2026-10-29T10:00:00Z";
const claim = (
  n,
  purpose = "generation",
  who = actor,
  updated = version,
  jid = "12025550123@s.whatsapp.net",
) =>
  `select public.claim_student_login_${purpose}_v1('${who}','${company}','${student}','${chat}','${
    nonce(n)
  }','${updated}','${jid}','${student}','${instance}');`;
const complete = (n) =>
  `select public.complete_student_login_claim_v1('${actor}','${company}','${student}','${
    nonce(n)
  }','${version}','${user}');`;
before(async () => {
  const r = spawnSync("docker", [
    "run",
    "-d",
    "--pull=never",
    "--name",
    container,
    "--label",
    "sett.qa.owner=student-login",
    "--network",
    "none",
    "--user",
    "100:101",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--pids-limit",
    "64",
    "--ulimit",
    "core=0",
    "--tmpfs",
    "/login-qa:rw,nosuid,nodev,uid=100,gid=101,mode=0700,size=192m",
    "--entrypoint",
    "sh",
    image,
    "-ec",
    "initdb -D /login-qa/data -A trust --no-locale >/login-qa/init.log 2>&1; exec postgres -D /login-qa/data -k /login-qa -c listen_addresses= -c max_connections=8 -c shared_buffers=32MB -c shared_preload_libraries= -c statement_timeout=10000 -c lock_timeout=5000",
  ], { env, encoding: "utf8", timeout: 20000 });
  if (r.status !== 0) throw Error(r.stderr);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    const q = spawnSync("docker", [
      "exec",
      container,
      "pg_isready",
      "-h",
      "/login-qa",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ], { env, encoding: "utf8", timeout: 2000 });
    if (!q.error && q.status === 0) {
      ready = true;
      break;
    }
    await delay(100);
  }
  assert.ok(ready);
  sql(
    `create role anon;create role authenticated;create role service_role bypassrls;create table public.user_roles(user_id uuid,role text);create table public.company_members(user_id uuid,company_id uuid);create table public.students(id uuid,company_id uuid,updated_at timestamptz,user_id uuid);create table public.whatsapp_chats(id uuid,company_id uuid,student_id uuid,remote_jid text,instance_id uuid);grant all on all tables in schema public to service_role;insert into public.user_roles values('${actor}','trainer');insert into public.company_members values('${actor}','${company}');insert into public.students values('${student}','${company}','${version}','${user}');insert into public.whatsapp_chats values('${chat}','${company}','${student}','12025550123@s.whatsapp.net','${instance}');`,
  );
  sql(
    readFileSync(
      new URL(
        "../../migrations/20261029193000_student_login_claims.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
after(() => {
  const r = spawnSync("docker", ["rm", "-f", container], {
    env,
    encoding: "utf8",
    timeout: 20000,
  });
  assert.equal(r.status, 0, "owned container cleanup");
});
const reset = () =>
  sql(
    `truncate public.student_login_access_claims;update public.students set updated_at='${version}';update public.whatsapp_chats set student_id='${student}',remote_jid='12025550123@s.whatsapp.net';`,
  );
test("nonce replay and distinct concurrent generation are fenced", () => {
  reset();
  assert.equal(sql(claim(1)), "t");
  assert.equal(sql(claim(1)), "f");
  assert.equal(sql(claim(2)), "f");
  assert.equal(sql(complete(1)), "t");
  assert.equal(sql(claim(2)), "f");
  assert.equal(sql(claim(3, "send")), "t");
  assert.equal(sql(claim(3, "send")), "f");
  assert.equal(sql(complete(3)), "t");
});
test("expired uncompleted claim never authorizes uncertain Auth replay", () => {
  reset();
  sql(claim(4));
  sql(
    "update public.student_login_access_claims set lease_until=clock_timestamp()-interval '1 second';",
  );
  assert.equal(sql(claim(5)), "f");
  assert.equal(
    sql("select count(*) from public.student_login_access_claims;"),
    "1",
  );
});
test("contact version and chat destination CAS are checked before consuming nonce", () => {
  reset();
  assert.equal(sql(claim(6, "generation", actor, "2026-10-29T11:00:00Z")), "f");
  assert.equal(
    sql(claim(6, "generation", actor, version, "12025550199@s.whatsapp.net")),
    "f",
  );
  sql(`update public.whatsapp_chats set student_id='${user}';`);
  assert.equal(sql(claim(6)), "f");
  assert.equal(
    sql("select count(*) from public.student_login_access_claims;"),
    "0",
  );
});
test("service only ACL, actor/tenant check and completion owner fence", () => {
  reset();
  assert.throws(() => sql(`set role anon;${claim(7)}`), /permission denied/);
  assert.throws(
    () => sql(`set role authenticated;${claim(7)}`),
    /permission denied/,
  );
  assert.throws(() => sql(claim(7, "generation", user)), /forbidden/);
  assert.equal(sql(`set role service_role;${claim(7)}`), "t");
  assert.equal(
    sql(
      `select public.complete_student_login_claim_v1('${user}','${company}','${student}','${
        nonce(7)
      }','${version}','${user}');`,
    ),
    "f",
  );
  assert.equal(sql(complete(7)), "t");
});
function session(statement) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => out += b);
    p.stderr.on("data", (b) => err += b);
    p.on("error", reject);
    p.on("close", (code) => code ? reject(Error(err)) : resolve(out.trim()));
    p.stdin.end(statement);
  });
}
test("two native sessions, distinct nonces, same student version: one winner", async () => {
  reset();
  const results = await Promise.all([session(claim(8)), session(claim(9))]);
  assert.deepEqual(results.sort(), ["f", "t"]);
  assert.equal(
    sql("select count(*) from public.student_login_access_claims;"),
    "1",
  );
});
