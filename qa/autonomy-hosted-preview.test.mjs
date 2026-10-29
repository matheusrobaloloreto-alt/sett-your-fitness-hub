import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiPath,checkBearer,checkRequest,validateConfig,PROJECT,UPSTREAM,ORIGIN,FUNCTIONS,UI_ASSETS} from '../scripts/qa/autonomy-hosted-preview.mjs';
const aliases=Object.fromEntries(FUNCTIONS.map(name=>[name,`qa-owned-${name}`]));
const token=payload=>`Bearer e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
const request=(url='/',extra={})=>({url,headers:{host:'127.0.0.1:57650',...extra}});
test('configuration requires accepted exact owned backend and four source-bound aliases',()=>{
 assert.deepEqual(validateConfig({projectRef:PROJECT,backendAccepted:true,functionAliases:aliases}),aliases);
 for(const config of [{projectRef:'production',backendAccepted:true,functionAliases:aliases},{projectRef:PROJECT,backendAccepted:false,functionAliases:aliases},{projectRef:PROJECT,backendAccepted:true,functionAliases:{...aliases,other:'qa-owned-other'}},{projectRef:PROJECT,backendAccepted:true,functionAliases:{...aliases,'public-anamnesis':'https://other.invalid'}}])assert.throws(()=>validateConfig(config));
});
test('routes use only fixed staging; known functions are aliases and query remains intact',()=>{
 assert.equal(apiPath('/__api/functions/v1/public-anamnesis?step=read',aliases),`/functions/v1/${aliases['public-anamnesis']}?step=read`);
 for(const route of ['auth','rest','storage'])assert.equal(apiPath(`/__api/${route}/v1/test?offset=1`,aliases),`/${route}/v1/test?offset=1`);
 for(const bad of ['https://other.invalid/__api/rest/v1/a','//other.invalid/__api/rest/v1/a','/__api/not-api/v1/a','/__api/rest/v1/%252e%252e/private','/__api/rest/v1/%00','/__api/rest/v1/%5csecret','/__api/rest/v1/%zz'])assert.throws(()=>apiPath(bad,aliases));
});
test('only staging anonymous or actual staging user issuer may be forwarded; signatures still belong to backend',()=>{
 checkBearer(undefined);checkBearer(token({role:'anon',ref:PROJECT,iss:'supabase'}));checkBearer(token({role:'authenticated',iss:`${UPSTREAM}/auth/v1`}));
 for(const payload of [{role:'service_role',ref:PROJECT},{role:'authenticated',iss:'https://production.invalid/auth/v1'},{role:'authenticated',ref:'production',iss:`${UPSTREAM}/auth/v1`},{role:'master',ref:PROJECT}])assert.throws(()=>checkBearer(token(payload)),/BEARER_NOT_ALLOWED/);
 assert.throws(()=>checkBearer('Basic private'),/BEARER_NOT_ALLOWED/);
});
test('preview refuses foreign Host/Origin and source/private/recording paths',()=>{
 assert.equal(checkRequest(request('/admin/settings',{origin:ORIGIN})),false);
 assert.equal(checkRequest(request('/__api/rest/v1/a',{origin:ORIGIN})),true);
 for(const bad of [request('/',{host:'evil.invalid'}),request('/',{origin:'https://evil.invalid'}),...['/output/credentials.private.json','/.env','/src/App.tsx','/@fs/etc/passwd','/gravacao/modelo.html','/node_modules/a','/%2eenv','/assets/%252e%252e/private'].map(url=>request(url))])assert.throws(()=>checkRequest(bad));
});
test('public copy is an exact ordinary UI asset list, excluding operational recording HTML',()=>{
 assert.ok(UI_ASSETS.includes('manifest.webmanifest'));assert.ok(UI_ASSETS.includes('sw.js'));
 assert.ok(UI_ASSETS.every(name=>!name.includes('gravacao')&&!name.endsWith('.html')&&!name.includes('private')));
});
