// Independent offline sidecar review. Never calls the real exported main/listener.
// AST probes use synthetic filesystem/metadata boundaries; no CLI, private config,
// real fetch, build, remote write or credentials.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {apiPath,checkRequest,checkBearer,validateConfig,FUNCTIONS,UPSTREAM,ORIGIN,PROJECT} from '../scripts/qa/autonomy-hosted-preview.mjs';
const source=readFileSync(new URL('../scripts/qa/autonomy-hosted-preview.mjs',import.meta.url),'utf8');
const tree=ts.createSourceFile('gateway.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const aliases=Object.fromEntries(FUNCTIONS.map(name=>[name,`qa-review-${name}`]));
function find(predicate){let result;function walk(node){if(!result&&predicate(node))result=node;if(!result)ts.forEachChild(node,walk);}walk(tree);assert.ok(result,'Expected gateway structure changed; review harness needs explicit update');return result;}
function initializer(name){return find(n=>ts.isVariableDeclaration(n)&&n.name.getText(tree)===name).initializer.getText(tree);}
function gateway(aliasReady=true){
 const scope={apiPath,checkRequest,aliases,aliasReady,fail:code=>{throw new Error(code);},UPSTREAM,ORIGIN,PROJECT,repo:'/synthetic/repo',envDir:'/synthetic/env',outDir:'/synthetic/build',anon:'synthetic-public-key'};
 const plugin=vm.runInNewContext(`(${initializer('gatewayPlugin')})`,scope);
 const call=find(n=>ts.isCallExpression(n)&&n.expression.getText(tree)==='preview');
 const config=vm.runInNewContext(`(${call.arguments[0].getText(tree)})`,{...scope,gatewayPlugin:plugin});
 return {plugin,config};
}
test('P1: unknown functions and bare functions prefix cannot escape the four aliases',()=>{
 for(const raw of ['/__api/functions/v1/whatsapp-manager','/__api/functions/v1/asaas-integration','/__api/functions/v1/another-deployed-function','/__api/functions/v1/'])
  assert.throws(()=>apiPath(raw,aliases),undefined,raw);
});
test('P2: actual proxyReq hook strips browser Origin and forwarding identity',()=>{
 const {config}=gateway(),proxy=new EventEmitter();
 config.preview.proxy['/__api/'].configure(proxy);
 const headers=new Map(Object.entries({origin:ORIGIN,host:'127.0.0.1:57650','x-forwarded-host':'foreign','x-forwarded-proto':'http',forwarded:'host=foreign'}));
 proxy.emit('proxyReq',{setHeader:(k,v)=>headers.set(k,v),removeHeader:k=>headers.delete(k)});
 assert.equal(headers.has('origin'),false,'Browser Origin must not leave the loopback boundary');
 for(const name of ['x-forwarded-host','x-forwarded-proto','forwarded'])assert.equal(headers.has(name),false);
 assert.equal(headers.get('apikey'),'synthetic-public-key');
 assert.equal(config.preview.proxy['/__api/'].changeOrigin,true,'http-proxy must replace Host with fixed upstream Host');
});
test('P2: own ref does not legitimize a contradictory foreign user issuer',()=>{
 const payload={role:'authenticated',ref:PROJECT,iss:'https://foreign.invalid/auth/v1'};
 const bearer=`Bearer e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
 assert.throws(()=>checkBearer(bearer),/BEARER_NOT_ALLOWED/);
});
test('actual preview middleware rejects foreign Origin before next/proxy',()=>{
 const {plugin}=gateway();const stack=[];
 plugin.configurePreviewServer({middlewares:{use:fn=>stack.push(fn)}});
 assert.equal(stack.length,1);let next=false,status,body;
 stack[0]({url:'/__api/rest/v1/items',headers:{host:'127.0.0.1:57650',origin:'https://foreign.invalid'}},{writeHead:s=>status=s,end:b=>body=b,setHeader(){}},()=>next=true);
 assert.equal(status,403);assert.equal(next,false);assert.match(body,/Request not allowed/);
});
test('real installed Vite invokes configurePreviewServer hooks before adding proxy middleware',()=>{
 const viteEntry=readFileSync(new URL('../node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js',import.meta.url),'utf8');
 const hook=viteEntry.indexOf('config.getSortedPluginHooks("configurePreviewServer")');
 const proxy=viteEntry.indexOf('app.use(proxyMiddleware(httpServer, proxy, config))',hook);
 const staticAssets=viteEntry.indexOf('app.use(viteAssetMiddleware)',hook);
 assert.ok(hook>=0&&proxy>hook&&staticAssets>proxy);
});
test('real Supabase SDK uses loopback __api for all four pathways without real fetch',async()=>{
 const urls=[];
 const jwt=`e30.${Buffer.from(JSON.stringify({role:'authenticated',iss:`${UPSTREAM}/auth/v1`,exp:4102444800,sub:'00000000-0000-0000-0000-000000000001'})).toString('base64url')}.signature`;
 const client=createClient(`${ORIGIN}/__api`,'synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input)=>{
  const raw=String(input);urls.push(raw);
  return new Response(JSON.stringify(raw.includes('/auth/')?{id:'00000000-0000-0000-0000-000000000001'}:[]),{status:200,headers:{'content-type':'application/json'}});
 }}});
 await client.auth.getUser(jwt);
 await client.from('review_items').select('id').limit(1);
 await client.storage.from('review_bucket').list();
 await client.functions.invoke('public-anamnesis',{body:{synthetic:true}});
 assert.equal(urls.length,4);
 for(const [index,prefix] of ['auth','rest','storage','functions'].entries()){
  const url=new URL(urls[index]);assert.equal(url.origin,ORIGIN);assert.ok(url.pathname.startsWith(`/__api/${prefix}/v1/`));
  assert.ok(apiPath(url.pathname+url.search,aliases).startsWith(`/${prefix}/v1/`));
 }
});

function configGuard({mode=0o600,size=262144,isFile=true,isSymbolicLink=false,canonical='/synthetic/owned/config.json',absolute='/synthetic/owned/config.json'}={}){
 const statement=find(n=>ts.isIfStatement(n)&&n.thenStatement.getText(tree).includes("fail('PRIVATE_OWNED_CONFIG_REQUIRED')")).getText(tree);
 const stat={mode,size,isFile:()=>isFile,isSymbolicLink:()=>isSymbolicLink};
 return vm.runInNewContext(`(()=>{${statement};return true})()`,{
  absolute,owned:'/synthetic/owned',path:{sep:'/'},lstatSync:()=>stat,statSync:()=>stat,
  realpathSync:()=>canonical,fail:code=>{throw new Error(code);},
 });
}
test('updated config guard rejects special files, symlinks, wrong paths, public modes and >256KB; accepts boundary',()=>{
 assert.equal(configGuard(),true);
 for(const fixture of [{isFile:false},{isSymbolicLink:true},{mode:0o644},{size:262145},{canonical:'/foreign/config.json'},{absolute:'/foreign/config.json'}])
  assert.throws(()=>configGuard(fixture),/PRIVATE_OWNED_CONFIG_REQUIRED/);
});
test('P2: config mode is exactly 0600 rather than any owner-only permissions',()=>{
 for(const mode of [0o400,0o700,0o200,0])assert.throws(()=>configGuard({mode}),/PRIVATE_OWNED_CONFIG_REQUIRED/);
});
test('updated actual proxy hook removes cross-port Cookie, Referer and XFF',()=>{
 const {config}=gateway(),proxy=new EventEmitter();config.preview.proxy['/__api/'].configure(proxy);
 const headers=new Map([['cookie','synthetic-local-cookie'],['referer',`${ORIGIN}/synthetic`],['x-forwarded-for','synthetic-ip']]);
 proxy.emit('proxyReq',{setHeader:(k,v)=>headers.set(k,v),removeHeader:k=>headers.delete(k)});
 for(const header of ['cookie','referer','x-forwarded-for'])assert.equal(headers.has(header),false);
});
test('ownedDirectory rejects an intermediate symlink before accepting the build destination',()=>{
 const statement=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ownedDirectory').getText(tree);
 const buildDir='/synthetic/owned/frontend.private/compiled';
 const directory=vm.runInNewContext(`(${statement})`,{
  owned:'/synthetic/owned',path:{sep:'/',relative:(root,file)=>file.slice(root.length+1),join:(...parts)=>parts.join('/')},
  existsSync:()=>true,realpathSync:value=>value,mkdirSync:()=>assert.fail('No real mkdir expected'),
  lstatSync:file=>({isSymbolicLink:()=>file==='/synthetic/owned/frontend.private',isDirectory:()=>true}),
  fail:code=>{throw new Error(code);},
 });
 assert.throws(()=>directory(buildDir),/OWNED_DIRECTORY_REQUIRED/);
 const main=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='main').getText(tree);
 assert.ok(main.indexOf('ownedDirectory(outDir)')<main.indexOf('await build('));
});
test('preview finally closes HTTP if readiness metadata fails in either alias mode',async()=>{
 const statement=find(n=>ts.isTryStatement(n)&&n.finallyBlock?.getText(tree).includes('web.httpServer.close')).getText(tree);
 for(const aliasReady of [true,false]){
  let writes=0,closeAll=false,closed=false;
  const run=vm.runInNewContext(`(async()=>{${statement}})`,{
   privateJson:()=>{if(++writes===1)throw new Error('SYNTHETIC_METADATA_WRITE_FAILURE');},
   path:{join:(...parts)=>parts.join('/')},owned:'/synthetic/owned',ORIGIN,PROJECT,UPSTREAM,before:'synthetic-hash',anon:'synthetic-public',aliases,aliasReady,sha:()=>'',
   process:{pid:0,once:()=>assert.fail('No actual listener')},console:{log:()=>assert.fail('No actual logging')},
   web:{httpServer:{closeAllConnections:()=>{closeAll=true;},close:done=>{closed=true;done();}}},
  });
  await assert.rejects(run(),/SYNTHETIC_METADATA_WRITE_FAILURE/);
  assert.equal(closeAll,true);assert.equal(closed,true);assert.equal(writes,2);
 }
});


function debugClearStatements(){
 return ['DEBUG','NODE_DEBUG','NODE_DEBUG_NATIVE'].map(name=>find(n=>ts.isDeleteExpression(n)&&n.expression.getText(tree)===`process.env.${name}`));
}
test('debug env deletion occurs in source before dynamic Vite import',()=>{
 const viteImport=find(n=>ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&n.arguments[0]?.text==='vite');
 for(const deletion of debugClearStatements())assert.ok(deletion.getStart(tree)<viteImport.getStart(tree),`${deletion.getText(tree)} must precede Vite import`);
});
function offlineChild(code,environment){
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{
  cwd:new URL('../',import.meta.url),env:{...process.env,NODE_OPTIONS:'',DEBUG:'',NODE_DEBUG:'',NODE_DEBUG_NATIVE:'',...environment},encoding:'utf8',timeout:15000,maxBuffer:1024*1024,
 });
 assert.equal(result.error,undefined,'Synthetic subprocess failed');assert.equal(result.status,0,'Synthetic subprocess exited unsuccessfully');
 return result.stdout+result.stderr;
}
test('actual Vite proxy debug branch keeps a query sentinel silent after env clearing; negative control logs it',()=>{
 const viteFile=readFileSync(new URL('../node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js',import.meta.url),'utf8');
 const parsed=ts.createSourceFile('vite.mjs',viteFile,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const declarations=new Map(parsed.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name?.text,n.getText(parsed)]));
 const createDebugger=declarations.get('createDebugger'),proxyMiddleware=declarations.get('proxyMiddleware');
 assert.ok(createDebugger&&proxyMiddleware,'Installed Vite debug/proxy implementation changed');
 const sentinel='QA_SYNTHETIC_QUERY_SENTINEL_NO_CREDENTIAL';
 const clears=debugClearStatements().map(n=>n.getText(tree)+';').join('');
 const probe=clear=>`
  import vm from 'node:vm';import {EventEmitter} from 'node:events';
  ${clear?clears:''}
  await import('vite');
  const {default:debug}=await import('debug');
  const makeDebug=vm.runInNewContext('('+${JSON.stringify(createDebugger)}+')',{debug$j:debug,DEBUG:process.env.DEBUG,filter:undefined});
  const proxyFactory=vm.runInNewContext('('+${JSON.stringify(proxyMiddleware)}+')',{
   debug$5:makeDebug('vite:proxy'),httpProxy$1:{createProxyServer:()=>Object.assign(new EventEmitter(),{web(){}})},doesProxyContextMatchUrl:()=>true,
  });
  const middleware=proxyFactory(null,{'/__api/':{target:'https://fixed.invalid',rewrite:x=>x}},{logger:{error(){}}});
  await middleware({url:'/__api/rest/v1/review?token=${sentinel}'},{},()=>{});
 `;
 const control=offlineChild(probe(false),{DEBUG:'vite:proxy'});
 assert.equal(control.includes(sentinel),true,'Negative control must prove that the real Vite proxy debug branch is exercised');
 const guarded=offlineChild(probe(true),{DEBUG:'vite:proxy'});
 assert.equal(guarded.includes(sentinel),false,'Cleared Vite DEBUG must suppress the synthetic query');
});
test('native HTTP debug keeps a synthetic query after runtime env deletion (offline characterization)',()=>{
 const sentinel='QA_SYNTHETIC_NATIVE_QUERY_SENTINEL_NO_CREDENTIAL';
 const clears=debugClearStatements().map(n=>n.getText(tree)+';').join('');
 const output=offlineChild(`${clears}const {debuglog}=await import('node:util');debuglog('http')('/__api/rest/v1/review?token=${sentinel}');`,{NODE_DEBUG:'http'});
 assert.equal(output.includes(sentinel),true,'Control must demonstrate that runtime deletion cannot disable the native HTTP logger cached at startup');
});

test('actual helper rejects either native debug variable before config/metadata/HTTP',async()=>{
 const declaration=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='main');
 const main=declaration.getText(tree).replace(/^export\s+/,'');
 assert.match(declaration.body.statements[0].getText(tree),/NODE_DEBUG/);
 assert.match(declaration.body.statements[0].getText(tree),/NODE_DEBUG_NATIVE/);
 for(const inherited of [{NODE_DEBUG:'http',NODE_DEBUG_NATIVE:'',DEBUG:''},{NODE_DEBUG:'',NODE_DEBUG_NATIVE:'http',DEBUG:''},{NODE_DEBUG:'http',NODE_DEBUG_NATIVE:'http',DEBUG:''}]){
  let metadataCalls=0,configReads=0;
  const run=vm.runInNewContext(`(${main})`,{
   path,owned:'/synthetic/owned',repo:'/synthetic/repo',PROJECT,UPSTREAM,ORIGIN,validateConfig,checkBearer,
   process:{env:inherited},
   lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false}),realpathSync:x=>x,statSync:()=>({mode:0o600,size:128}),
   readFileSync:()=>{configReads++;return JSON.stringify({projectRef:PROJECT,backendAccepted:true,functionAliases:aliases});},
   execFileSync:()=>{metadataCalls++;throw new Error('UNSAFE_NATIVE_DEBUG_REACHED_METADATA');},
   fail:code=>{throw new Error(code);},
  });
  const failure=await run('/synthetic/owned/config.json').then(()=>null,error=>error);
  assert.ok(failure,'Contaminated native-debug launch must be rejected');
  assert.equal(failure.name,'Error','Unexpected VM/harness failure is not evidence of a deliberate safe refusal');
  assert.equal(failure.message,'NATIVE_DEBUG_ENV_NOT_ALLOWED');
  assert.equal(metadataCalls,0);assert.equal(configReads,0);
 }
});


function middlewareProbe(aliasReady,url,method='POST'){
 const {plugin}=gateway(aliasReady),stack=[];
 plugin.configurePreviewServer({middlewares:{use:fn=>stack.push(fn)}});
 let status,body,nextCalls=0;const headers={};
 stack[0]({url,method,headers:{host:'127.0.0.1:57650',origin:ORIGIN}},
  {writeHead:s=>status=s,end:b=>body=b,setHeader:(key,value)=>headers[key]=value},()=>nextCalls++);
 return {status,body,nextCalls,headers};
}
test('core mode denies every function before proxy including known sources, aliases, unknowns and OPTIONS',()=>{
 const names=[...FUNCTIONS,...Object.values(aliases),'whatsapp-manager','asaas-integration',''];
 for(const method of ['GET','POST','OPTIONS'])for(const name of names){
  const result=middlewareProbe(false,`/__api/functions/v1/${name}?synthetic=1`,method);
  assert.equal(result.status,403,`${method}/${name}`);assert.equal(result.nextCalls,0);
  assert.equal(result.body,'{"error":"Request not allowed in owned preview"}');
 }
});
test('core mode preserves real-proxy continuation for auth, REST, Storage and ordinary UI',()=>{
 for(const url of ['/__api/auth/v1/user','/__api/rest/v1/rpc/get_public_platform_content','/__api/storage/v1/object/list/review','/admin/settings']){
  const result=middlewareProbe(false,url);
  assert.equal(result.nextCalls,1,url);assert.equal(result.status,undefined);assert.equal(result.body,undefined);
 }
});
test('full mode permits only the four source functions and still maps each to its owned alias',()=>{
 for(const name of FUNCTIONS){
  assert.equal(middlewareProbe(true,`/__api/functions/v1/${name}`).nextCalls,1);
  assert.equal(apiPath(`/__api/functions/v1/${name}`,aliases),`/functions/v1/${aliases[name]}`);
 }
 for(const name of ['whatsapp-manager',...Object.values(aliases)])assert.equal(middlewareProbe(true,`/__api/functions/v1/${name}`).status,403);
});
function readinessProbe(aliasReady,statusFor=()=>200){
 const main=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='main');
 const statements=[...main.body.statements];
 const first=statements.findIndex(n=>ts.isIfStatement(n)&&n.getText(tree).includes("fail('STAGING_AUTH_NOT_READY')"));
 const last=statements.findIndex(n=>ts.isIfStatement(n)&&n.getText(tree).includes("fail('ALIAS_NOT_READY')"));
 assert.ok(first>=0&&last>first);
 const calls=[];
 const run=vm.runInNewContext(`(async()=>{${statements.slice(first,last+1).map(n=>n.getText(tree)).join('\n')}})`,{
  config:{aliasReadiness:aliasReady},aliases,ORIGIN,
  request:async(route,options)=>{calls.push({route,options});return {status:statusFor(route)};},
  fail:code=>{throw new Error(code);},
 });
 return {calls,run};
}
test('core startup still requires Auth/REST health, skips all alias OPTIONS; full mode probes all four',async()=>{
 const core=readinessProbe(false);await core.run();
 assert.deepEqual(core.calls.map(c=>c.route),['/auth/v1/health','/rest/v1/rpc/get_public_platform_content']);
 for(const route of ['/auth/v1/health','/rest/v1/rpc/get_public_platform_content']){
  const broken=readinessProbe(false,current=>current===route?503:200);
  await assert.rejects(broken.run(),route.includes('/auth/')?/STAGING_AUTH_NOT_READY/:/CURRENT_CANDIDATE_NOT_READY/);
 }
 const full=readinessProbe(true);await full.run();
 assert.deepEqual(full.calls.slice(2).map(c=>c.route),Object.values(aliases).map(alias=>`/functions/v1/${alias}`));
 assert.ok(full.calls.slice(2).every(c=>c.options.method==='OPTIONS'));
 const failedAlias=readinessProbe(true,route=>route.startsWith('/functions/')?503:200);
 await assert.rejects(failedAlias.run(),/ALIAS_NOT_READY/);
});
test('readiness metadata explicitly distinguishes core from full without fabricating body responses',()=>{
 const statement=find(n=>ts.isTryStatement(n)&&n.finallyBlock?.getText(tree).includes('web.httpServer.close'));
 const call=statement.tryBlock.statements.find(n=>n.getText(tree).startsWith('privateJson(')).expression;
 for(const aliasReady of [false,true]){
  const metadata=vm.runInNewContext(`(${call.arguments[1].getText(tree)})`,{
   ORIGIN,PROJECT,UPSTREAM,before:'synthetic-hash',anon:'synthetic-public',aliases,aliasReady,sha:()=>'',process:{pid:0},
  });
  assert.equal(metadata.aliasReadiness,aliasReady);
  assert.equal(metadata.mode,aliasReady?'full':'core-auth-rest-storage');
  assert.equal(metadata.upstream,UPSTREAM);
 }
 for(const aliasReady of [false,true]){
  const {config}=gateway(aliasReady),proxy=new EventEmitter();config.preview.proxy['/__api/'].configure(proxy);
  const response={headers:{'set-cookie':['synthetic']},body:'UNMODIFIED_SYNTHETIC_RESPONSE',statusCode:503};
  proxy.emit('proxyRes',response);
  assert.equal(response.body,'UNMODIFIED_SYNTHETIC_RESPONSE');assert.equal(response.statusCode,503);
  assert.equal(response.headers['set-cookie'],undefined);assert.equal(response.headers['cache-control'],'no-store');
 }
});
