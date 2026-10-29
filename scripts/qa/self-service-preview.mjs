import { spawn } from 'node:child_process';
import { openSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { repo, output, localEnv, privateFile } from './self-service-local.mjs';

if (process.argv[2] === 'start') {
  const index = readFileSync(path.join(output, 'dist/index.html'));
  const log = openSync(privateFile('preview.private.log', ''), 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], {
    cwd: repo, env: localEnv, detached: true, stdio: ['ignore', log, log],
  });
  privateFile('preview.pid', String(child.pid));
  privateFile('preview-build.json', JSON.stringify({ startedAt: new Date().toISOString(),
    indexSha256: createHash('sha256').update(index).digest('hex'), port: 57432,
    source: 'existing compiled dist only; no rebuild', deployed: false }, null, 2));
  child.unref();
  console.log('Compiled preview requested at http://127.0.0.1:57432; existing dist only, no build/deploy.');
} else if (process.argv[2] === 'serve') {
  const { preview } = await import('vite');
  await preview({ root: repo, configFile: path.join(repo, 'vite.config.ts'), envDir: output,
    mode: 'production', build: { outDir: path.join(output, 'dist') },
    preview: { host: '127.0.0.1', port: 57432, strictPort: true, open: false } });
} else throw new Error('Usage: node scripts/qa/self-service-preview.mjs start|serve');
