// Local semantic tests using native-captured metadata and exact native Storage bodies.
// No hosted writes, auth spoofing, service_role creation, disabled guards or fake Vault.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const { PGlite } = await import(process.env.SETT_TEST_PGLITE_MODULE || '/tmp/sett-a25-independent-review/node_modules/@electric-sql/pglite/dist/index.js');
const base = 'output/hosted-staging-preflight-20261028/';
const manifest = JSON.parse(readFileSync(base + 'autonomy-hosted-candidate-rollback.manifest.private.json', 'utf8'));
const target = JSON.parse(readFileSync(base + 'target-triggers.private.json', 'utf8')).rows;
const storage = JSON.parse(readFileSync(base + 'storage-bucket-contract.private.json', 'utf8')).rows[0].contract;
const md5 = value => createHash('md5').update(value).digest('hex');
const spec = manifest.target_trigger_provenance;
const nativeRows = target.map(row => {
  assert.equal(md5(row.prosrc), row.body_md5);
  const extra = storage.triggers.find(item => item.tgname === row.tgname) || { tgnargs: 0, args_hex: '', tgattr: '', tgqual: null, lanname: 'plpgsql', prosecdef: row.proname !== 'update_updated_at_column' };
  return { schema_name: row.nspname, relation_name: row.relname, trigger_name: row.tgname, event_flags: row.tgtype,
    enabled: row.tgenabled, function_schema: row.function_schema, function_name: row.proname,
    body_md5: row.body_md5, definition_md5: row.definition_md5, trigger_md5: md5(row.trigger_definition),
    argument_count: extra.tgnargs, argument_hex: extra.args_hex, column_vector: extra.tgattr,
    when_absent: extra.tgqual === null, language_name: extra.lanname, security_definer: extra.prosecdef };
});
test('exact native seven-row comparator accepts known validators and rejects drift/missing/extra contracts', async () => {
  const db = new PGlite();
  try {
    const fields = Object.keys(nativeRows[0]).map(name => `${name} ${name === 'event_flags' || name === 'argument_count' ? 'integer' : name === 'when_absent' || name === 'security_definer' ? 'boolean' : 'text'}`).join(',');
    const sql = `WITH expected AS (${spec.expected_cte_sql}), live AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS n(${fields})) ${spec.comparison_sql} AS rejected`;
    const rejected = async rows => (await db.query(sql, [JSON.stringify(rows)])).rows[0].rejected;
    assert.equal(nativeRows.length, 7);
    assert.equal(await rejected(nativeRows), false);
    for (const [field, value] of [
      ['event_flags', 17], ['enabled', 'A'], ['body_md5', 'changed'], ['definition_md5', 'changed'],
      ['trigger_md5', 'changed'], ['argument_count', 2], ['argument_hex', '756e617574686f72697a656400'],
      ['column_vector', '13'], ['when_absent', false], ['security_definer', true], ['language_name', 'sql'],
      ['function_schema', 'public'], ['function_name', 'unknown_validator'],
    ]) {
      const rows = structuredClone(nativeRows); const row = rows.find(item => item.trigger_name === 'protect_bucket_control_insert');
      row[field] = value; assert.equal(await rejected(rows), true, field);
    }
    assert.equal(await rejected(nativeRows.slice(1)), true, 'missing native trigger');
    assert.equal(await rejected([...nativeRows, { ...nativeRows[0], trigger_name: 'unreviewed_trigger' }]), true, 'extra native trigger');
  } finally { await db.close(); }
});
test('unmodified native Storage validator bodies allow actual candidate bucket INSERT/public-only UPDATE with NULL lifecycle', async () => {
  const db = new PGlite();
  try {
    const controls = Object.fromEntries(storage.columns.map(column => [column.column_name, column]));
    for (const key of ['lifecycle_configuration', 'lifecycle_configuration_generation']) {
      assert.equal(controls[key].column_default, null); assert.equal(controls[key].is_nullable, 'YES');
    }
    assert.equal(controls.type.column_default, "'STANDARD'::storage.buckettype");
    // Partial local table fixture uses the captured native control types/defaults.
    // It is not a replacement/native certification of the Storage service schema.
    await db.exec(`create schema storage;create type storage.buckettype as enum('STANDARD');
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],
        type storage.buckettype not null default 'STANDARD'::storage.buckettype,
        lifecycle_configuration jsonb,lifecycle_configuration_generation uuid);`);
    const unique = new Map(target.filter(row => row.nspname === 'storage').map(row => [row.proname, row]));
    for (const row of unique.values()) {
      assert.ok(!row.prosrc.includes('$native_body$'));
      await db.exec(`create function storage.${row.proname}() returns trigger language plpgsql as $native_body$${row.prosrc}$native_body$;`);
      assert.equal((await db.query('select md5(prosrc) as body from pg_proc where oid=$1::regprocedure', [`storage.${row.proname}()`])).rows[0].body, row.body_md5);
    }
    for (const row of target.filter(item => item.nspname === 'storage')) await db.exec(row.trigger_definition + ';');
    assert.equal((await db.query("select exists(select 1 from pg_roles where rolname='service_role') present")).rows[0].present, false);
    const images = readFileSync('supabase/migrations/20261028143002_company_content_images.sql', 'utf8');
    const start = images.indexOf('insert into storage.buckets('); const insert = images.slice(start, images.indexOf(';', start) + 1);
    assert.ok(start >= 0); await db.exec(insert);
    const snapshot = async () => (await db.query("select type::text,public,lifecycle_configuration,lifecycle_configuration_generation from storage.buckets where id='company-content-images'")).rows[0];
    const before = await snapshot(); assert.deepEqual(before, { type: 'STANDARD', public: false, lifecycle_configuration: null, lifecycle_configuration_generation: null });
    const quarantine = readFileSync('supabase/migrations/20261029003627_disable_company_studio_pending_master_integration.sql', 'utf8');
    const update = quarantine.match(/^update storage\.buckets set public=false where id='company-content-images';$/m)?.[0];
    assert.ok(update); await db.exec(update); assert.deepEqual(await snapshot(), before);
    assert.equal((await db.query("select exists(select 1 from pg_roles where rolname='service_role') present")).rows[0].present, false);
    // Captured length guard remains operative, not bypassed by a blanket allowlist.
    await assert.rejects(db.query('insert into storage.buckets(id,name) values($1,$2)', ['synthetic-too-long', 'x'.repeat(101)]));
  } finally { await db.close(); }
});
