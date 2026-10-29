import { createHash } from 'node:crypto';
import { repo, output, run, privateFile, verifyProject, dbContainer, sql } from './self-service-local.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

verifyProject();
const mode = process.argv[2];
if (mode === 'baseline') {
  const prior = existsSync(path.join(output, 'baseline-replay.json'))
    ? JSON.parse(readFileSync(path.join(output, 'baseline-replay.json'), 'utf8')) : null;
  if (sql("select to_regclass('public.companies') is not null") !== 'f' && !prior) {
    throw new Error('Baseline replay requires an empty local public schema; refusing to overwrite');
  }
  const baseline = '45b6c3af4f99766c69bc9f1dbb8bd177b6ce634c';
  const listing = run('git', ['ls-tree', '-r', '--name-only', baseline, 'supabase/migrations']);
  if (listing.status !== 0) throw new Error('Cannot list local baseline');
  const files = listing.stdout.trim().split('\n').filter(f => f.endsWith('.sql')).sort();
  let input = '';
  const fingerprints = [];
  for (const [index, file] of files.entries()) {
    const source = run('git', ['show', `${baseline}:${file}`]);
    if (source.status !== 0) throw new Error(`Cannot read ${file}`);
    fingerprints.push({ file, sha256: createHash('sha256').update(source.stdout).digest('hex') });
    if (prior && index < prior.appliedCount) {
      if (JSON.stringify(fingerprints[index]) !== JSON.stringify(prior.fingerprints[index])) throw new Error('Baseline replay fingerprint changed');
      continue;
    }
    input += `\\echo QA_REPLAY_BEGIN:${file}\nbegin;\n${source.stdout}\ncommit;\n\\echo QA_REPLAY_PASS:${file}\n`;
  }
  const result = run('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-U', 'postgres',
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input });
  privateFile('baseline-replay.private.log', result.stdout + result.stderr);
  const applied = [...result.stdout.matchAll(/QA_REPLAY_PASS:(.+)/g)].map(m => m[1].trim());
  const begun = [...result.stdout.matchAll(/QA_REPLAY_BEGIN:(.+)/g)].map(m => m[1].trim());
  const report = {
    baseline, mode: 'repository-baseline-replay', fullReplay: result.status === 0,
    appliedCount: (prior?.appliedCount || 0) + applied.length, totalCount: files.length,
    failedMigration: result.status === 0 ? null : begun.at(-1),
    error: result.stderr.split('\n').filter(line => /ERROR:|DETAIL:|HINT:/.test(line)),
    fingerprints,
  };
  privateFile('baseline-replay.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, fingerprints: undefined }, null, 2));
  process.exitCode = result.status === 0 ? 0 : 1;
} else if (mode === 'fixture') {
  const report = JSON.parse(readFileSync(path.join(output, 'baseline-replay.json'), 'utf8'));
  if (report.fullReplay) throw new Error('Full replay succeeded; minimal fixture must not replace it');
  // The only reset allowed here is the disposable QA public schema; Auth stays real.
  sql('drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to postgres, service_role;');
  sql(readFileSync(path.join(repo, 'qa/self-service-base.sql'), 'utf8'));
  sql(readFileSync(path.join(repo, 'qa/self-service-form-dependencies.sql'), 'utf8'));
  sql(readFileSync(path.join(repo, 'qa/self-service-domain-dependencies.sql'), 'utf8'));
  const canonicalSources = [
    ['supabase/migrations/20260910103000_weekly_contact_consent_ledger.sql', 'process_automation_triggers'],
    ['supabase/migrations/20260612230939_progress_photos_automation_recovery.sql', 'mark_payment_recovery_abandoned'],
    ['supabase/migrations/20260614180224_weekly_consistency_leaderboard.sql', 'private_display_name', 'text', 'authenticated,service_role'],
  ];
  const dependencies = [];
  for (const [file, name, signature = '', roles = 'service_role'] of canonicalSources) {
    const source = readFileSync(path.join(repo, file), 'utf8');
    // Same narrowly bounded extraction as the repo's communication_policy_local test.
    const definition = source.match(new RegExp(`create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\n\\$\\$;`, 'i'))?.[0];
    if (!definition) throw new Error(`Canonical prerequisite not found: ${name}`);
    sql(definition + `\nrevoke all on function public.${name}(${signature}) from public,anon,authenticated; grant execute on function public.${name}(${signature}) to ${roles};`);
    dependencies.push({ file, name, sha256: createHash('sha256').update(definition).digest('hex'),
      executableCoverage: 'creation only; historical ledger/payment dependencies are not fabricated' });
  }
  privateFile('canonical-prerequisites.json', JSON.stringify(dependencies, null, 2));
  privateFile('applied-migrations.json', '[]');
  privateFile('schema-mode.json', JSON.stringify({
    mode: 'minimal-explicit-fixture', fullRepositorySchema: false,
    source: 'qa/self-service-base.sql', baselineFailure: report.failedMigration,
    auth: 'real-local-GoTrue', data: 'synthetic-only',
  }, null, 2));
  sql("notify pgrst, 'reload schema';");
  console.log('Minimal explicit fixture applied; this is NOT a complete SETT schema.');
} else {
  throw new Error('Usage: node scripts/qa/self-service-replay.mjs baseline|fixture');
}
