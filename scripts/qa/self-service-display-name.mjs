import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { sql, repo, output, privateFile } from './self-service-local.mjs';

const file = 'supabase/migrations/20260614180224_weekly_consistency_leaderboard.sql';
const source = readFileSync(path.join(repo, file), 'utf8');
const definition = source.match(/CREATE OR REPLACE FUNCTION public\.private_display_name\(_full_name text\)[\s\S]*?\n\$\$;/i)?.[0];
if (!definition) throw new Error('Exact canonical display-name helper not found');
sql(`${definition}
  revoke all on function public.private_display_name(text) from public,anon,authenticated;
  grant execute on function public.private_display_name(text) to authenticated,service_role;
  notify pgrst, 'reload schema';`);
const ledger = JSON.parse(readFileSync(path.join(output, 'canonical-prerequisites.json'), 'utf8'));
ledger.push({ file, name: 'private_display_name', signature: 'text',
  sha256: createHash('sha256').update(definition).digest('hex'),
  executableCoverage: 'exact canonical helper installed additively for actual ranking consumer' });
privateFile('canonical-prerequisites.json', JSON.stringify(ledger.filter((item, index, items) =>
  item.name !== 'private_display_name' || index === items.length - 1), null, 2));
if (sql("select public.private_display_name('Synthetic Student');") !== 'Synthetic S.') throw new Error('Canonical display-name output mismatch');
console.log('Canonical display-name dependency installed additively; private source fingerprint recorded. No schema reset.');
