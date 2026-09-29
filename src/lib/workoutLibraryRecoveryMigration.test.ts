import { execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const sql = readFileSync(`${process.cwd()}/supabase/migrations/20260929125055_recover_workout_library_references.sql`, "utf8");
describe("workout library recovery migration contract", () => {
  it("keeps current RLS, invoker privileges and explicit staff authorization", () => {
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain("public.is_company_staff(v_actor, p_company_id)");
    expect(sql).toContain("v_actor is null or p_company_id is null");
    expect(sql).toContain("set search_path = pg_catalog, public");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to authenticated;");
    expect(sql).not.toMatch(/create policy|alter table|disable row level security/i);
  });
  it("serializes before scoped exact lookup and never queries private foreign ids", () => {
    expect(sql.indexOf("perform pg_advisory_xact_lock")).toBeLessThan(sql.indexOf("select array_agg(e.id"));
    expect(sql).toContain("e.company_id = p_company_id or e.is_global = true");
    expect(sql).toContain("public.exercise_taxonomy_key(e.name) = v_name_key");
    expect(sql).toContain("workout_library_recovery_ambiguous");
    expect(sql).not.toContain("where e.id =");
    expect(sql).not.toMatch(/update public\.|delete from|insert into public\.(workouts|workout_templates)/i);
  });
  it("uses strict metadata whitelist, generated ids and positive scoped ACK", () => {
    expect(sql).toContain("('name', 'muscle_group', 'equipment', 'category', 'categories')");
    expect(sql).toContain("false, v_actor");
    expect(sql).toContain("'ok', true, 'company_id', p_company_id, 'actor_id', v_actor");
    expect(sql).toContain("'input_index', v_index, 'exercise_id', v_id");
    expect(sql).toContain("jsonb_array_length(p_exercises) > 500");
  });
  it("parses one marked ACK despite command tags and surrounding whitespace", () => {
    const ack = { ok: true, mappings: [{ input_index: 0, exercise_id: actor }] };
    expect(concurrentResult(`SET\nBEGIN\n  ${concurrentAckPrefix}${JSON.stringify(ack)} \r\n\nCOMMIT\n`)).toEqual(ack);
  });
  it("rejects missing or duplicate ACKs with synthetic stdout diagnostics", () => {
    expect(() => concurrentResult("SET\nBEGIN\nCOMMIT\n")).toThrow(/Expected one concurrency ACK, received 0.*Synthetic psql stdout/);
    expect(() => concurrentResult(`${concurrentAckPrefix}{}\n${concurrentAckPrefix}{}`)).toThrow(/received 2/);
  });
});

// Opt in only to an installed local Docker DB. Create/drop a separate synthetic
// database; never use the container's application database or a connection URL.
const container = process.env.SETT_LOCAL_DB_CONTAINER;
const database = `sett_library_recovery_qa_${process.pid}`;
const company = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const actor = "11111111-1111-1111-1111-111111111111";
const execAsync = promisify(execFile);
const psqlArgs = ["exec", "-i", container || "", "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"];
let stoppingQueries = false;
const runningQueries = new Map<ChildProcess, Promise<string>>();
const runQuery = (args: string[], input?: string, timeout = 45000) => {
  if (stoppingQueries) return Promise.reject(new Error("Synthetic PostgreSQL queries stopped before cleanup."));
  let child: ChildProcess;
  const pending = new Promise<string>((resolve, reject) => {
    child = execFile("docker", args, { encoding: "utf8", timeout }, (error, stdout, stderr) => {
      if (error) reject(new Error(`Synthetic psql failed: ${error.message}; stdout=${JSON.stringify(stdout)}; stderr=${JSON.stringify(stderr)}`));
      else if (!stdout.trim()) reject(new Error(`Synthetic psql returned empty stdout; stderr=${JSON.stringify(stderr)}`));
      else resolve(stdout);
    });
    child.stdin?.end(input);
  });
  runningQueries.set(child!, pending);
  const remove = () => runningQueries.delete(child!);
  void pending.then(remove, remove);
  return pending;
};
const query = (input: string) => runQuery(psqlArgs, input);
async function stopQueries() {
  stoppingQueries = true;
  const pending = [...runningQueries.values()];
  for (const child of runningQueries.keys()) child.kill("SIGTERM");
  await Promise.allSettled(pending);
}
const asUser = (user: string, body: string) => `set role authenticated; set request.jwt.claim.sub = '${user}'; ${body}`;
const call = (items: unknown[], tenant = company) => `select public.ensure_workout_library_references('${tenant}', '${JSON.stringify(items).replaceAll("'", "''")}'::jsonb);`;
const result = (output: string) => JSON.parse(output.trim().split("\n").at(-1)!);
const concurrentAckPrefix = "sett_recovery_ack:";
function concurrentResult(output: string) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith(concurrentAckPrefix));
  if (lines.length !== 1) throw new Error(`Expected one concurrency ACK, received ${lines.length}. Synthetic psql stdout: ${JSON.stringify(output)}`);
  return JSON.parse(lines[0].slice(concurrentAckPrefix.length));
}
let createdDatabase = false;

describe.skipIf(!container)("local PostgreSQL workout recovery", () => {
  beforeAll(async () => {
    if (!container || !/^supabase_db_[a-zA-Z0-9_-]+$/.test(container)) throw new Error("Only a local Supabase Docker container is allowed.");
    createdDatabase = true;
    await execAsync("docker", ["exec", container, "createdb", "-U", "postgres", "-T", "template0", database], { timeout: 60000 });
    await query(readFileSync(`${process.cwd()}/supabase/tests/workout_library_recovery_fixture.sql`, "utf8"));
    const auth = readFileSync(`${process.cwd()}/supabase/migrations/20260718120000_harden_student_tenant_isolation.sql`, "utf8");
    const staff = auth.slice(auth.indexOf("create or replace function public.is_company_staff"), auth.indexOf("create or replace function public.is_student_company_staff"));
    const taxonomy = readFileSync(`${process.cwd()}/supabase/migrations/20260914124000_exercise_taxonomy_contract.sql`, "utf8");
    const key = taxonomy.slice(taxonomy.indexOf("create or replace function public.exercise_taxonomy_key"), taxonomy.indexOf("create or replace function public.canonical_volume_muscle_group"));
    await query(staff + key + `
      create policy recovery_select on public.exercise_library for select to authenticated using (is_global or public.is_company_staff(auth.uid(), company_id));
      create policy recovery_insert on public.exercise_library for insert to authenticated with check (not is_global and public.is_company_staff(auth.uid(), company_id));
    ` + sql);
  }, 120000);
  afterEach(async () => {
    // Vitest timeouts do not cancel async bodies. Stop late queries instead of
    // allowing them to race the next test or dropdb.
    if (runningQueries.size) await stopQueries();
  });
  afterAll(async () => {
    await stopQueries();
    if (createdDatabase) await execAsync("docker", ["exec", container!, "dropdb", "-U", "postgres", "--if-exists", "--force", database], { timeout: 60000 });
  }, 65000);

  it("denies anonymous, unauthenticated, student and foreign-company staff", async () => {
    const output = await query(`
      do $$ declare scenario integer; rejected boolean; tenant uuid; begin
        for scenario in 1..4 loop
          rejected := false;
          tenant := '${company}';
          if scenario = 1 then set local role anon; else set local role authenticated; end if;
          perform set_config('request.jwt.claim.sub', case scenario
            when 3 then '55555555-5555-5555-5555-555555555555'
            when 4 then '${actor}' else '' end, true);
          if scenario = 4 then tenant := '${other}'; end if;
          begin
            perform public.ensure_workout_library_references(tenant, '[{"name":"Denied"}]'::jsonb);
          exception when insufficient_privilege then
            if scenario <> 1 and sqlerrm <> 'workout_library_recovery_forbidden' then raise; end if;
            rejected := true;
          end;
          reset role;
          if not rejected then raise exception 'Expected authorization rejection in scenario %', scenario; end if;
          if exists(select 1 from public.exercise_library) then raise exception 'Denied request wrote a row'; end if;
        end loop;
      end $$;
      select (select count(*) from public.exercise_library), prosecdef
      from pg_proc where proname='ensure_workout_library_references';
    `);
    expect(output.trim().split("\n").at(-1)).toBe("0|f");
  });

  it("creates only company rows, leaves taxonomy empty and replay reuses exact key", async () => {
    const item = [{ name: "Replay Agachamento", muscle_group: "Quadríceps" }];
    const output = await query(asUser(actor, `
      ${call(item)}
      ${call([{ name: " replay agachamento ", muscle_group: "Quadríceps" }])}
      select id, is_global, created_by, category is null, cardinality(categories), difficulty
      from public.exercise_library
      where company_id='${company}' and public.exercise_taxonomy_key(name)=public.exercise_taxonomy_key('Replay Agachamento');
    `));
    const lines = output.trim().split("\n").map((line) => line.trim());
    const acknowledgements = lines.filter((line) => line.startsWith("{"));
    expect(acknowledgements).toHaveLength(2);
    const first = JSON.parse(acknowledgements[0]);
    const replay = JSON.parse(acknowledgements[1]);
    expect(first).toMatchObject({ ok: true, actor_id: actor, company_id: company, created_count: 1 });
    expect(replay).toMatchObject({ ok: true, actor_id: actor, company_id: company, created_count: 0 });
    expect(replay.mappings).toEqual(first.mappings);
    expect(lines.filter((line) => line.includes("|"))).toEqual([`${first.mappings[0].exercise_id}|f|${actor}|t|0|intermediate`]);
  });

  it("reuses globals but never reads or copies a foreign private row", async () => {
    await query(`insert into public.exercise_library(company_id,name,is_global,description) values (null,'Global Match',true,'global'), ('${other}','Private Match',false,'foreign private metadata');`);
    const global = result(await query(asUser(actor, call([{ name: "Global Match" }]))));
    const privateCopy = result(await query(asUser(actor, call([{ name: "Private Match" }]))));
    expect(global.created_count).toBe(0);
    expect(privateCopy.created_count).toBe(1);
    expect((await query(`select company_id, is_global, description is null from public.exercise_library where id='${privateCopy.mappings[0].exercise_id}';`)).trim()).toBe(`${company}|f|t`);
  });

  it("supports second-company staff and master without global publication", async () => {
    for (const user of ["66666666-6666-6666-6666-666666666666", "77777777-7777-7777-7777-777777777777"]) {
      const ack = result(await query(asUser(user, call([{ name: `Staff ${user}` }], other))));
      expect(ack).toMatchObject({ company_id: other, created_count: 1 });
      expect((await query(`select is_global from public.exercise_library where id='${ack.mappings[0].exercise_id}';`)).trim()).toBe("f");
    }
  });

  it("rejects malformed/forged/clinical payloads atomically", async () => {
    const cases = [{ name: "Bad", is_global: true }, { name: "Bad", notes: "private" }, { name: "Bad", exercise_id: "foreign" }, { name: {} }, { name: "Bad", categories: ["invented"] }, { name: "Bad", muscle_group: {} }];
    const output = await query(asUser(actor, `
      do $$ declare item jsonb; rejected boolean; begin
        for item in select value from jsonb_array_elements('${JSON.stringify(cases)}'::jsonb) loop
          rejected := false;
          begin
            perform public.ensure_workout_library_references('${company}', jsonb_build_array(jsonb_build_object('name', 'Must rollback'), item));
          exception when others then
            if sqlstate <> '22023' or sqlerrm not like 'workout_library_recovery_%' then raise; end if;
            rejected := true;
          end;
          if not rejected then raise exception 'Expected invalid metadata rejection: %', item; end if;
          if exists(select 1 from public.exercise_library where name='Must rollback') then
            raise exception 'Invalid metadata batch left a partial insert';
          end if;
        end loop;
      end $$;
      select count(*) from public.exercise_library where name='Must rollback';
    `));
    expect(output.trim().split("\n").at(-1)).toBe("0");
  });

  it("rejects ambiguity without partial creation and uses explicit group only when unique", async () => {
    const output = await query(asUser(actor, `
      insert into public.exercise_library(company_id,name,muscle_group) values ('${company}','Ambiguous','Grupo A'),('${company}','Ambiguous','Grupo B');
      do $$ declare rejected boolean := false; begin
        begin
          perform public.ensure_workout_library_references('${company}', '[{"name":"Rollback ambiguity"},{"name":"Ambiguous"}]'::jsonb);
        exception when others then
          if sqlstate <> '23514' or sqlerrm <> 'workout_library_recovery_ambiguous' then raise; end if;
          rejected := true;
        end;
        if not rejected then raise exception 'Expected ambiguous name rejection'; end if;
        if exists(select 1 from public.exercise_library where name='Rollback ambiguity') then
          raise exception 'Ambiguous batch left a partial insert';
        end if;
      end $$;
      ${call([{ name: "Ambiguous", muscle_group: "Grupo B" }])}
    `));
    const ack = result(output);
    expect(ack).toMatchObject({ ok: true, actor_id: actor, company_id: company, created_count: 0 });
    expect(ack.mappings).toHaveLength(1);
  });

  it("handles concurrent requests and lost-ACK replay without duplicate rows", async () => {
    const ackQuery = `select '${concurrentAckPrefix}' || public.ensure_workout_library_references('${company}', '[{"name":"Concurrent exact","muscle_group":"Grupo"}]'::jsonb)::text;`;
    // Use the same stdin execution path as sequential tests, with a distinct
    // ACK marker among the transaction's command results.
    const outputs = await Promise.allSettled(Array.from({ length: 6 }, () => runQuery(psqlArgs, asUser(actor, `begin; ${ackQuery} select pg_sleep(0.08); commit;`), 15000)));
    const acks = outputs.map((output) => {
      if (output.status !== "fulfilled") throw output.reason;
      const ack = concurrentResult(output.value);
      expect(ack).toMatchObject({ ok: true, actor_id: actor, company_id: company, mappings: [{ input_index: 0 }] });
      expect(ack.mappings).toHaveLength(1);
      expect(ack.mappings[0].exercise_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect([0, 1]).toContain(ack.created_count);
      return ack;
    });
    expect(new Set(acks.map((ack) => ack.mappings[0].exercise_id)).size).toBe(1);
    expect(acks.reduce((sum, ack) => sum + ack.created_count, 0)).toBe(1);
    expect((await query("select count(*) from public.exercise_library where name='Concurrent exact';")).trim()).toBe("1");
    expect(result(await query(asUser(actor, call([{ name: "Concurrent exact", muscle_group: "Grupo" }])))).created_count).toBe(0);
  }, 20000);
});
