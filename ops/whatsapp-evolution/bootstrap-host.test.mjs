import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('./bootstrap-host.sh', import.meta.url), 'utf8');
const check = source.match(/^check_ufw_rules\(\) \{\n[\s\S]*?^\}/m)?.[0];
assert.ok(check, 'actual bootstrap UFW checker must be present');
const header = "Added user rules (see 'ufw status' for running firewall):\n";

function fixture(output, { claimed = false, ufwStatus = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sett-ufw-test-'));
  try {
    // Execute only the extracted checker, never bootstrap or a real UFW binary.
    return spawnSync('bash', ['-c', `
set -euo pipefail
fail() { printf '%s\n' "$*" >&2; exit 1; }
ufw() {
  [[ "$*" == 'show added' ]] || exit 99
  printf '%s' "$UFW_FIXTURE"
  return "$UFW_STATUS"
}
operator_ipv4=198.51.100.10
state_dir=$FIXTURE_STATE
${check}
check_ufw_rules
`], {
      encoding: 'utf8', timeout: 5000,
      env: {
        ...process.env, UFW_FIXTURE: output, UFW_STATUS: String(ufwStatus),
        FIXTURE_STATE: claimed ? dir : join(dir, 'unclaimed'),
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('fresh-host UFW accepts the exact (None) marker', () => {
  const result = fixture(`${header}(None)\n`);
  assert.equal(result.status, 0, result.stderr);
});

for (const output of [
  `${header}ufw allow 22/tcp\n`,
  `${header}(None)\nufw allow 22/tcp\n`,
  `${header}(None) extra\n`,
  `${header} (None)\n`,
]) {
  test(`UFW rejects unsafe or nonliteral fixture: ${JSON.stringify(output)}`, () => {
    const result = fixture(output, { claimed: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unrecognized UFW rule/);
  });
}

test('UFW still accepts the scoped rules on a claimed host', () => {
  const result = fixture(`${header}ufw allow from 198.51.100.10 to any port 22 proto tcp\nufw allow 80/tcp\nufw allow 443/tcp\n`, { claimed: true });
  assert.equal(result.status, 0, result.stderr);
});

test('UFW read failure does not become an empty-rule success', () => {
  const result = fixture('(None)\n', { ufwStatus: 1 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot read UFW rules/);
});
