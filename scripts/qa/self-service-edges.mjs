import { spawn } from 'node:child_process';
import { openSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { output, repo, privateFile, localEnv, verifyProject, run } from './self-service-local.mjs';

verifyProject();
const cacheEnv = { ...localEnv, DENO_DIR: path.join(output, 'deno-cache') };
const sources = ['public-anamnesis', 'intercycle-anamnesis', 'public-registration'];
const cached = run('deno', ['cache', '--no-config', '--node-modules-dir=none',
  '--lock', path.join(output, 'deno.lock'), ...sources.map(name => `supabase/functions/${name}/index.ts`)],
{ env: cacheEnv, timeout: 120000 });
privateFile('edge-cache.private.log', cached.stdout + cached.stderr);
if (cached.status !== 0) throw new Error('Deno dependency cache failed; inspect edge-cache.private.log');
for (const name of sources) {
  const pidPath = path.join(output, `${name}.pid`);
  if (existsSync(pidPath)) {
    const oldPid = Number(readFileSync(pidPath, 'utf8'));
    const command = run('ps', ['-p', String(oldPid), '-o', 'command=']);
    if (command.stdout.includes(`qa/self-service-edge-runner.ts ${name}`)) process.kill(oldPid, 'SIGTERM');
  }
  const logPath = privateFile(`${name}.private.log`, '');
  const log = openSync(logPath, 'a');
  const child = spawn('deno', ['run', '--no-config', '--cached-only', '--node-modules-dir=none',
    '--lock', path.join(output, 'deno.lock'),
    '--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,PUBLIC_APP_URL,PRE_REGISTRATION_CANARY_TOKEN',
    `--allow-read=${path.join(repo, 'supabase/functions')}`,
    '--allow-net=127.0.0.1:57421,127.0.0.1:57441,127.0.0.1:57442,127.0.0.1:57443',
    `--env-file=${path.join(output, 'qa.env.local')}`, 'qa/self-service-edge-runner.ts', name],
  { cwd: repo, env: cacheEnv, detached: true, stdio: ['ignore', log, log] });
  privateFile(`${name}.pid`, String(child.pid));
  child.unref();
}
console.log('Native Deno form handlers requested at 127.0.0.1:57441-57443; external runtime network denied.');
