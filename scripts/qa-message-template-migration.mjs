import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('Pass the installed PGlite module path.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
try {
  await db.exec(`create table public.message_templates (
    id text primary key, company_id text, name text not null, content text not null
  ); insert into public.message_templates values ('legacy', 'qa', 'Original', 'Keep this text');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260929093858_message_template_attachments.sql', import.meta.url), 'utf8'));
  const { rows } = await db.query('select * from public.message_templates');
  assert.equal(rows[0].content, 'Keep this text');
  assert.deepEqual(rows[0].attachments, []);
  await db.query('update public.message_templates set attachments=$1 where id=$2', [JSON.stringify([{path:'qa/templates/legacy/example.png'}]), 'legacy']);
  for (const value of ['{}', 'null', '"bad"', '1']) {
    await assert.rejects(db.query('update public.message_templates set attachments=$1 where id=$2', [value, 'legacy']));
  }
  await assert.rejects(db.query('update public.message_templates set attachments=null'));
  const result = await db.query('select content, jsonb_array_length(attachments) as count from public.message_templates');
  assert.deepEqual(result.rows, [{ content:'Keep this text', count:1 }]);
  console.log('Migration QA: legacy text retained; array default and constraints verified; no row loss.');
} finally {
  await db.close();
}
