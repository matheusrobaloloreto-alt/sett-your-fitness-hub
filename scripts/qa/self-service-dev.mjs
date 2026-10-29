import { spawn } from 'node:child_process';
import { openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { repo, output, privateFile, localEnv, verifyProject } from './self-service-local.mjs';
import { LOCAL_URL, LOCAL_PROJECT } from './self-service-safety.mjs';

verifyProject();
if (process.argv[2] === 'serve') {
  const keys = JSON.parse(readFileSync(path.join(output, 'status.private.json'), 'utf8'));
  process.env.VITE_SUPABASE_URL = LOCAL_URL;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = keys.ANON_KEY;
  process.env.VITE_SUPABASE_PROJECT_ID = LOCAL_PROJECT;
  const server = await createServer({
    root: repo, configFile: path.join(repo, 'vite.config.ts'), mode: 'qa', envDir: output,
    cacheDir: path.join(output, 'vite-cache'),
    server: { host: '127.0.0.1', port: 57431, strictPort: true,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/output/**'] },
      watch: { ignored: ['**/output/**'] },
    },
  });
  await server.listen();
  console.log('QA UI http://127.0.0.1:57431 (local Supabase only)');
} else if (process.argv[2] === 'start') {
  privateFile('vite.private.log', '');
  const log = openSync(path.join(output, 'vite.private.log'), 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], {
    cwd: repo, env: localEnv, detached: true, stdio: ['ignore', log, log],
  });
  privateFile('vite.pid', String(child.pid));
  child.unref();
  console.log('QA UI launch requested: http://127.0.0.1:57431');
} else throw new Error('Usage: node scripts/qa/self-service-dev.mjs start|serve');
