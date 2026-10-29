import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { assertLocalUrl, LOCAL_URL } from './self-service-safety.mjs';
import { output, privateFile } from './self-service-local.mjs';

export function credentials() {
  const values = JSON.parse(readFileSync(path.join(output, 'status.private.json'), 'utf8'));
  if (!values.ANON_KEY || !values.SERVICE_ROLE_KEY) throw new Error('Start the isolated stack first');
  return values;
}

export async function api(endpoint, { method = 'GET', body, token, admin = false } = {}) {
  const keys = credentials();
  const key = admin ? keys.SERVICE_ROLE_KEY : keys.ANON_KEY;
  const response = await fetch(assertLocalUrl(`${LOCAL_URL}${endpoint}`), {
    method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { apikey: key, Authorization: `Bearer ${token || key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

export async function login(person, { fresh = false } = {}) {
  const cachePath = path.join(output, 'auth-sessions.private.json');
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const cached = cache[person.email];
  if (!fresh && cached?.user?.id === person.id && cached.expires_at > Date.now() / 1000 + 60) return cached;
  // Generate and redeem a LOCAL magic-link token without sending mail. This uses
  // real GoTrue session issuance while avoiding slow bcrypt on the saturated VM.
  const link = await api('/auth/v1/admin/generate_link', { method: 'POST', admin: true,
    body: { type: 'magiclink', email: person.email } });
  if (!link.ok || !link.data?.hashed_token) throw new Error(`Synthetic Auth token generation failed: HTTP ${link.status}`);
  const response = await api('/auth/v1/verify', { method: 'POST',
    body: { type: 'magiclink', token_hash: link.data.hashed_token } });
  if (!response.ok || !response.data?.access_token) throw new Error(`Synthetic login failed: HTTP ${response.status}`);
  cache[person.email] = response.data;
  privateFile('auth-sessions.private.json', JSON.stringify(cache));
  return response.data;
}

export function fixture() {
  return JSON.parse(readFileSync(path.join(output, 'identities.private.json'), 'utf8'));
}
