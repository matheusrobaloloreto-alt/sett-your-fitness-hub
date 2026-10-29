import assert from 'node:assert/strict';

// REVOKE EXECUTE may hide an existing RPC from PostgREST (404/PGRST202).
// An exposed deny body returns 403/42501. Neither outages nor generic 404s pass.
export function assertCompanyStudioDenied(response,label='company Studio'){
 const denied=(response.status===403&&response.body?.code==='42501')||
  (response.status===404&&response.body?.code==='PGRST202');
 assert.ok(denied,`${label}: expected 403/42501 or 404/PGRST202, got HTTP ${response.status}/${response.body?.code??'unknown'}`);
}
export function assertStudioSurfaceScope(app,sidebar){
 for(const [name,source] of [['App',app],['Sidebar',sidebar]]){
  assert.ok(!source.includes('/admin/content-studio'),`${name}: company Studio still exposed`);
  assert.ok(source.includes('/master/bn-content'),`${name}: canonical Master BN Studio missing`);
 }
}
