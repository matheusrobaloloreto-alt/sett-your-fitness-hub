import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterAll, expect, it, vi } from 'vitest';
import { requireCompanyFeature } from '../../supabase/functions/_shared/company-feature-entitlements';
import { HttpError } from '../../supabase/functions/_shared/tenant-auth';

const paths = ['supabase/functions/whatsapp-manager/index.ts', 'supabase/functions/_shared/company-feature-entitlements.ts', 'supabase/functions/_shared/tenant-auth.ts'];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const frozen = paths.map(path => readFileSync(path, 'utf8'));
paths.forEach((path, i) => console.log(`INDEPENDENT_SOURCE ${sha(frozen[i])} ${path}`));
afterAll(() => paths.forEach((path, i) => expect(sha(readFileSync(path, 'utf8')), `source changed: ${path}; rerun required`).toBe(sha(frozen[i]))));
const company = '10000000-0000-4000-8000-000000000001';

function actualHandler(decision: unknown, lookupError: unknown = null) {
  let handler!: (req: Request) => Promise<Response>;
  const network = vi.fn(() => { throw new Error('independent QA forbids network'); });
  const table = vi.fn(() => { throw new Error('business data read before commercial authorization'); });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'has_role') return { data: args._role === 'admin', error: null };
    if (name === 'get_user_company_id') return { data: company, error: null };
    if (name === 'service_company_feature_allowed') return { data: decision, error: lookupError };
    throw new Error(`unexpected RPC ${name}`);
  });
  const client = { auth: { getClaims: async () => ({ data: { claims: { sub: 'synthetic-admin' } }, error: null }) }, rpc, from: table };
  const ast = ts.createSourceFile(paths[0], frozen[0], ts.ScriptTarget.Latest, true);
  const body = ts.factory.updateSourceFile(ast, ast.statements.filter(s => !ts.isImportDeclaration(s)));
  const code = ts.transpileModule(ts.createPrinter().printFile(body), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports: {}, Request, Response, URL, fetch: network,
    console: { error: () => {} }, createClient: () => client, requireCompanyFeature, HttpError, FeatureHttpError: HttpError,
    Deno: { env: { get: () => 'synthetic' }, serve: (fn: typeof handler) => { handler = fn; } },
  });
  return { handler, network, table, rpc };
}

it.each(['fetch-media', 'fetch-profile-picture', 'fetch-contacts', 'fetch-groups', 'fetch-bot-settings', 'provider-diagnostics', 'check-status'])('actual %s stops disabled capability before business reads, signing or provider access', async action => {
  const { handler, network, table, rpc } = actualHandler(false);
  const response = await handler(new Request('http://localhost/synthetic', { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ action, companyId: company, chatId: company, messageId: company }) }));
  expect(response.status).toBe(403);
  expect(table).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('service_company_feature_allowed', expect.objectContaining({ _company_id: company, _feature: 'hasWhatsApp' }));
});

it.each([null, 'true', 1, {}, []])('malformed capability %j never enables media signing', async decision => {
  const { handler, table, network } = actualHandler(decision);
  const response = await handler(new Request('http://localhost/synthetic', { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ action: 'fetch-media', companyId: company }) }));
  expect(response.status).toBe(403); expect(table).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});

it('lookup failure and foreign tenant fail before media read or provider', async () => {
  for (const foreign of [false, true]) {
    const { handler, rpc, network, table } = actualHandler(true, { code: 'PGRST202' });
    const response = await handler(new Request('http://localhost/synthetic', { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ action: 'fetch-media', companyId: foreign ? '10000000-0000-4000-8000-000000000002' : company }) }));
    expect(response.status).toBe(foreign ? 403 : 503);
    if (foreign) expect(rpc.mock.calls.some(([name]) => name === 'service_company_feature_allowed')).toBe(false);
    expect(network).not.toHaveBeenCalled(); expect(table).not.toHaveBeenCalled();
  }
});
