import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { credentials } from './self-service-api.mjs';

test('loopback preflight permits PostgREST SDK header names', async () => {
  const names = ['authorization', 'apikey', 'accept-profile', 'content-profile',
    'x-supabase-client-platform', 'x-supabase-client-platform-version',
    'x-supabase-client-runtime', 'x-supabase-client-runtime-version'];
  const response = await fetch('http://127.0.0.1:57421/rest/v1/rpc/get_user_role', {
    method: 'OPTIONS', signal: AbortSignal.timeout(5000), headers: {
      Origin: 'http://127.0.0.1:57431',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': names.join(','),
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:57431');
  const permitted = response.headers.get('access-control-allow-headers').toLowerCase().split(',').map(s => s.trim());
  for (const name of names) assert.ok(permitted.includes(name), `missing allowed header ${name}`);
});

test('compiled preview origin is explicit and foreign origins are not reflected', async () => {
  for (const origin of ['http://127.0.0.1:57432', 'https://foreign.invalid', 'http://127.0.0.1:57433']) {
    const response = await fetch('http://127.0.0.1:57421/rest/v1/rpc/get_user_role', {
      method: 'OPTIONS', signal: AbortSignal.timeout(5000), headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,apikey,content-profile',
      },
    });
    assert.equal(response.headers.get('access-control-allow-origin'), origin.endsWith(':57432') ? origin : null);
    assert.match(response.headers.get('vary') ?? '', /Origin/i);
  }
});

test('upstream CORS headers do not duplicate the explicit local policy', async () => {
  const key = credentials().ANON_KEY;
  await new Promise((resolve, reject) => {
    const request = http.get('http://127.0.0.1:57421/rest/v1/qa_nonexistent_cors_probe', {
      headers: { Origin: 'http://127.0.0.1:57431', apikey: key, Authorization: `Bearer ${key}` },
      timeout: 5000,
    }, response => {
      try {
        const origins = response.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'access-control-allow-origin');
        assert.equal(origins.length, 1);
        assert.equal(response.headers['access-control-allow-origin'], 'http://127.0.0.1:57431');
        response.resume();
        response.on('end', resolve);
      } catch (error) { response.resume(); reject(error); }
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Local gateway timed out')));
  });
});
