import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { sql, repo, output, privateFile } from './self-service-local.mjs';

const files = [
  'supabase/migrations/20261026092601_company_product_settings.sql',
  'supabase/migrations/20261026093137_company_communication_cadence.sql',
];
const sources = files.map(file => readFileSync(path.join(repo, file), 'utf8'));
const definitions = [...sources[0].matchAll(/create function public\.([a-z_]+)\([\s\S]*?\$\$;/gi)];
if (definitions.map(match => match[1]).join(',') !== 'company_product_settings_defaults,validate_company_product_settings,save_company_product_settings') throw new Error('Foundation function boundary changed; manual review required');
const boundary = sources[1].indexOf('create table public.company_push_reminder_receipts');
if (boundary < 0) throw new Error('Cadence function boundary changed');
const cadence = sources[1].slice(0, boundary);
if (/\b(?:create|alter|drop)\s+(?:table|schema)\b/i.test(cadence)) throw new Error('Refresh must not contain table/schema DDL');
const canonical = [
  ['supabase/migrations/20260910103000_weekly_contact_consent_ledger.sql', 'process_automation_triggers'],
  ['supabase/migrations/20260612230939_progress_photos_automation_recovery.sql', 'mark_payment_recovery_abandoned'],
].map(([file, name]) => {
  const definition = readFileSync(path.join(repo, file), 'utf8').match(new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\n\\$\\$;`, 'i'))?.[0];
  if (!definition) throw new Error(`Exact canonical prerequisite missing: ${name}`);
  return definition;
});
const stamp = Date.now();
privateFile(`functions-before-${stamp}.private.json`, sql("select jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('company_product_settings_defaults','validate_company_product_settings','save_company_product_settings','company_communication_number','company_contact_window_open','process_automation_triggers','mark_payment_recovery_abandoned');"));
const settingsBefore = sql('select md5(coalesce(jsonb_agg(to_jsonb(s) order by company_id)::text,\'[]\')) from public.company_product_settings s;');
sql(`begin;\n${definitions.map(match => match[0].replace(/^create function/i, 'create or replace function')).join('\n')}
${canonical.join('\n')}
${cadence}
commit; notify pgrst, 'reload schema';`);
const settingsAfter = sql('select md5(coalesce(jsonb_agg(to_jsonb(s) order by company_id)::text,\'[]\')) from public.company_product_settings s;');
if (settingsAfter !== settingsBefore) throw new Error('Settings changed during function refresh; investigate concurrent writes');
const ledger = JSON.parse(readFileSync(path.join(output, 'applied-migrations.json'), 'utf8'));
for (const [index, file] of files.entries()) {
  const entry = ledger.find(item => item.file === file);
  if (!entry) throw new Error('Original migration application record required');
  const sha256 = createHash('sha256').update(sources[index]).digest('hex');
  entry.functionRefreshes = [...(entry.functionRefreshes ?? []), {
    previousSha256: entry.sha256, sha256, refreshedAt: new Date().toISOString(),
    scope: 'canonical function-only replay; existing table DDL, ACLs and saved data preserved',
  }];
  entry.sha256 = sha256;
}
privateFile('applied-migrations.json', JSON.stringify(ledger, null, 2));
privateFile(`function-refresh-${stamp}.json`, JSON.stringify({ files, settingsChecksumPreserved: true,
  transaction: 'single atomic function-only refresh', schemaReset: false, authReset: false }, null, 2));
console.log('Foundation/cadence canonical functions refreshed atomically; settings checksum preserved; no schema/Auth reset. Exact refresh fingerprints recorded.');
