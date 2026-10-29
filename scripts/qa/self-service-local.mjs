import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, existsSync, chmodSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertProject, LOCAL_PROJECT } from './self-service-safety.mjs';

export const repo = fileURLToPath(new URL('../../', import.meta.url));
export const output = path.join(repo, 'output/self-service-local-20261026');
export const dbContainer = `supabase_db_${LOCAL_PROJECT}`;
export const network = `${LOCAL_PROJECT}-internal`;
export const ingress = `${LOCAL_PROJECT}-ingress`;
export const localEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  DOCKER_HOST: 'unix:///Users/macbookpro/.colima/default/docker.sock',
  DO_NOT_TRACK: '1', SUPABASE_TELEMETRY_DISABLED: '1',
};

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repo, env: localEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

export function privateFile(name, contents) {
  mkdirSync(output, { recursive: true, mode: 0o700 });
  chmodSync(output, 0o700);
  const filename = path.join(output, name);
  writeFileSync(filename, contents, { mode: 0o600 });
  chmodSync(filename, 0o600);
  return filename;
}

export function verifyProject(requireIsolatedDb = true) {
  const config = readFileSync(path.join(output, 'supabase/config.toml'), 'utf8');
  assertProject(config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1],
    existsSync(path.join(output, 'supabase/.temp/project-ref')));
  const inspection = run('docker', ['network', 'inspect', network, '--format', '{{.Internal}}']);
  if (inspection.status !== 0 || inspection.stdout.trim() !== 'true') {
    throw new Error('QA Docker network must be internal (no external provider access)');
  }
  if (requireIsolatedDb) {
    const db = run('docker', ['inspect', dbContainer, '--format', '{{json .NetworkSettings.Networks}}']);
    const attached = Object.keys(JSON.parse(db.stdout || '{}'));
    const bridgeMode = existsSync(path.join(output, 'bridge-transport.json'));
    if (!attached.length || attached.some(name => name !== network && !(bridgeMode && name === ingress))) {
      throw new Error('QA database must use only its dedicated QA networks');
    }
  }
}

export function sql(statement, database = 'postgres') {
  if (database !== 'postgres' && !/^self_service_[a-z0-9_]+$/.test(database)) throw new Error('Only dedicated QA databases are allowed');
  verifyProject();
  if (existsSync(path.join(output, 'transport.json'))) {
    const values = JSON.parse(readFileSync(path.join(output, 'status.private.json'), 'utf8'));
    const db = new URL(values.DB_URL);
    const result = run('/usr/local/opt/libpq/bin/psql', ['-X', '-w', '-U', 'postgres',
      '-h', '127.0.0.1', '-p', '57422', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], {
      input: statement, env: { ...localEnv, PGPASSWORD: decodeURIComponent(db.password),
        PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c statement_timeout=20000 -c lock_timeout=5000' }, timeout: 30000,
    });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  }
  const result = run('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c statement_timeout=20000 -c lock_timeout=5000', dbContainer, 'psql', '-X', '-w', '-U', 'postgres',
    '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], { input: statement });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function start() {
  mkdirSync(path.join(output, 'supabase'), { recursive: true, mode: 0o700 });
  privateFile('.gitignore', '*\n');
  copyFileSync(path.join(repo, 'qa/self-service.supabase.toml'), path.join(output, 'supabase/config.toml'));
  const networks = run('docker', ['network', 'inspect', network]);
  if (networks.status !== 0) {
    const created = run('docker', ['network', 'create', '--internal', network]);
    if (created.status !== 0) throw new Error(created.stderr);
  }
  verifyProject(false);
  if (run('docker', ['network', 'inspect', ingress]).status !== 0) {
    const created = run('docker', ['network', 'create', '--opt',
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', ingress]);
    if (created.status !== 0) throw new Error(created.stderr);
  }
  const inventory = run('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}']);
  privateFile('containers-before.txt', inventory.stdout);
  const result = run('supabase', ['start', '--workdir', output, '--network-id', ingress,
    '--exclude', 'studio,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector'], { timeout: 900000 });
  if (existsSync(path.join(output, 'start.private.log'))) {
    privateFile(`start-${Date.now()}.private.log`, readFileSync(path.join(output, 'start.private.log')));
  }
  privateFile('start.private.log', result.stdout + result.stderr);
  if (result.status !== 0) {
    console.error('Local Supabase start failed; inspect output/self-service-local-20261026/start.private.log locally.');
    process.exitCode = 1;
    return;
  }
  const status = run('supabase', ['status', '--workdir', output, '-o', 'json']);
  if (status.status !== 0) throw new Error('Local status unavailable');
  const values = JSON.parse(status.stdout);
  const containers = run('docker', ['ps', '--filter', `label=com.supabase.cli.project=${LOCAL_PROJECT}`, '--format', '{{.Names}}']);
  const names = containers.stdout.trim().split('\n').filter(Boolean);
  if (!names.includes(dbContainer)) throw new Error('Expected QA database was not discovered');
  for (const name of names) {
    if (!name.endsWith(`_${LOCAL_PROJECT}`)) throw new Error('Unexpected container name');
    const connected = run('docker', ['network', 'connect', network, name]);
    if (connected.status !== 0 && !connected.stderr.includes('already exists')) throw new Error(connected.stderr);
  }
  for (const name of names) {
    if (name === `supabase_kong_${LOCAL_PROJECT}`) continue;
    const disconnected = run('docker', ['network', 'disconnect', ingress, name]);
    if (disconnected.status !== 0) throw new Error(disconnected.stderr);
  }
  verifyProject();
  privateFile('status.private.json', JSON.stringify(values, null, 2));
  const env = [
    `SUPABASE_URL=http://127.0.0.1:57421`,
    `SUPABASE_ANON_KEY=${values.ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${values.SERVICE_ROLE_KEY}`,
    `VITE_SUPABASE_URL=http://127.0.0.1:57421`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${values.ANON_KEY}`,
    `VITE_SUPABASE_PROJECT_ID=${LOCAL_PROJECT}`,
  ].join('\n') + '\n';
  privateFile('qa.env.local', env);
  console.log('Isolated Supabase ready: http://127.0.0.1:57421; private env: output/self-service-local-20261026/qa.env.local');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'start') throw new Error('Usage: node scripts/qa/self-service-local.mjs start');
  start();
}
