// SQL/RLS regression in memory only; does not certify native Supabase Storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import('/tmp/sett-a25-independent-review/node_modules/@electric-sql/pglite/dist/index.js');
const A = '00000000-0000-0000-0000-000000000010';
const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
const bucket = 'company-content-images';
const path = `${A}/slides/10000000-0000-4000-8000-000000000001.png`;
const read = name => readFile(new URL(name, import.meta.url), 'utf8');

test('quarantine company Studio RPC and storage; preserve saved state, adoption and canonical master BN', { timeout: 60000 }, async t => {
 const db = new PGlite();
 try {
  const fixture = await read('../supabase/tests/platform_company_content_fixture.sql');
  let setup = fixture.slice(0, fixture.indexOf('\nbegin;\ncreate function pg_temp.expect_error'));
  for (const match of [...setup.matchAll(/^\\ir (.+)$/gm)]) { const sql = await read(`../supabase/tests/${match[1]}`); setup = setup.replace(match[0], () => sql); }
  await db.exec(setup);
  await db.exec(`create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));
   alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated;
   grant select,insert,update,delete on storage.objects to anon,authenticated;
   create policy synthetic_broad on storage.objects for all to public using(true) with check(true);
   insert into auth.users values ${ids.map(id => `('${id}')`).join(',')};
   insert into companies(id) values('${A}');
   insert into company_members values ${ids.map(id => `('${A}','${id}')`).join(',')};
   insert into user_roles values('${ids[0]}','admin'),('${ids[1]}','trainer'),('${ids[2]}','master');
   insert into content_test_features values('${A}',true);`);
  await db.exec(await read('../supabase/migrations/20261028143002_company_content_images.sql'));
  await db.exec(await read('../supabase/migrations/20261012074421_bn_content_studio_cloud.sql'));
  const identity = async (uid, role = 'authenticated') => {
   await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)", [uid]); await db.exec(`set role ${role}`);
  };
  // Warm real RPCs and seed genuine saved document/history before quarantine.
  await identity(ids[0]);
  const document = (await db.query('select get_company_content($1) as v',[A])).rows[0].v.document;
  await db.query('select save_company_content($1,$2::jsonb,0)',[A,JSON.stringify(document)]);
  await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',[bucket,path,ids[0],JSON.stringify({ mimetype:'image/png',size:128 })]);
  await db.exec('reset role');
  const before = (await db.query('select * from company_content_studios')).rows;
  const history = (await db.query('select * from company_content_history')).rows;
  const spec = { format:'carrossel',aesthetic:'l1_educativo',topic:'BN preserved',audience:'misto',slides:[{role:'capa',title:'BN original'}],caption:'Original',hashtags:[] };
  await db.query("select bn_content_studio_save($1,null,null,'BN original',$2::jsonb,'draft')",[ids[2],JSON.stringify(spec)]);
  await db.exec(await read('../supabase/migrations/20261029003627_disable_company_studio_pending_master_integration.sql'));
  for (const [index, label] of ['admin','trainer','master with membership'].entries()) {
   await t.test(`${label} cannot RPC, upload, list, overwrite or delete company Studio`, async () => {
    await identity(ids[index]);
    await assert.rejects(db.query('select get_company_content($1)',[A]), { code:'42501' });
    await assert.rejects(db.query('select save_company_content($1,$2::jsonb,1)',[A,JSON.stringify(document)]), { code:'42501' });
    assert.equal((await db.query('select company_content_image_access($1) as v',[path])).rows[0].v,false);
    assert.equal((await db.query('select * from storage.objects where bucket_id=$1',[bucket])).rows.length,0);
    await assert.rejects(db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',[bucket,path.replace('000001.png','000002.png'),ids[index]]), {code:'42501'});
    assert.equal((await db.query('update storage.objects set metadata=metadata returning id')).rows.length,0);
    assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
    await assert.rejects(db.query('select * from company_content_studios'), {code:'42501'});
    await assert.rejects(db.query('select * from company_content_history'), {code:'42501'});
   });
  }
  await t.test('RPC bodies and table fences still deny after accidental broad grants', async () => {
   await db.exec('reset role');
   await db.exec(`grant execute on function get_company_content(uuid),save_company_content(uuid,jsonb,integer) to authenticated;
    grant select,insert,update,delete on company_content_studios,company_content_history to authenticated;
    create policy synthetic_table_broad on company_content_studios for all to public using(true) with check(true);
    create policy synthetic_history_broad on company_content_history for all to public using(true) with check(true);`);
   for (const uid of ids) {
    await identity(uid);
    await assert.rejects(db.query('select get_company_content($1)',[A]), { code:'42501' });
    await assert.rejects(db.query('select save_company_content($1,$2::jsonb,1)',[A,JSON.stringify(document)]), { code:'42501' });
    assert.equal((await db.query('select * from company_content_studios')).rows.length,0);
    assert.equal((await db.query('select * from company_content_history')).rows.length,0);
    assert.equal((await db.query('delete from company_content_studios returning company_id')).rows.length,0);
    await assert.rejects(db.query('insert into company_content_studios(company_id,version,document) values($1,1,$2::jsonb)',[A,JSON.stringify(document)]), { code:'42501' });
   }
  });
  await t.test('anon denied; unrelated buckets and canonical BN master access survive', async () => {
   await identity('', 'anon');
   await assert.rejects(db.query('select get_company_content($1)',[A]), {code:'42501'});
   await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,path]), {code:'42501'});
   await db.exec('reset role');
   await db.exec("insert into storage.buckets(id,name,public) values('unrelated','unrelated',false)");
   await identity(ids[0]);
   await db.exec("insert into storage.objects(bucket_id,name) values('unrelated','ok')");
   assert.equal((await db.query('select * from bn_content_studio_posts')).rows.length,0);
   // Shared helper must remain active for experience defaults/adoption, not be disabled globally.
   assert.equal((await db.query('select get_platform_experience_defaults($1) as v',[A])).rows[0].v,null);
   await identity(ids[2]);
   assert.equal((await db.query('select spec from bn_content_studio_posts')).rows[0].spec.topic,'BN preserved');
   await db.exec('reset role');
   const saved = (await db.query('select * from company_content_studios')).rows;
   assert.deepEqual(saved,before);
   assert.deepEqual((await db.query('select * from company_content_history')).rows,history);
   assert.equal((await db.query('select count(*)::int as n from storage.objects where bucket_id=$1',[bucket])).rows[0].n,1);
  });
 } finally { await db.close(); }
});
