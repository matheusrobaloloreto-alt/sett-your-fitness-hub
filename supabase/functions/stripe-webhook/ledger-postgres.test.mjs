// Native PostgreSQL seam in a disposable, network-none container, with no volumes/ports.
// Uses an existing local image only; no provider/network or shared DB changes.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync, readFileSync } from "node:fs";
const container = `sett-stripe-ledger-qa-${process.pid}`;
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const database = `self_service_stripe_${process.pid}`;
const dockerEnv = {
  ...process.env,
  DOCKER_HOST: "unix:///Users/macbookpro/.colima/default/docker.sock",
};
const args = (db) => [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-w",
  "-h",
  "/stripe-qa",
  "-U",
  "postgres",
  "-d",
  db,
  "-v",
  "ON_ERROR_STOP=1",
  "-Atq",
];
function sql(statement, db = database) {
  const r = spawnSync("docker", args(db), {
    env: dockerEnv,
    input: statement,
    encoding: "utf8",
    timeout: 20000,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(r.stderr);
  return r.stdout.trim();
}
const company = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const owner = "00000000-0000-4000-8000-000000000003",
  next = "00000000-0000-4000-8000-000000000004";
const claim = (
  id,
  created = 100,
  who = owner,
  type = "customer.subscription.updated",
) =>
  `select public.stripe_claim_event_v2('${id}','${type}',${created},'${who}');`;
const apply = (
  id,
  who = owner,
  tenant = company,
  sub = "sub_synthetic",
  type = "customer.subscription.updated",
  status = "active",
  tier = "advanced",
) =>
  `select public.stripe_apply_event_v2('${id}','${who}','${tenant}','${sub}','${status}','${tier}');`;

before(async () => {
  const start = spawnSync("docker", [
    "run",
    "--detach",
    "--pull=never",
    "--name",
    container,
    "--network",
    "none",
    "--label",
    "sett.qa.owner=stripe-ledger",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--pids-limit",
    "64",
    "--ulimit",
    "core=0",
    "--tmpfs",
    "/stripe-qa:rw,nosuid,nodev,uid=100,gid=101,mode=0700,size=192m",
    "--user",
    "postgres",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "initdb -D /stripe-qa/data --auth=trust --no-locale >/stripe-qa/init.log && exec postgres -D /stripe-qa/data -c listen_addresses= -c unix_socket_directories=/stripe-qa -c shared_preload_libraries= -c max_connections=8 -c shared_buffers=32MB -c statement_timeout=10000 -c lock_timeout=5000",
  ], { env: dockerEnv, encoding: "utf8", timeout: 20000 });
  if (start.status !== 0) throw Error(start.stderr);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    const r = spawnSync("docker", [
      "exec",
      container,
      "pg_isready",
      "-h",
      "/stripe-qa",
      "-U",
      "postgres",
    ], { env: dockerEnv, encoding: "utf8", timeout: 2000 });
    if (!r.error && r.status === 0) {
      ready = true;
      break;
    }
    await delay(100);
  }
  assert.ok(ready, "isolated PG ready");
  const settings = JSON.parse(
    sql(
      "select json_build_object('version',current_setting('server_version_num'),'preload',current_setting('shared_preload_libraries'),'listen',current_setting('listen_addresses'),'recovery',pg_is_in_recovery());",
      "postgres",
    ),
  );
  assert.deepEqual(settings, {
    version: "170006",
    preload: "",
    listen: "",
    recovery: false,
  });
  sql(
    "create role anon;create role authenticated;create role service_role bypassrls;",
    "postgres",
  );
  sql(`create database ${database};`, "postgres");
  sql(
    `create table public.companies(id uuid primary key,subscription_status text,tier text);create table public.company_billing(id uuid primary key default gen_random_uuid(),company_id uuid not null unique,stripe_subscription_id text,stripe_customer_id text);grant all on public.companies,public.company_billing to service_role;insert into public.companies values('${company}','active','basic'),('${other}','active','basic');`,
  );
  sql(
    readFileSync(
      new URL(
        "../../migrations/20260717133000_integration_webhook_idempotency.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const path = new URL(
    "../../migrations/20261029182000_stripe_event_ledger.sql",
    import.meta.url,
  );
  if (existsSync(path)) sql(readFileSync(path, "utf8"));
});
after(() => {
  // Only our synthetic instance can contribute logs, never the shared Supabase DB.
  const logs = spawnSync("docker", ["logs", "--tail", "8", container], {
    env: dockerEnv,
    encoding: "utf8",
    timeout: 2000,
  });
  if (
    /FATAL|PANIC|signal 11|database system is shut down/.test(logs.stderr || "")
  ) process.stderr.write(logs.stderr);
  spawnSync("docker", ["rm", "-f", container], {
    env: dockerEnv,
    encoding: "utf8",
    timeout: 20000,
  });
});
function reset() {
  sql(
    `truncate public.integration_webhook_events,public.company_billing;update public.companies set subscription_status='active',tier='basic';insert into public.company_billing(company_id,stripe_subscription_id,stripe_last_event_created,stripe_last_event_id) values('${company}','sub_synthetic',1,'evt_fixture_baseline');`,
  );
}
test("durable claim, expired recovery, owner fencing and crash after atomic commit", () => {
  reset();
  assert.equal(sql(claim("evt_recover")), "claimed");
  assert.equal(sql(claim("evt_recover", 100, next)), "busy");
  sql(
    "update public.integration_webhook_events set stripe_lease_until=clock_timestamp()-interval '1 second';",
  );
  assert.equal(sql(claim("evt_recover", 100, next)), "claimed");
  assert.throws(() => sql(apply("evt_recover")), /lease|owner/);
  assert.equal(sql(apply("evt_recover", next)), "applied");
  assert.equal(sql(claim("evt_recover", 100, owner)), "completed");
  assert.equal(
    sql(`select tier from public.companies where id='${company}';`),
    "advanced",
  );
  assert.equal(
    sql(`select public.stripe_fail_event_v2('evt_recover','${owner}');`),
    "f",
  );
});
test("ledger completion failure rolls back company AND billing writes", () => {
  reset();
  sql(claim("evt_rollback", 100, owner, "checkout.session.completed"));
  sql(
    `create function reject_completion() returns trigger language plpgsql as $$begin if new.status='completed' then raise exception 'synthetic completion failure';end if;return new;end$$;create trigger reject_completion before update on public.integration_webhook_events for each row execute function reject_completion();`,
  );
  try {
    assert.throws(
      () => sql(apply("evt_rollback", owner, company, "sub_new")),
      /synthetic completion failure/,
    );
    assert.equal(
      sql(`select tier from public.companies where id='${company}';`),
      "basic",
    );
    assert.equal(
      sql("select stripe_subscription_id from public.company_billing;"),
      "sub_synthetic",
    );
    assert.equal(
      sql("select status from public.integration_webhook_events;"),
      "processing",
    );
  } finally {
    sql(
      "drop trigger reject_completion on public.integration_webhook_events;drop function reject_completion();",
    );
  }
  assert.equal(
    sql(apply("evt_rollback", owner, company, "sub_new")),
    "applied",
  );
});
test("zero-row company update and billing errors cannot complete", () => {
  reset();
  sql(claim("evt_zero"));
  sql(
    `create function skip_company() returns trigger language plpgsql as $$begin return null;end$$;create trigger skip_company before update on public.companies for each row execute function skip_company();`,
  );
  try {
    assert.throws(() => sql(apply("evt_zero")), /row count/);
  } finally {
    sql(
      "drop trigger skip_company on public.companies;drop function skip_company();",
    );
  }
  assert.equal(
    sql("select status from public.integration_webhook_events;"),
    "processing",
  );
});
test("older replay completes without overwriting new state; equal timestamp is uncertain", () => {
  reset();
  sql(claim("evt_new", 200));
  sql(apply("evt_new"));
  sql(claim("evt_old", 100, owner, "customer.subscription.deleted"));
  assert.equal(
    sql(
      apply(
        "evt_old",
        owner,
        company,
        "sub_synthetic",
        "customer.subscription.deleted",
        "canceled",
        "basic",
      ),
    ),
    "stale",
  );
  assert.equal(
    sql(`select tier from public.companies where id='${company}';`),
    "advanced",
  );
  sql(claim("evt_tie", 200));
  assert.throws(() => sql(apply("evt_tie")), /order.*reconcil/);
});
test("legacy uncertainty, wrong tenant/subscription and event identity fail closed", () => {
  reset();
  sql(
    "insert into public.integration_webhook_events(provider,event_id,event_type,status) values('stripe','evt_legacy','customer.subscription.updated','failed');",
  );
  assert.equal(sql(claim("evt_legacy")), "reconcile");
  sql(claim("evt_mismatch"));
  assert.throws(() => sql(claim("evt_mismatch", 101)), /identity/);
  assert.throws(() => sql(apply("evt_mismatch", owner, other)), /binding/);
  assert.throws(
    () => sql(apply("evt_mismatch", owner, company, "sub_foreign")),
    /binding/,
  );
  assert.equal(
    sql(`select tier from public.companies where id='${other}';`),
    "basic",
  );
});
test("roles cannot invoke ledger RPCs; only service_role", () => {
  assert.throws(
    () => sql(`set role authenticated;${claim("evt_forbidden")}`),
    /permission denied/,
  );
  assert.throws(
    () => sql(`set role anon;${claim("evt_forbidden")}`),
    /permission denied/,
  );
  assert.equal(sql(`set role service_role;${claim("evt_service")}`), "claimed");
});
function session(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args(database), {
      env: dockerEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (b) => out += b);
    child.stderr.on("data", (b) => err += b);
    child.on("error", reject);
    child.on(
      "close",
      (code) => code ? reject(Error(err)) : resolve(out.trim()),
    );
    child.stdin.end(statement);
  });
}
test("two real sessions: exactly one claim owner and fenced stale fail", async () => {
  reset();
  const results = await Promise.all([
    session(claim("evt_race", 100, owner)),
    session(claim("evt_race", 100, next)),
  ]);
  assert.deepEqual(results.sort(), ["busy", "claimed"]);
  assert.equal(
    sql("select count(*) from public.integration_webhook_events;"),
    "1",
  );
  const winner = sql(
    "select stripe_owner::text from public.integration_webhook_events;",
  );
  const loser = winner === owner ? next : owner;
  assert.equal(
    sql(`select public.stripe_fail_event_v2('evt_race','${loser}');`),
    "f",
  );
  assert.equal(sql(apply("evt_race", winner)), "applied");
});

test("legacy billing without ordering baseline cannot overwrite an uncertain newer state", () => {
  reset();
  sql(
    "update public.company_billing set stripe_last_event_created=null,stripe_last_event_id=null;",
  );
  sql(claim("evt_no_baseline"));
  assert.throws(() => sql(apply("evt_no_baseline")), /baseline.*reconcil/);
  assert.equal(
    sql("select status from public.integration_webhook_events;"),
    "processing",
  );
});

test("billing zero rows and SQL exception roll back company state", () => {
  reset();
  sql(claim("evt_billing"));
  sql(
    `create function reject_billing() returns trigger language plpgsql as $$begin return null;end$$;create trigger reject_billing before insert or update on public.company_billing for each row execute function reject_billing();`,
  );
  try {
    assert.throws(() => sql(apply("evt_billing")), /billing row count/);
    assert.equal(
      sql(`select tier from public.companies where id='${company}';`),
      "basic",
    );
    assert.equal(
      sql("select status from public.integration_webhook_events;"),
      "processing",
    );
  } finally {
    sql(
      "drop trigger reject_billing on public.company_billing;drop function reject_billing();",
    );
  }
});
test("failed owner can retry, missing company cannot complete, and service role can commit", () => {
  reset();
  sql(claim("evt_failed"));
  assert.equal(
    sql(`select public.stripe_fail_event_v2('evt_failed','${owner}');`),
    "t",
  );
  assert.equal(sql(claim("evt_failed", 100, next)), "claimed");
  assert.throws(
    () =>
      sql(apply("evt_failed", next, "00000000-0000-4000-8000-000000000099")),
    /company row count/,
  );
  assert.equal(
    sql(`set role service_role;${apply("evt_failed", next)}`),
    "applied",
  );
});
test("new checkout establishes a binding, but cannot share subscription across tenants", () => {
  reset();
  sql(claim("evt_shared", 100, owner, "checkout.session.completed"));
  assert.throws(
    () => sql(apply("evt_shared", owner, other)),
    /binding conflict/,
  );
  sql(claim("evt_first", 101, next, "checkout.session.completed"));
  assert.equal(sql(apply("evt_first", next, other, "sub_other")), "applied");
  assert.equal(
    sql(
      `select stripe_subscription_id from public.company_billing where company_id='${other}';`,
    ),
    "sub_other",
  );
});
