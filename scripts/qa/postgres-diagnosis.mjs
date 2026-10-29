import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(repo, 'output', `postgres-diagnosis-${Date.now()}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const dedicated = ['sett-self-service-xp-isolated-20261026', 'sett-self-service-xp-isolated-20261026-supabase'];
const shared = 'supabase_db_sett-self-service-local-20261026';
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, DO_NOT_TRACK: '1' };
const settingsSql = `select json_object_agg(name,setting) from pg_settings where name in
 ('server_version','shared_preload_libraries','session_preload_libraries','local_preload_libraries',
 'jit','jit_above_cost','jit_inline_above_cost','jit_optimize_above_cost','shared_buffers',
 'work_mem','maintenance_work_mem','max_connections','max_stack_depth','huge_pages',
 'plan_cache_mode','track_functions','log_error_verbosity','compute_query_id',
 'plpgsql_check.fatal_errors','plpgsql_check.mode','pgaudit.log','auto_explain.log_min_duration',
 'supautils.hint_roles','supautils.privileged_role','supautils.superuser');`;

async function docker(args, input, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['--context', 'colima', ...args], { cwd: repo, env: environment });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    child.stdout.on('data', part => { stdout += part; });
    child.stderr.on('data', part => { stderr += part; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut, stdout, stderr }); });
    child.stdin.end(input);
  });
}

function save(name, value) {
  writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

async function query(container, database, sql, sessionPreload = '', hints = true) {
  if (!dedicated.includes(container) || !/^sett_pg_diag_[0-9]+$/.test(database)) throw new Error('Dedicated diagnostic postmaster/database required');
  if (sessionPreload && (sessionPreload !== 'supautils' || container !== dedicated[1])) throw new Error('Unsupported session preload');
  return docker(['exec', '-i', '-e', `PGOPTIONS=-c statement_timeout=12000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=20000${sessionPreload ? ` -c session_preload_libraries=supautils -c supautils.hint_roles=${hints ? 'anon,authenticated,service_role' : ''}` : ''}`,
    container, 'psql', '-X', '-U', sessionPreload ? 'supabase_admin' : 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'],
  sessionPreload ? `set session authorization postgres;\n${sql}` : sql, 45000);
}

async function snapshot(container) {
  const inspection = await docker(['inspect', '--format', '{{json .State}}|{{.HostConfig.Memory}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.ShmSize}}|{{.Image}}|{{index .Config.Labels "sett.qa.scope"}}', container]);
  if (inspection.code !== 0) throw new Error(`Cannot inspect ${container}`);
  const [rawState, memory, nanoCpus, shm, image, label] = inspection.stdout.trim().split('|');
  const state = JSON.parse(rawState);
  if (dedicated.includes(container) && label !== 'self-service-xp-isolated') throw new Error('Dedicated ownership label missing');
  // Shared server reads are fixed statements: no fixture, DO, role switch, or reset can reach it.
  const settings = await docker(['exec', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-At', '-c', settingsSql]);
  const resources = await docker(['exec', container, 'sh', '-c',
    'cat /sys/fs/cgroup/memory.events /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /proc/sys/kernel/core_pattern; cat /proc/1/limits; ls -ln /var/lib/postgresql/data/core /var/lib/postgresql/core 2>/dev/null']);
  const logs = await docker(['logs', '--tail', '30000', container], undefined, 45000);
  const events = (logs.stdout + logs.stderr).split('\n').filter(line =>
    /terminated by signal|Segmentation fault|reinitializing|out of memory|database system was interrupted|database system is ready|PANIC:|core dump/.test(line));
  return { container, time: new Date().toISOString(), image, memory, nanoCpus, shm,
    state: { status: state.Status, oomKilled: state.OOMKilled, exitCode: state.ExitCode, startedAt: state.StartedAt },
    settings: settings.code === 0 ? JSON.parse(settings.stdout.trim()) : { unavailable: true },
    resources: resources.stdout, events, logsExitCode: logs.code };
}

function expand(filename) {
  const absolute = path.resolve(filename);
  if (!absolute.startsWith(path.join(repo, 'supabase/'))) throw new Error('SQL include outside repository');
  return readFileSync(absolute, 'utf8').replace(/^\\ir\s+([^\r\n]+)$/gm,
    (_, file) => expand(path.resolve(path.dirname(absolute), file.trim())));
}

const before = [];
const minimal = process.argv[2] === '--minimal';
for (const container of minimal ? [dedicated[1]] : [...dedicated, shared]) before.push(await snapshot(container));
save('before.json', before);
console.log(JSON.stringify({ directory, snapshots: before.map(row => ({ container: row.container, settings: row.settings, events: row.events })) }, null, 2));
if (process.argv[2] === '--snapshot-only') process.exit(0);
if (minimal) {
  const container = dedicated[1], database = `sett_pg_diag_${process.pid}`;
  const created = await docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database]);
  if (created.code !== 0) throw new Error('Minimal diagnostic database creation failed');
  const source = `begin;
    create function public.diag_denied() returns int language plpgsql volatile as $$ begin return 1; end $$;
    revoke all on function public.diag_denied() from public;
    set local role authenticated;
    do $$ begin
      perform public.diag_denied();
      raise exception 'authorization bypass';
    exception when insufficient_privilege then
      raise notice 'expected_sqlstate_42501';
    end $$;
    rollback;`;
  const results = [];
  for (const [name, preload, hints] of [['no-extension', '', false], ['extension-no-hints', 'supautils', false], ['extension-with-hints', 'supautils', true]]) {
    const result = await query(container, database,
      `select current_user,current_setting('session_preload_libraries'),current_setting('supautils.hint_roles',true);\n${source}`, preload, hints);
    const row = { name, code: result.code, timedOut: result.timedOut, signal: result.signal,
      permissionDeniedCaught: result.stderr.includes('expected_sqlstate_42501'), settings: result.stdout.split('\n')[0],
      errors: result.stderr.split('\n').filter(line => /ERROR|FATAL|PANIC|server closed|connection.*lost/.test(line)) };
    results.push(row); save('minimal-results.json', results); console.log(JSON.stringify(row));
    if (result.code !== 0) break;
  }
  save('minimal-source.json', { source, sha256: createHash('sha256').update(source).digest('hex'), database });
  save('after.json', [await snapshot(container)]);
  console.log(JSON.stringify({ directory, database, retained: true }));
  process.exit(results.every(row => row.code === 0) ? 0 : 1);
}
if (!['--run', '--supautils'].includes(process.argv[2])) throw new Error('Usage: --snapshot-only|--run|--supautils');
const supautilsOnly = process.argv[2] === '--supautils';

const xp = expand(path.join(repo, 'supabase/tests/company_experience_fixture.sql'));
const test = readFileSync(path.join(repo, 'src/lib/workoutLibraryRecoveryMigration.test.ts'), 'utf8');
const auth = readFileSync(path.join(repo, 'supabase/migrations/20260718120000_harden_student_tenant_isolation.sql'), 'utf8');
const taxonomy = readFileSync(path.join(repo, 'supabase/migrations/20260914124000_exercise_taxonomy_contract.sql'), 'utf8');
const recovery = readFileSync(path.join(repo, 'supabase/migrations/20260929125055_recover_workout_library_references.sql'), 'utf8');
const marker = test.indexOf('it("denies anonymous, unauthenticated, student and foreign-company staff"');
if (marker < 0) throw new Error('Negative authorization test marker missing');
const start = test.indexOf('do $$ declare scenario', marker);
const end = test.indexOf('end $$;', start) + 'end $$;'.length;
if (start < 0 || end <= start) throw new Error('Negative authorization body missing');
const negative = test.slice(start, end).replaceAll('${company}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  .replaceAll('${other}', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  .replaceAll('${actor}', '11111111-1111-1111-1111-111111111111');
if (negative.includes('${')) throw new Error('Unresolved synthetic variable');
const library = `begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
${readFileSync(path.join(repo, 'supabase/tests/workout_library_recovery_fixture.sql'), 'utf8')}
${auth.slice(auth.indexOf('create or replace function public.is_company_staff'), auth.indexOf('create or replace function public.is_student_company_staff'))}
${taxonomy.slice(taxonomy.indexOf('create or replace function public.exercise_taxonomy_key'), taxonomy.indexOf('create or replace function public.canonical_volume_muscle_group'))}
create policy recovery_select on public.exercise_library for select to authenticated using (is_global or public.is_company_staff(auth.uid(), company_id));
create policy recovery_insert on public.exercise_library for insert to authenticated with check (not is_global and public.is_company_staff(auth.uid(), company_id));
${recovery}
${Array(40).fill(negative).join('\n')}
rollback;`;
save('sources.json', { xpSha256: createHash('sha256').update(xp).digest('hex'),
  librarySha256: createHash('sha256').update(library).digest('hex'),
  authorizationDoSha256: createHash('sha256').update(negative).digest('hex'), negativeExecutionsPerCase: 40 });
const results = [];
let stop = false;
for (const container of supautilsOnly ? [dedicated[1]] : dedicated) {
  const database = `sett_pg_diag_${process.pid}`;
  const created = await docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database]);
  if (created.code !== 0) throw new Error('Diagnostic database creation failed');
  // Four bounded connections create moderate concurrent CPU/cache load. No unbounded allocator.
  try {
    const modes = supautilsOnly ? [
      ['supautils-default', ''], ['supautils-no-jit', 'set jit=off;'],
      ['supautils-auto-explain', 'set auto_explain.log_min_duration=10000;'],
    ] : [
      ['default', ''], ['no-jit', 'set jit=off;'],
      ['forced-jit-generic', 'set jit=on; set jit_above_cost=0; set plan_cache_mode=force_generic_plan;'],
      ['forced-jit-custom', 'set jit=on; set jit_above_cost=0; set plan_cache_mode=force_custom_plan;'],
    ];
    for (const [mode, options] of modes) {
      for (const [fixture, sql] of [['xp', xp], ['library', library]]) {
        const time = Date.now();
        const result = await query(container, database, `${options}\n${sql}`, supautilsOnly ? 'supautils' : '');
        const row = { container, mode, fixture, passed: result.code === 0, code: result.code,
          signal: result.signal, timedOut: result.timedOut, durationMs: Date.now() - time,
          errors: result.stderr.split('\n').filter(line => /ERROR|FATAL|PANIC|server closed|connection.*lost/.test(line)) };
        results.push(row); save('results.json', results); console.log(JSON.stringify(row));
        if (!row.passed) { stop = true; break; }
      }
      if (stop) break;
    }
    if (!stop && !supautilsOnly) {
      const time = Date.now();
      const load = await Promise.allSettled(Array.from({ length: 4 }, () => query(container, database,
        `set jit=on; set jit_above_cost=0; select sum(sqrt(i::float8)) from generate_series(1,400000) i;`)));
      const row = { container, mode: 'four-concurrent-connections', fixture: 'bounded-cpu-load',
        passed: load.every(item => item.status === 'fulfilled' && item.value.code === 0), durationMs: Date.now() - time,
        workers: load.map(item => item.status === 'fulfilled' ? { code: item.value.code, signal: item.value.signal,
          timedOut: item.value.timedOut, stderr: item.value.stderr } : { error: String(item.reason) }) };
      results.push(row); save('results.json', results); console.log(JSON.stringify(row));
      if (!row.passed) stop = true;
      // A fresh backend after load, then repeated schema/plan invalidation in one backend.
      for (const [fixture, sql] of [['xp-after-load', xp], ['library-after-load', library], ['xp-schema-reuse', xp.repeat(4)]]) {
        if (stop) break;
        const result = await query(container, database, sql);
        const row = { container, mode: 'after-load', fixture, passed: result.code === 0,
          code: result.code, signal: result.signal, timedOut: result.timedOut,
          errors: result.stderr.split('\n').filter(line => /ERROR|FATAL|PANIC|server closed|connection.*lost/.test(line)) };
        results.push(row); save('results.json', results); console.log(JSON.stringify(row));
        if (!row.passed) { stop = true; break; }
      }
    }
  } finally {
    // Preserve this database and any core on failure; never force-drop or restart a server.
    if (!stop) {
      const dropped = await docker(['exec', container, 'dropdb', '-U', 'postgres', database]);
      if (dropped.code !== 0) throw new Error('Diagnostic cleanup failed; database retained');
    }
  }
  if (stop) break;
}
const after = [];
for (const container of dedicated) after.push(await snapshot(container));
save('after.json', after);
console.log(JSON.stringify({ directory, cases: results.length, passed: results.filter(row => row.passed).length,
  after: after.map(row => ({ container: row.container, resources: row.resources, events: row.events })) }, null, 2));
process.exitCode = stop ? 1 : 0;
