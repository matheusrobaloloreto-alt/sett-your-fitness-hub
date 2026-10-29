import http from 'node:http';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentials } from './self-service-api.mjs';
import { repo, output, localEnv, privateFile } from './self-service-local.mjs';

if (process.argv[2] === 'start') {
  const log = openSync(privateFile('gateway.private.log', ''), 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], {
    cwd: repo, env: localEnv, detached: true, stdio: ['ignore', log, log],
  });
  privateFile('gateway.pid', String(child.pid));
  privateFile('transport.json', JSON.stringify({ gateway: 'native-loopback-proxy', sql: 'native-psql',
    officialServices: ['GoTrue', 'PostgREST', 'Postgres'], uiPort: 57431, apiPort: 57421, databasePort: 57422,
    authTunnelPort: 57439, restTunnelPort: 57438 }, null, 2));
  child.unref();
  console.log('Loopback gateway requested at http://127.0.0.1:57421; real GoTrue/PostgREST upstreams.');
} else if (process.argv[2] === 'serve') {
  const keys = credentials();
  const origins = new Set(['http://127.0.0.1:57431', 'http://127.0.0.1:57432']);
  const sharedCors = {
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,accept-profile,content-profile,prefer,range,x-client-info,x-supabase-api-version,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': 'content-range,range,x-total-count',
    Vary: 'Origin',
  };
  const server = http.createServer((request, response) => {
    const cors = { ...sharedCors, ...(origins.has(request.headers.origin)
      ? { 'Access-Control-Allow-Origin': request.headers.origin } : {}) };
    if (request.method === 'OPTIONS') { response.writeHead(204, cors); response.end(); return; }
    const raw = request.url || '/';
    const target = raw.startsWith('/auth/v1/') ? { port: 57439, prefix: '/auth/v1' }
      : raw.startsWith('/rest/v1/') ? { port: 57438, prefix: '/rest/v1' } : null;
    if (!target) { response.writeHead(404, cors); response.end(); return; }
    if (!raw.startsWith('/auth/v1/health') && ![keys.ANON_KEY, keys.SERVICE_ROLE_KEY, keys.PUBLISHABLE_KEY].includes(String(request.headers.apikey || ''))) {
      response.writeHead(401, cors); response.end('{"error":"Invalid local API key"}'); return;
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: target.port,
      path: raw.slice(target.prefix.length), method: request.method,
      headers: { ...request.headers, host: `127.0.0.1:${target.port}` }, timeout: 15000,
    }, result => {
      const headers = Object.fromEntries(Object.entries(result.headers)
        .filter(([name]) => !name.toLowerCase().startsWith('access-control-')));
      response.writeHead(result.statusCode || 502, { ...headers, ...cors });
      result.pipe(response);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('Local upstream timed out')));
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(503, cors); response.end('{"error":"Local upstream unavailable"}'); });
    request.pipe(upstream);
  });
  server.listen(57421, '127.0.0.1', () => console.log('Loopback-only gateway listening; no external targets supported.'));
} else throw new Error('Usage: node scripts/qa/self-service-gateway.mjs start|serve');
