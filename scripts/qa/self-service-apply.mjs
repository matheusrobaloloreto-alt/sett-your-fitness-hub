import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { repo, output, sql, privateFile } from './self-service-local.mjs';

const ledgerPath = path.join(output, 'applied-migrations.json');
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : [];
const files = process.argv.slice(2);
if (!files.length) throw new Error('Pass explicit approved migration paths; no implicit remote or all-schema action');
const commercialContinuation=new Set([
  'supabase/migrations/20261027095055_commercial_whatsapp_auxiliary_permissions.sql',
  'supabase/migrations/20261027095814_commercial_whatsapp_auxiliary_cleanup.sql',
]);
for (const file of files) {
  if (!/^supabase\/migrations\/20261026[0-9]{6}_[a-z_]+\.sql$/.test(file) && !commercialContinuation.has(file)) throw new Error('Only explicitly named self-service local migrations are allowed');
  const source = readFileSync(path.join(repo, file), 'utf8');
  if (!source.trim()) throw new Error(`Migration is still empty: ${file}`);
  const sha256 = createHash('sha256').update(source).digest('hex');
  const previous = ledger.find(entry => entry.file === file);
  if (previous) {
    if (previous.sha256 !== sha256) throw new Error(`Migration changed after local application: ${file}; a fresh explicit fixture is required`);
    console.log(`Already applied locally: ${file}`);
    continue;
  }
  sql(`begin;\n${source}\ncommit;\nnotify pgrst, 'reload schema';`);
  ledger.push({ file, sha256, appliedAt: new Date().toISOString() });
  privateFile('applied-migrations.json', JSON.stringify(ledger, null, 2));
  console.log(`Applied locally: ${file}`);
}
