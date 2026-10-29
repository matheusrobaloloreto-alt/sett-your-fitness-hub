import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { run, output, privateFile, repo, localEnv } from './self-service-local.mjs';

const mode = process.argv[2] ?? 'on';
if (!['on', 'off'].includes(mode)) throw new Error('Choose JIT on|off');
const variant = process.argv[3] ?? 'vanilla';
if (!['vanilla', 'supabase'].includes(variant)) throw new Error('Choose vanilla|supabase');
const suffix = variant === 'vanilla' ? '' : '-supabase';
const server = JSON.parse(readFileSync(path.join(output, `xp-server${suffix}.private.json`), 'utf8'));
if (server.container !== `sett-self-service-xp-isolated-20261026${suffix}` || server.port !== (variant === 'vanilla' ? 57452 : 57453) || !server.separatePostmaster) throw new Error('Separate XP postmaster identity required');
const label = run('docker', ['inspect', server.container, '--format', '{{index .Config.Labels "sett.qa.scope"}}']);
if (label.status !== 0 || label.stdout.trim() !== 'self-service-xp-isolated') throw new Error('Wrong XP container owner');
function expand(filename) {
  const absolute = path.resolve(filename);
  if (!absolute.startsWith(path.join(repo, 'supabase/'))) throw new Error('Fixture include outside canonical SQL tree');
  return readFileSync(absolute, 'utf8').replace(/^\\ir\s+([^\r\n]+)$/gm, (_, file) => expand(path.resolve(path.dirname(absolute), file.trim())));
}
const stamp = Date.now();
const env = { ...localEnv, PGPASSWORD: server.password, PGCONNECT_TIMEOUT: '5',
  PGOPTIONS: `-c statement_timeout=20000 -c lock_timeout=3000 -c jit=${mode}` };
const args = ['-X', '-w', '-h', '127.0.0.1', '-p', String(server.port), '-U', 'postgres',
  '-d', server.database, '-v', 'ON_ERROR_STOP=1'];
const info = run('/usr/local/opt/libpq/bin/psql', [...args, '-At', '-c', "select version(),current_setting('jit'),current_setting('shared_preload_libraries'),current_setting('jit_above_cost');"], { env });
if (info.status !== 0) {
  privateFile(`xp-connection${suffix}.private.log`, info.stderr);
  throw new Error('Separate XP postmaster is not reachable; inspect xp-connection.private.log');
}
const source = expand(path.join(repo, 'supabase/tests/company_experience_fixture.sql'));
const result = run('/usr/local/opt/libpq/bin/psql', args, { env,
  input: `\\set VERBOSITY verbose\n${source}`, timeout: 90000 });
privateFile(`xp-probe-${stamp}-jit-${mode}.private.log`, result.stdout + result.stderr);
const logs = run('docker', ['logs', '--tail', '100', server.container], { timeout: 30000 });
privateFile(`xp-server-${stamp}.private.log`, logs.stdout + logs.stderr);
const report = { time: new Date().toISOString(), mode, variant, passed: result.status === 0,
  expandedSqlSha256: createHash('sha256').update(source).digest('hex'),
  exitCode: result.status, server: info.stdout.trim(), fixture: 'supabase/tests/company_experience_fixture.sql',
  error: result.stderr.split('\n').filter(line => /ERROR:|DETAIL:|CONTEXT:|server closed|connection to server/.test(line)),
  crashes: (logs.stdout + logs.stderr).split('\n').filter(line => /signal 11|Segmentation|signal 9|out of memory|reinitializing/.test(line)),
  auth: 'SQL simulated; actual canonical RPC bodies on separate PostgreSQL postmaster' };
privateFile(`xp-probe-${stamp}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
