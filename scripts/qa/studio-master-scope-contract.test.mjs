import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertCompanyStudioDenied,assertStudioSurfaceScope} from './studio-master-scope-contract.mjs';
test('accept only explicit forbidden or privilege-hidden PostgREST RPC responses',()=>{
 for(const r of [{status:403,body:{code:'42501'}},{status:404,body:{code:'PGRST202'}}])assert.doesNotThrow(()=>assertCompanyStudioDenied(r));
 for(const r of [{status:200,body:{}},{status:401,body:{code:'42501'}},{status:404,body:{code:'PGRST205'}},{status:502,body:{}},{status:403,body:{}}])assert.throws(()=>assertCompanyStudioDenied(r));
});
test('company route/menu absent; canonical master route/menu retained',()=>{
 const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8'),sidebar=readFileSync(new URL('../../src/components/AppSidebar.tsx',import.meta.url),'utf8');
 assert.doesNotThrow(()=>assertStudioSurfaceScope(app,sidebar));
 assert.throws(()=>assertStudioSurfaceScope(app+' /admin/content-studio',sidebar));
 assert.throws(()=>assertStudioSurfaceScope(app,sidebar+' /admin/content-studio'));
 assert.throws(()=>assertStudioSurfaceScope(app.replaceAll('/master/bn-content','/removed'),sidebar));
 assert.throws(()=>assertStudioSurfaceScope(app,sidebar.replaceAll('/master/bn-content','/removed')));
});
test('both native gates run company denial rather than successful studio readback',()=>{
 const preview=readFileSync(new URL('./autonomy-product-preview.mjs',import.meta.url),'utf8');
 const rpc=readFileSync(new URL('./autonomy-product-rpc.mjs',import.meta.url),'utf8');
 assert.match(preview,/20261029003627_disable_company_studio_pending_master_integration\.sql/);
 assert.match(preview,/assertStudioSurfaceScope\(/);
 assert.match(preview,/assertCompanyStudioDenied\(/);
 assert.match(rpc,/assertCompanyStudioDenied\(/);
 assert.doesNotMatch(rpc,/company Studio draft and branded content readback/);
 assert.doesNotMatch(preview,/const expected=\[[^\n]*'get_company_content'/);
 assert.doesNotMatch(preview,/for\(const name of \[[^\n]*'get_company_content'/);
});
