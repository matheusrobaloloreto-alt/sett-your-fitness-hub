import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { repo, output, privateFile, run } from './self-service-local.mjs';
import { LOCAL_URL, LOCAL_PROJECT } from './self-service-safety.mjs';

const keys = JSON.parse(readFileSync(path.join(output, 'status.private.json'), 'utf8'));
if (!keys.ANON_KEY) throw new Error('Synthetic local anon key unavailable');
process.env.VITE_SUPABASE_URL = LOCAL_URL;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = keys.ANON_KEY;
process.env.VITE_SUPABASE_PROJECT_ID = LOCAL_PROJECT;
function inputHashes() {
  const listing = run('rg', ['--files', 'src', 'supabase/functions/_shared', 'public', 'vite.config.ts', 'package.json', 'package-lock.json']);
  if (listing.status !== 0) throw new Error('Build source listing failed');
  return Object.fromEntries(listing.stdout.trim().split('\n').filter(file =>
    /\.(?:tsx?|jsx?|json|css|html|svg)$/.test(file) && !/\.(?:test|spec)\.[tj]sx?$/.test(file)).sort()
    .map(file => [file, createHash('sha256').update(readFileSync(path.join(repo, file))).digest('hex')]));
}
const before = inputHashes();
await build({
  root: repo, configFile: path.join(repo, 'vite.config.ts'), envDir: output, mode: 'production',
  cacheDir: path.join(output, 'vite-build-cache'),
  build: { outDir: path.join(output, 'dist'), emptyOutDir: true },
});
const after = inputHashes();
privateFile('build-source-inputs.json', JSON.stringify({ builtAt: new Date().toISOString(),
  scope: 'production text inputs; not a full binary asset manifest', before, after,
  stableDuringBuild: JSON.stringify(before) === JSON.stringify(after) }, null, 2));
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Production source inputs changed during build; output is not a final checkpoint');
privateFile('build-environment.json', JSON.stringify({
  builtAt: new Date().toISOString(),
  mode: 'production', backend: LOCAL_URL, project: LOCAL_PROJECT,
  envSource: 'isolated-local-status', envDir: output, outDir: path.join(output, 'dist'),
  prebuildPostbuildRun: false, deployed: false,
}, null, 2));
console.log('Production-mode local build completed with synthetic local Supabase; no publish step.');
