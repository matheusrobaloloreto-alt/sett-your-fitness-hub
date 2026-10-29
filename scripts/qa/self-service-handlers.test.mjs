import test from 'node:test';
import assert from 'node:assert/strict';

async function handler(port, body, method = 'POST') {
  assert.ok([57441,57442].includes(port));
  return fetch(`http://127.0.0.1:${port}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}
test('actual public-anamnesis handler rejects a bare student UUID without a session', async () => {
  const response = await handler(57441, { action: 'context', studentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
  assert.equal(response.status, 401);
});
test('actual public-anamnesis handler rejects a missing invite before touching data', async () => {
  const response = await handler(57441, { action: 'context' });
  assert.equal(response.status, 400);
});
test('actual intercycle handler rejects malformed opaque tokens', async () => {
  const response = await handler(57442, { action: 'context', token: 'invalid' });
  assert.equal(response.status, 404);
});
test('actual form handlers serve CORS preflight locally', async () => {
  for (const port of [57441,57442]) assert.equal((await handler(port, undefined, 'OPTIONS')).status, 200);
});
