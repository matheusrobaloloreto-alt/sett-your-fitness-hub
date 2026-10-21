import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const base = dirname(fileURLToPath(import.meta.url));
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'sett-compose-test-'));
  try {
    for (const file of ['compose.json', 'preflight.mjs', 'evolution.env.example', 'postgres.env.example']) {
      cpSync(join(base, file), join(dir, file));
    }
    mkdirSync(join(dir, 'private'), { mode: 0o700 });
    for (const name of ['postgres', 'evolution']) {
      cpSync(join(dir, `${name}.env.example`), join(dir, 'private', `${name}.env`));
      chmodSync(join(dir, 'private', `${name}.env`), 0o600);
    }
    run(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const preflight = (dir, mode = 'static') => spawnSync(process.execPath, [join(dir, 'preflight.mjs'), mode], { encoding: 'utf8' });
const change = (dir, edit) => {
  const file = join(dir, 'compose.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  edit(config);
  writeFileSync(file, JSON.stringify(config));
};

test('static preflight uses only tracked configuration, no Docker or private files', () => {
  const result = preflight(base);
  assert.equal(result.status, 0, result.stderr);
});

test('Evolution healthcheck sends the fixed server Origin and API key without widening CORS', async () => {
  const { evolution } = JSON.parse(readFileSync(join(base, 'compose.json'), 'utf8')).services;
  assert.equal(evolution.environment.CORS_ORIGIN, 'https://invalid.invalid');
  assert.equal(evolution.environment.CORS_CREDENTIALS, 'false');
  assert.deepEqual(evolution.ports, ['127.0.0.1:8080:8080']);
  assert.deepEqual(evolution.healthcheck.test.slice(0, 3), ['CMD', 'node', '-e']);
  const calls = [];
  await runInNewContext(evolution.healthcheck.test[3], {
    process: {
      env: { AUTHENTICATION_API_KEY: 'synthetic-healthcheck-fixture' },
      exit: code => { throw new Error(`healthcheck exited: ${code}`); },
    },
    AbortSignal,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => [] };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8080/instance/fetchInstances');
  assert.equal(calls[0].options.headers.Origin, 'https://invalid.invalid');
  assert.equal(calls[0].options.headers.apikey, 'synthetic-healthcheck-fixture');
  assert.deepEqual(Object.keys(calls[0].options.headers).sort(), ['Origin', 'apikey']);
});

test('Caddy sets only the fixed upstream Origin and preserves API authentication', () => {
  const caddy = readFileSync(join(base, 'Caddyfile.example'), 'utf8');
  const directives = caddy.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  assert.match(directives, /reverse_proxy 127\.0\.0\.1:8080\s*\{\s*header_up Origin https:\/\/invalid\.invalid\s*\}/);
  assert.equal((directives.match(/header_up\b/g) ?? []).length, 1);
  assert.doesNotMatch(directives, /Access-Control-Allow-Origin|apikey/i);
  assert.match(directives, /respond @management 404/);
});
for (const [label, edit] of [
  ['public Evolution port', c => { c.services.evolution.ports = ['8080:8080']; }],
  ['published database', c => { c.services.postgres.ports = ['5432:5432']; }],
  ['published Redis', c => { c.services.redis.ports = ['6379:6379']; }],
  ['backend egress', c => { c.networks.backend.internal = false; }],
  ['automatic migrations', c => { delete c.services.evolution.entrypoint; }],
  ['floating Evolution image', c => { c.services.evolution.image = 'evoapicloud/evolution-api:latest'; }],
  ['Postgres 17 data layout', c => { c.services.postgres.volumes = ['postgres_data:/var/lib/postgresql/data']; }],
  ['dependency race', c => { c.services.evolution.depends_on.redis.condition = 'service_started'; }],
  ['exposed instance keys', c => { c.services.evolution.environment.AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES = 'true'; }],
]) {
  test(`rejects ${label}`, () => fixture(dir => {
    change(dir, edit);
    assert.equal(preflight(dir).status, 1);
  }));
}
test('real-host preflight rejects placeholders without printing their values', () => fixture(dir => {
  const result = preflight(dir, 'host');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /placeholder/);
  assert.doesNotMatch(result.stderr + result.stdout, /REPLACE_WITH_/);
}));
test('real-host preflight rejects readable private files before consuming values', () => fixture(dir => {
  chmodSync(join(dir, 'private/postgres.env'), 0o644);
  const result = preflight(dir, 'host');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /mode 600/);
}));
function candidateEnv(dir, apiKey, password) {
  // Synthetic unit-test inputs only; never usable deployment credentials.
  const file = join(dir, 'private/evolution.env');
  let env = readFileSync(file, 'utf8')
    .replace('REPLACE_WITH_APPROVED_EVOLUTION_HOST', 'test.example.org')
    .replace('REPLACE_WITH_EXISTING_EVOLUTION_API_KEY', apiKey)
    .replace('REPLACE_WITH_URL_ENCODED_POSTGRES_PASSWORD', encodeURIComponent(password))
    .replace('REPLACE_WITH_VERIFIED_CLIENT_NAME', 'test-client')
    .replace('REPLACE_WITH_VERIFIED_CACHE_PREFIX', 'test-cache');
  writeFileSync(file, env);
  writeFileSync(join(dir, 'private/postgres.env'), `POSTGRES_USER=evolution\nPOSTGRES_DB=evolution\nPOSTGRES_PASSWORD=${password}\n`);
}
test('real-host preflight rejects short keys and never logs them', () => fixture(dir => {
  candidateEnv(dir, 'short-test-value', 'unit-fixture-only-postgres-value');
  const result = preflight(dir, 'host');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /credential length/);
  assert.doesNotMatch(result.stdout + result.stderr, /short-test-value|unit-fixture-only-postgres-value/);
}));
test('real-host preflight rejects long but trivial credentials', () => fixture(dir => {
  candidateEnv(dir, 'x'.repeat(40), 'unit-fixture-only-postgres-value');
  const result = preflight(dir, 'host');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /weak\/example credentials/);
}));
test('real-host preflight rejects mismatched DB password', () => fixture(dir => {
  candidateEnv(dir, 'unit-fixture-only-evolution-value-long', 'unit-fixture-only-postgres-value');
  const file = join(dir, 'private/postgres.env');
  writeFileSync(file, readFileSync(file, 'utf8').replace('unit-fixture-only-postgres-value', 'different-fixture-only-db-value'));
  const result = preflight(dir, 'host');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /credentials\/target mismatch/);
}));
test('optional actual Compose config with placeholders (never up or pull)', t => {
  const version = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8', timeout: 10000 });
  if (version.error || version.status !== 0) {
    t.skip('Docker Compose plugin unavailable; parser/static tests only');
    return;
  }
  fixture(dir => {
    const result = spawnSync('docker', ['compose', '-f', join(dir, 'compose.json'), 'config', '--quiet'], {
      cwd: dir, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 0, 'Compose config failed (output suppressed)');
  });
});
