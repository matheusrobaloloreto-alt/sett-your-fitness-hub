// Independent SQL-only regression. PGlite is memory-only; no Storage service certification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { PGlite } = await import('/tmp/sett-a25-independent-review/node_modules/@electric-sql/pglite/dist/index.js');
const A = '00000000-0000-0000-0000-000000000010';
const B = '00000000-0000-0000-0000-000000000020';
const admin = '00000000-0000-0000-0000-000000000001';
const trainer = '00000000-0000-0000-0000-000000000002';
const master = '00000000-0000-0000-0000-000000000003';
const otherAdmin = '00000000-0000-0000-0000-000000000004';
const bucket = 'company-content-images';
const image = { path: `${A}/slides/10000000-0000-4000-8000-000000000001.png`, mime: 'image/png', bytes: 128, width: 64, height: 64 };
const logo = { ...image, path: image.path.replace('/slides/', '/logos/') };

test('Studio migration: parse rollback, OID/wrapper, restrictive RLS and reference validation in PGlite memory only', { timeout: 60000 }, async t => {
  const db = new PGlite();
  try {
    const fixtureUrl = new URL('../supabase/tests/platform_company_content_fixture.sql', import.meta.url);
    const fixture = await readFile(fixtureUrl, 'utf8');
    const split = fixture.indexOf('\nbegin;\ncreate function pg_temp.expect_error');
    assert.ok(split > 0, 'Known fixture setup/test boundary required');
    const setup = fixture.slice(0, split);
    const included = [...setup.matchAll(/^\\ir (.+)$/gm)];
    const expected = ['20261026092601_company_product_settings.sql', '20261026093918_company_experience_gamification.sql', '20261028123147_governed_platform_company_content.sql'];
    assert.deepEqual(included.map(match => match[1].split('/').at(-1)), expected);
    const dependencies = new Map(await Promise.all(included.map(async match => [match[1], await readFile(new URL(match[1], fixtureUrl), 'utf8')])));
    await db.exec("set statement_timeout='10s'; set lock_timeout='2s';");
    await db.exec(setup.replace(/^\\ir (.+)$/gm, (_, path) => dependencies.get(path)));
    // Synthetic Storage catalog only. Broad legacy policies deliberately stress restrictive fences.
    await db.exec(`
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy synthetic_legacy_broad on storage.objects for all to public using(true) with check(true);
      insert into auth.users values('${admin}'),('${trainer}'),('${master}'),('${otherAdmin}');
      insert into public.companies(id) values('${A}'),('${B}');
      insert into public.company_members values('${A}','${admin}'),('${A}','${trainer}'),('${B}','${otherAdmin}');
      insert into public.user_roles values('${admin}','admin'),('${trainer}','trainer'),('${master}','master'),('${otherAdmin}','admin');
      insert into public.content_test_features values('${A}',true),('${B}',true);
    `);
    const identity = async (uid = admin, role = 'authenticated') => {
      assert.ok(['authenticated', 'anon'].includes(role));
      await db.exec('reset role');
      await db.query("select set_config('test.uid',$1,false)", [uid]);
      await db.exec(`set role ${role}`);
    };
    const owner = () => db.exec('reset role');
    const read = async () => (await db.query('select public.get_company_content($1) as value', [A])).rows[0].value;
    const save = async (document, version) => (await db.query('select public.save_company_content($1,$2::jsonb,$3::integer) as value', [A, JSON.stringify(document), version])).rows[0].value;
    const insert = (asset, uid = admin) => db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb) returning name',
      [bucket, asset.path, uid, JSON.stringify({ mimetype: asset.mime, size: asset.bytes })]);
    await identity();
    const old = (await read()).document;
    old.brand.name = 'Original preserved';
    old.posts = [{ id: '20000000-0000-4000-8000-000000000001', title: 'Original title', scheduled_for: '', status: 'draft', format: 'carrossel', aesthetic: 'l1_educativo',
      slides: [{ role: 'capa', title: 'Original copy', subtitle: '', body: 'Original body' }], caption: 'Original caption', hashtags: ['#original'] }];
    await save(old, 0); // Warm the actual save RPC before the validator rename.
    await owner();
    const oldOid = (await db.query("select 'content_private.validate_studio(jsonb)'::regprocedure::oid::text as oid")).rows[0].oid;
    const migration = await readFile(new URL('../supabase/migrations/20261028143002_company_content_images.sql', import.meta.url), 'utf8');
    t.diagnostic(`reviewed migration sha256=${createHash('sha256').update(migration).digest('hex')}`);

    await t.test('original CASE failure is 42601 and rolls back bucket/rename together', async () => {
      const corrected = "is distinct from (case when a->>'mime'='image/png' then '.png' else '.jpg' end) or";
      assert.ok(migration.includes(corrected));
      const original = migration.replace(corrected, "is distinct from case when a->>'mime'='image/png' then '.png' else '.jpg' end or");
      await assert.rejects(db.exec(original), { code: '42601' });
      await db.exec('rollback');
      assert.equal((await db.query('select count(*)::int as n from storage.buckets')).rows[0].n, 0);
      assert.equal((await db.query("select 'content_private.validate_studio(jsonb)'::regprocedure::oid::text as oid")).rows[0].oid, oldOid);
      assert.equal((await db.query("select to_regprocedure('content_private.validate_studio_text_v1(jsonb)') as value")).rows[0].value, null);
    });

    await t.test('corrected migration applies; distinct wrapper preserves old validator OID and private ACLs', async () => {
      await db.exec(migration);
      const oids = (await db.query("select 'content_private.validate_studio_text_v1(jsonb)'::regprocedure::oid::text as old, 'content_private.validate_studio(jsonb)'::regprocedure::oid::text as wrapper")).rows[0];
      assert.equal(oids.old, oldOid); assert.notEqual(oids.wrapper, oldOid);
      const acl = (await db.query("select has_function_privilege('authenticated','public.company_content_image_access(text)','execute') as member, has_function_privilege('anon','public.company_content_image_access(text)','execute') as anon, has_function_privilege('authenticated','content_private.validate_studio(jsonb)','execute') as private")).rows[0];
      assert.deepEqual(acl, { member: true, anon: false, private: false });
      await identity(); assert.deepEqual((await read()).document, old);
      assert.deepEqual((await save(old, 1)).document, old);
    });

    await t.test('direct SQL RLS allows own admin inserts and denies malformed paths, other tenant and forged owner', async () => {
      await identity();
      await insert(image); await insert(logo);
      for (const path of [image.path.replace(A, B), `${A}/slides/../bad.png`, 'https://invalid.test/a.png', `${A}/unknown/10000000-0000-4000-8000-000000000001.png`]) {
        await assert.rejects(insert({ ...image, path }), { code: '42501' });
      }
      await assert.rejects(insert({ ...image, path: image.path.replace('000001.png', '000002.png') }, otherAdmin), { code: '42501' });
      assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 2);
      assert.equal((await db.query("update storage.objects set metadata='{}'::jsonb returning name")).rows.length, 0);
      assert.equal((await db.query('delete from storage.objects returning name')).rows.length, 0);
      await assert.rejects(db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb) on conflict(bucket_id,name) do update set metadata=excluded.metadata',
        [bucket, image.path, admin, JSON.stringify({ size: 1 })]), { code: '42501' });
    });

    await t.test('restrictive fences defeat broad legacy grants for roles, membership, inactive and feature-disabled companies', async () => {
      for (const [uid, role] of [[otherAdmin, 'authenticated'], [trainer, 'authenticated'], [master, 'authenticated'], ['', 'anon']]) {
        await identity(uid, role);
        assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 0);
        await assert.rejects(insert({ ...image, path: image.path.replace('000001.png', '000003.png') }, uid), { code: '42501' });
      }
      await owner(); await db.exec(`insert into company_members values('${A}','${master}')`);
      await identity(master); assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 2);
      await owner(); await db.exec(`update companies set is_active=false where id='${A}'`);
      await identity(); assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 0);
      await assert.rejects(insert({ ...image, path: image.path.replace('000001.png', '000004.png') }), { code: '42501' });
      await owner(); await db.exec(`update companies set is_active=true where id='${A}'; update content_test_features set enabled=false where company_id='${A}'`);
      await identity(); assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 0);
      await assert.rejects(insert({ ...image, path: image.path.replace('000001.png', '000004.png') }), { code: '42501' });
      await owner(); await db.exec(`update content_test_features set enabled=true where company_id='${A}'`); await identity();
    });

    const withImages = structuredClone(old); withImages.brand.logo = logo; withImages.posts[0].slides[0].image = image;
    await t.test('warmed RPC resolves the new wrapper, saves actual object refs and preserves original text/history', async () => {
      const saved = await save(withImages, 2);
      assert.equal(saved.version, 3); assert.deepEqual(saved.document, withImages);
      assert.deepEqual(await read(), saved);
      await owner();
      const history = (await db.query('select version,document from company_content_history where company_id=$1 order by version', [A])).rows;
      assert.deepEqual(history, [{ version: 1, document: old }, { version: 2, document: old }, { version: 3, document: withImages }]);
      await identity();
    });

    await t.test('strict wrapper and actual-object checks reject poisoned refs without state/history mutation', async () => {
      const invalid = [];
      const mutateImage = patch => { const doc = structuredClone(withImages); Object.assign(doc.posts[0].slides[0].image, patch); return doc; };
      for (const patch of [{ path: image.path.replace(A, B) }, { path: image.path.replace('/slides/', '/logos/') },
        { path: image.path.replace('000001.png', '000099.png') }, { path: 'data:image/png;base64,AA' }, { mime: 'image/jpeg' },
        { bytes: 129 }, { width: 4096, height: 4096 }, { width: 31 }, { bytes: 1.5 }, { unexpected: true }]) invalid.push(mutateImage(patch));
      const badLogo = structuredClone(withImages); badLogo.brand.logo = image; invalid.push(badLogo);
      const badCopy = structuredClone(withImages); badCopy.posts[0].slides[0].title = ''; invalid.push(badCopy);
      const badKeys = structuredClone(withImages); badKeys.brand.unknown = true; invalid.push(badKeys);
      const nullRef = structuredClone(withImages); nullRef.brand.logo = null; invalid.push(nullRef);
      const before = await read();
      for (const doc of invalid) {
        await assert.rejects(save(doc, 3), error => ['22023', '42501'].includes(error.code));
        assert.deepEqual(await read(), before);
      }
      await owner(); await db.exec(`update storage.buckets set public=true where id='${bucket}'`); await identity();
      await assert.rejects(save(withImages, 3), { code: '22023' });
      await owner(); await db.exec(`update storage.buckets set public=false where id='${bucket}'`);
      await db.query("update storage.objects set metadata=jsonb_set(metadata,'{mimetype}','\"image/jpeg\"') where name=$1", [image.path]); await identity();
      await assert.rejects(save(withImages, 3), { code: '22023' });
      await owner(); await db.query("update storage.objects set metadata=jsonb_set(metadata,'{mimetype}','\"image/png\"') where name=$1", [image.path]); await identity();
      assert.deepEqual(await read(), before);
      await owner(); assert.equal((await db.query('select count(*)::int as n from company_content_history where company_id=$1', [A])).rows[0].n, 3); await identity();
      t.diagnostic(`${invalid.length} poisoned documents rejected plus public-bucket and metadata-MIME mismatches`);
    });

    await t.test('sequential stale-version conflict is PT409 and leaves document/history intact (not concurrency certification)', async () => {
      const before = await read(); await assert.rejects(save(withImages, 2), { code: 'PT409' });
      assert.deepEqual(await read(), before); await owner();
      assert.equal((await db.query('select count(*)::int as n from company_content_history where company_id=$1', [A])).rows[0].n, 3);
    });
  } finally { await db.close(); }
});
