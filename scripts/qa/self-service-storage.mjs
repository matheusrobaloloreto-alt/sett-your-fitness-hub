import { credentials } from './self-service-api.mjs';
import { run, privateFile, sql, network, dbContainer } from './self-service-local.mjs';
import { LOCAL_PROJECT } from './self-service-safety.mjs';

// Official cached Storage supplies its schema for a fair historical replay.
const keys = credentials();
const db = new URL(keys.DB_URL);
db.hostname = dbContainer;
db.port = '5432';
db.username = 'supabase_storage_admin';
const schema = run('docker', ['exec', '-i', '-e', `PGPASSWORD=${decodeURIComponent(db.password)}`, dbContainer, 'psql', '-X', '-w', '-h', '127.0.0.1', '-U', 'supabase_admin',
  '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
  input: 'create schema if not exists storage authorization supabase_storage_admin;',
});
if (schema.status !== 0) throw new Error('Local Storage schema initialization failed');
const env = privateFile('storage.env.local', Object.entries({
  ANON_KEY: keys.ANON_KEY, SERVICE_KEY: keys.SERVICE_ROLE_KEY, AUTH_JWT_SECRET: keys.JWT_SECRET,
  DATABASE_URL: db.href, POSTGREST_URL: `http://supabase_rest_${LOCAL_PROJECT}:3000`,
  STORAGE_BACKEND: 'file', FILE_STORAGE_BACKEND_PATH: '/var/lib/storage',
  TENANT_ID: LOCAL_PROJECT, REGION: 'local', GLOBAL_S3_BUCKET: 'local',
  ENABLE_IMAGE_TRANSFORMATION: 'false', FILE_SIZE_LIMIT: '52428800',
}).map(([key, value]) => `${key}=${value}`).join('\n'));
const name = `supabase_storage_${LOCAL_PROJECT}`;
const existing = run('docker', ['inspect', name]);
if (existing.status !== 0) {
  const started = run('docker', ['run', '-d', '--name', name, '--network', network,
    '--env-file', env, 'public.ecr.aws/supabase/storage-api:v1.71.0']);
  if (started.status !== 0) throw new Error('Official local Storage startup failed');
}
console.log('Official Storage bootstrap launched on internal network only; no host ports.');
