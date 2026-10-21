import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const base = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mode = args[0] ?? 'static';
const fail = (message) => { console.error(`FAIL: ${message}`); process.exit(1); };
if (!['static', 'host', 'status'].includes(mode) || args.length > 1) {
  fail('usage: node preflight.mjs [static|host|status]');
}
const compose = JSON.parse(readFileSync(resolve(base, 'compose.json'), 'utf8'));
const { postgres, redis, evolution } = compose.services;
const requireCheck = (ok, message) => { if (!ok) fail(message); };
requireCheck(Object.keys(compose.services).length === 3, 'unexpected service');
requireCheck(postgres.image === 'postgres:18' && redis.image === 'redis:8.2.1' &&
  evolution.image === 'evoapicloud/evolution-api:v2.3.7', 'image/version drift');
requireCheck(JSON.stringify(evolution.ports) === '["127.0.0.1:8080:8080"]', 'unsafe API binding');
requireCheck(!postgres.ports && !redis.ports, 'database/cache port publication');
requireCheck(compose.networks.backend.internal &&
  JSON.stringify(postgres.networks) === '["backend"]' &&
  JSON.stringify(redis.networks) === '["backend"]', 'backend network exposure');
requireCheck(JSON.stringify(evolution.entrypoint) === '["node","dist/main.js"]', 'automatic migration entrypoint');
for (const name of ['postgres', 'redis']) {
  requireCheck(evolution.depends_on[name].condition === 'service_healthy', 'dependency readiness');
}
for (const service of Object.values(compose.services)) {
  requireCheck(service.healthcheck && service.volumes.length && service.mem_limit &&
    service.logging.options['max-size'], 'missing health/persistence/resource bounds');
  requireCheck(!service.privileged && !service.network_mode && !service.build, 'unexpected privilege or build');
}
requireCheck(postgres.volumes.includes('postgres_data:/var/lib/postgresql'), 'Postgres 18 volume path');
requireCheck(evolution.environment.AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES === 'false' &&
  evolution.environment.WEBHOOK_GLOBAL_ENABLED === 'false' &&
  evolution.environment.DEL_INSTANCE === 'false', 'unsafe session/auth setting');
console.log('PASS: static topology, versions, persistence and migration guard');
if (mode === 'static') process.exit(0);

// Never source env files, interpolate a shell command or print values/errors from Docker.
function privateFile(name) {
  const path = resolve(base, 'private', name);
  let stat;
  try { stat = lstatSync(path); } catch { fail(`missing private/${name}`); }
  requireCheck(stat.isFile() && !stat.isSymbolicLink() &&
    (stat.mode & 0o777) === 0o600 && stat.uid === process.getuid(), `private/${name}: require owner/current user and mode 600`);
  const result = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    requireCheck(match && !Object.hasOwn(result, match[1]), `private/${name}: invalid/duplicate assignment`);
    requireCheck(match[2] && !/REPLACE_|[\x00-\x1f]/.test(match[2]), `private/${name}: empty/placeholder value`);
    result[match[1]] = match[2];
  }
  return result;
}
let directory;
try { directory = lstatSync(resolve(base, 'private')); } catch { fail('missing private directory'); }
requireCheck(directory.isDirectory() && !directory.isSymbolicLink() &&
  (directory.mode & 0o777) === 0o700 && directory.uid === process.getuid(), 'private directory: require owner/current user and mode 700');
const pg = privateFile('postgres.env');
const env = privateFile('evolution.env');
for (const key of ['POSTGRES_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD']) requireCheck(pg[key], `missing ${key}`);
for (const key of Object.keys(pg)) requireCheck(['POSTGRES_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD'].includes(key), 'unexpected Postgres variable');
const allowed = readFileSync(resolve(base, 'evolution.env.example'), 'utf8')
  .split('\n').filter(line => /^[A-Z]/.test(line)).map(line => line.split('=')[0]);
for (const key of allowed) requireCheck(env[key], `missing ${key}`);
for (const key of Object.keys(env)) requireCheck(allowed.includes(key), 'unexpected Evolution variable');
let db, server, dbUser, dbPassword, dbName;
try {
  db = new URL(env.DATABASE_CONNECTION_URI);
  server = new URL(env.SERVER_URL);
  dbUser = decodeURIComponent(db.username);
  dbPassword = decodeURIComponent(db.password);
  dbName = decodeURIComponent(db.pathname.slice(1));
} catch { fail('invalid connection URL'); }
requireCheck(db.protocol === 'postgresql:' && db.hostname === 'postgres' && db.port === '5432' &&
  dbUser === pg.POSTGRES_USER && dbPassword === pg.POSTGRES_PASSWORD && dbName === pg.POSTGRES_DB &&
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(db.searchParams.get('schema') ?? ''), 'database credentials/target mismatch');
requireCheck(server.protocol === 'https:' && !server.username && !server.password && !server.search &&
  !server.hash && server.pathname === '/' && server.hostname.includes('.') &&
  !/invalid|localhost|replace_/i.test(server.hostname), 'SERVER_URL must be approved HTTPS origin');
requireCheck(env.AUTHENTICATION_API_KEY.length >= 32 && pg.POSTGRES_PASSWORD.length >= 24, 'credential length below local policy; root must resolve without silent rotation');
requireCheck(!/^(.)\1+$/.test(env.AUTHENTICATION_API_KEY) && !/^(.)\1+$/.test(pg.POSTGRES_PASSWORD) &&
  !/password|changeme|example|secret|replace/i.test(env.AUTHENTICATION_API_KEY) &&
  !/password|changeme|example|secret|replace/i.test(pg.POSTGRES_PASSWORD), 'weak/example credentials; root must resolve without silent rotation');
requireCheck(allowed.filter(key => key.startsWith('DATABASE_SAVE_')).every(key =>
  env[key] === (key.endsWith('_DAYS') ? '7' : 'true')) && env.DATABASE_DELETE_MESSAGE === 'false', 'persistence policy drift');
console.log('PASS: private file permissions, placeholders and local credential consistency');
function docker(extra) {
  return spawnSync('docker', ['compose', '-f', resolve(base, 'compose.json'), ...extra], {
    cwd: base, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
  });
}
const version = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8', timeout: 10000 });
const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.stdout?.trim() ?? '');
requireCheck(!version.error && version.status === 0 && match &&
  (+match[1] > 2 || (+match[1] === 2 && +match[2] >= 30)), 'Compose >=2.30.0 required; installation belongs to root');
requireCheck(docker(['config', '--quiet']).status === 0, 'Compose validation failed; raw output suppressed');
console.log('PASS: Compose config (quiet, no daemon/start/pull)');
if (mode === 'host') process.exit(0);
const status = docker(['ps', '--all', '--format', 'json']);
requireCheck(status.status === 0, 'Docker status unavailable');
let rows;
try {
  const output = status.stdout.trim();
  rows = output.startsWith('[') ? JSON.parse(output) : output.split('\n').filter(Boolean).map(line => JSON.parse(line));
} catch { fail('invalid Docker status response'); }
for (const name of ['postgres', 'redis', 'evolution']) {
  const matches = rows.filter(row => row.Service === name);
  requireCheck(matches.length === 1, `${name}: missing or duplicated service`);
  const row = matches[0];
  const running = row.State === 'running' && row.Health === 'healthy';
  console.log(`${name}: ${running ? 'running/healthy' : 'NOT READY'}`);
  if (!running) process.exitCode = 1;
}
console.log('Container health does not prove WhatsApp pairing, webhook delivery or remote authentication.');
