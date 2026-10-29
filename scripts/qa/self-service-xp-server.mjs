import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { run, output, privateFile, network } from './self-service-local.mjs';

const variant = process.argv[2] ?? 'vanilla';
if (!['vanilla', 'supabase'].includes(variant)) throw new Error('Choose vanilla|supabase isolated postmaster');
const suffix = variant === 'vanilla' ? '' : '-supabase';
const image = variant === 'vanilla' ? 'postgres:17' : 'public.ecr.aws/supabase/postgres:17.6.1.106';
const container = `sett-self-service-xp-isolated-20261026${suffix}`;
const port = variant === 'vanilla' ? 57452 : 57453;
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
const inspection = run('docker', ['container', 'inspect', container]);
if (inspection.status === 0) throw new Error('Dedicated XP server already exists; inspect its recorded state, do not replace it');
const password = randomBytes(32).toString('hex');
const env = privateFile(`xp-server${suffix}.env.local`, `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=self_service_xp\nPGDATA=/var/lib/postgresql/data\n`);
const data = path.join(output, `xp-postgres-data${suffix}`);
mkdirSync(data, { recursive: true, mode: 0o700 });
const started = run('docker', ['run', '--detach', '--pull=never', '--name', container,
  '--label', 'sett.qa.scope=self-service-xp-isolated', '--network', network,
  '--memory', '512m', '--cpus', '1', '--pids-limit', '100',
  '--env-file', env, '--mount', `type=bind,src=${data},dst=/var/lib/postgresql/data`,
  '--publish', `127.0.0.1:${port}:5432`, image, 'postgres', '-D', '/var/lib/postgresql/data',
  '-c', 'listen_addresses=*',
  '-c', 'shared_buffers=32MB', '-c', 'max_connections=15',
  '-c', 'log_error_verbosity=verbose', '-c', 'jit=on',
  ...(variant === 'supabase' ? ['-c', 'shared_preload_libraries=pg_stat_statements,pgaudit,plpgsql,plpgsql_check,pg_cron,pg_net,pgsodium,auto_explain,pg_tle,plan_filter,supabase_vault'] : [])], { timeout: 120000 });
privateFile(`xp-server${suffix}-start.private.log`, started.stdout + started.stderr);
if (started.status !== 0) throw new Error('Separate XP server start failed; inspect private log');
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  const probe = run('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres']);
  if (probe.status === 0) { ready = true; break; }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!ready) throw new Error('Separate XP postmaster did not become ready; inspect owned container logs');
if (variant === 'supabase') {
  // The bundled template1 contains Auth objects; the SQL fixture requires template0.
  const emptyDatabase = run('docker', ['exec', '-u', 'postgres', container, 'psql',
    '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    '-c', 'DROP DATABASE self_service_xp;',
    '-c', 'CREATE DATABASE self_service_xp WITH OWNER postgres TEMPLATE template0;']);
  if (emptyDatabase.status !== 0) throw new Error('Separate Supabase fixture database initialization failed');
}
const address = run('docker', ['inspect', container, '--format', `{{(index .NetworkSettings.Networks "${network}").IPAddress}}`]);
const ip = address.stdout.trim();
if (address.status !== 0 || !/^172\.23\.\d+\.\d+$/.test(ip)) throw new Error('Dedicated XP internal address not found');
privateFile(`xp-server${suffix}.private.json`, JSON.stringify({ container, port, password, ip,
  database: 'self_service_xp', auth: 'SQL simulated, not GoTrue', image,
  separatePostmaster: true, memory: '512m', cpus: 1 }, null, 2));
const tunnel = run('ssh', ['-F', '/Users/macbookpro/.colima/_lima/colima/ssh.config',
  '-S', 'none', '-o', 'ControlMaster=no', '-o', 'ExitOnForwardFailure=yes', '-f', '-N',
  '-L', `127.0.0.1:${port}:${ip}:5432`, 'lima-colima']);
if (tunnel.status !== 0) throw new Error('Separate XP server tunnel failed; container retained');
console.log(`Separate PostgreSQL postmaster created: ${container}, loopback ${port}, 512 MiB/1 CPU; private credentials retained only in ignored output.`);
