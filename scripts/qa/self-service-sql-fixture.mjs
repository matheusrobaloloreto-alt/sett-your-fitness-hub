import path from 'node:path';
import { sql, repo, privateFile } from './self-service-local.mjs';
const fixtures = {
  foundation: 'supabase/tests/company_product_settings_fixture.sql',
  experience: 'supabase/tests/company_experience_fixture.sql',
};
const name = process.argv[2];
if (!fixtures[name]) throw new Error('Choose foundation|experience (simulated Auth SQL fixtures, separate databases)');
if (name === 'experience') throw new Error('XP requires a separate POSTMASTER: use self-service-xp-server.mjs and self-service-xp-probe.mjs, never the shared QA database server');
const database = `self_service_${name}_${Date.now()}`;
sql(`create database ${database};`);
const report = { database, fixture: fixtures[name], auth: 'SQL fixture simulation, NOT real GoTrue', passed: false };
try {
  const result = sql(`\\ir '${path.join(repo, fixtures[name])}'\n`, database);
  report.passed = true;
  privateFile(`${name}-sql-fixture.private.log`, result);
} catch (error) {
  report.error = error.message;
  privateFile(`${name}-sql-fixture.json`, JSON.stringify(report, null, 2));
  console.error(`${name} SQL fixture failed; inspect its private report. Disposable database retained.`);
  process.exitCode = 1;
}
privateFile(`${name}-sql-fixture.json`, JSON.stringify(report, null, 2));
if (report.passed) console.log(`${name} SQL fixture passed in ${database}. Auth is simulated in this fixture; actual RPC bodies execute on Postgres.`);
