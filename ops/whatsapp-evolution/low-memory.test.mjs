import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const base = dirname(fileURLToPath(import.meta.url));
const original = JSON.parse(readFileSync(join(base, 'compose.json'), 'utf8'));
const override = JSON.parse(readFileSync(join(base, 'compose.low-memory.json'), 'utf8'));

// Only model the override's allowlisted fields: mappings merge, command replaces.
// https://docs.docker.com/reference/compose-file/merge/#shell-commands
function mergedConfig() {
  assert.deepEqual(Object.keys(override), ['services']);
  assert.deepEqual(Object.keys(override.services).sort(), ['evolution', 'postgres', 'redis']);
  const config = structuredClone(original);
  for (const [name, patch] of Object.entries(override.services)) {
    const keys = name === 'evolution' ? ['environment', 'mem_limit'] :
      name === 'redis' ? ['command', 'mem_limit'] : ['mem_limit'];
    assert.deepEqual(Object.keys(patch).sort(), keys);
    if (patch.environment) assert.deepEqual(Object.keys(patch.environment), ['NODE_OPTIONS']);
    Object.assign(config.services[name], patch, patch.environment ? {
      environment: { ...original.services[name].environment, ...patch.environment },
    } : {});
  }
  return config;
}

function bytes(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) {
    const count = Number(value);
    assert.ok(Number.isSafeInteger(count), 'unsafe memory byte count');
    return count;
  }
  const match = /^(\d+)([mg])$/i.exec(value);
  assert.ok(match, 'unsupported memory unit');
  return Number(match[1]) * 1024 ** (match[2].toLowerCase() === 'g' ? 3 : 2);
}

function checkBudget(config) {
  const { evolution, postgres, redis } = config.services;
  const MiB = 1024 ** 2;
  assert.equal(bytes(evolution.mem_limit), 1024 * MiB);
  assert.equal(bytes(postgres.mem_limit), 384 * MiB);
  assert.equal(bytes(redis.mem_limit), 128 * MiB);
  const total = Object.values(config.services).reduce((sum, s) => sum + bytes(s.mem_limit), 0);
  assert.ok(2048 * MiB - total >= 400 * MiB, 'insufficient OS/Caddy headroom');
  assert.equal(evolution.environment.NODE_OPTIONS, '--max-old-space-size=768');
  assert.deepEqual(redis.command, [
    'redis-server', '--appendonly', 'yes', '--appendfsync', 'everysec',
    '--maxmemory', '64mb', '--maxmemory-policy', 'noeviction',
  ]);
}

test('2 GiB merged budget leaves at least 400 MiB for OS/Caddy', () => {
  checkBudget(mergedConfig());
});

test('merged budget accepts positive decimal byte strings without changing exact limits', () => {
  const config = mergedConfig();
  const limits = { evolution: '1073741824', postgres: '402653184', redis: '134217728' };
  for (const [name, limit] of Object.entries(limits)) config.services[name].mem_limit = limit;
  checkBudget(config);
  for (const name of Object.keys(limits)) {
    const changed = structuredClone(config);
    changed.services[name].mem_limit = String(Number(limits[name]) + 1);
    assert.throws(() => checkBudget(changed), `must reject one-byte drift for ${name}`);
  }
});

test('decimal byte strings reject non-positive, non-integer or unsafe formats', () => {
  for (const value of ['0', '-1', '+1', '1.5', '1e9', '0x40000000', ' 1073741824', '1073741824 ', '1073741824junk', '9007199254740993']) {
    assert.throws(() => bytes(value), `must reject ${JSON.stringify(value)}`);
  }
});

test('override preserves topology, persistence, health and security settings', () => {
  const restored = mergedConfig();
  for (const [name, service] of Object.entries(original.services)) {
    restored.services[name].mem_limit = service.mem_limit;
  }
  restored.services.redis.command = original.services.redis.command;
  delete restored.services.evolution.environment.NODE_OPTIONS;
  assert.deepEqual(restored, original);
});

for (const [label, mutate] of [
  ['base 4 GiB limits', c => { c.services = structuredClone(original.services); }],
  ['uncapped Node heap', c => { delete c.services.evolution.environment.NODE_OPTIONS; }],
  ['appended Redis command', c => { c.services.redis.command.unshift(...original.services.redis.command); }],
  ['evicting Redis cache', c => { c.services.redis.command[c.services.redis.command.length - 1] = 'allkeys-lru'; }],
]) {
  test(`budget check rejects ${label}`, () => {
    const config = mergedConfig();
    mutate(config);
    assert.throws(() => checkBudget(config));
  });
}

test('actual Compose merge matches the static budget (no daemon, pull or private data)', t => {
  const version = spawnSync('docker', ['compose', 'version', '--short'], {
    encoding: 'utf8', timeout: 10000,
  });
  if (version.error || version.status !== 0) {
    assert.notEqual(process.env.REQUIRE_COMPOSE, '1', 'Compose required but unavailable');
    t.skip('Compose unavailable; run with REQUIRE_COMPOSE=1 on the host before starting');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'sett-low-memory-test-'));
  try {
    for (const file of ['compose.json', 'compose.low-memory.json']) cpSync(join(base, file), join(dir, file));
    mkdirSync(join(dir, 'private'), { mode: 0o700 });
    for (const name of ['postgres', 'evolution']) {
      writeFileSync(join(dir, 'private', `${name}.env`), '', { mode: 0o600 });
    }
    const result = spawnSync('docker', [
      'compose', '-f', join(dir, 'compose.json'), '-f', join(dir, 'compose.low-memory.json'),
      'config', '--format', 'json',
    ], { cwd: dir, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, 'Compose merge failed (output suppressed)');
    const actual = JSON.parse(result.stdout);
    checkBudget(actual);
    assert.deepEqual(actual.services.evolution.entrypoint, original.services.evolution.entrypoint);
    for (const [key, value] of Object.entries(original.services.evolution.environment)) {
      assert.equal(actual.services.evolution.environment[key], value);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
