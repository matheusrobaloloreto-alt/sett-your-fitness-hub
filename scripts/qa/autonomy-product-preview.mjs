import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createServer as createViteServer} from 'vite';
import {main} from './commercial-complete-runtime-acceptance.mjs';
import {privateFile,lit,sha,repo} from './commercial-complete-runtime.mjs';
import {actor,signLocal} from './commercial-complete-runtime-business.mjs';
import {assertCompanyStudioDenied,assertStudioSurfaceScope} from './studio-master-scope-contract.mjs';

assertStudioSurfaceScope(readFileSync(`${repo}/src/App.tsx`,'utf8'),readFileSync(`${repo}/src/components/AppSidebar.tsx`,'utf8'));

// Separate synthetic backend. No shared QA database, published container ports,
// real provider transport, SQL HTTP endpoint or production credentials.
const migrations=[
 '20261028090117_company_prescription_methodology.sql',
 '20261028103721_company_governance.sql',
 '20261028113017_company_operations.sql',
 '20261028114539_company_agenda_availability.sql',
 '20261028123147_governed_platform_company_content.sql',
 '20261028130000_communications_reconciliation.sql',
 '20261028143000_operations_transition_pair_validation.sql',
 '20261028143001_atomic_lead_conversion.sql',
 '20261028143002_company_content_images.sql',
 '20261029003627_disable_company_studio_pending_master_integration.sql',
];
const apiOrigin='http://127.0.0.1:57621',uiOrigin='http://127.0.0.1:57631';
await main({onReady:async({rt,synthetic:s,localAuth,rest})=>{
 const applied=[];
 for(const name of migrations){
  const bytes=readFileSync(`${repo}/supabase/migrations/${name}`);
  rt.sql(`begin;set local role postgres;\n${bytes}\ncommit;`,{phase:`product-migration:${name}`});
  applied.push({name,sha256:sha(bytes)});
 }
 privateFile(rt.dir,'product-migrations-applied.json',JSON.stringify({applied,syntheticOnly:true}));
 // Exercise actual adoption before exposing this entirely fictional company.
 rt.sql(`update public.platform_product_settings set version=version+1,settings=jsonb_set(settings,'{tiers,basic,features}',(select jsonb_object_agg(k,true) from unnest(commercial_private.feature_keys()) k));`);
 const versions=JSON.parse(rt.value(`select jsonb_build_object('policy',(select version from public.company_feature_policies where company_id=${lit(s.ids.company)}),'catalog',(select version from public.platform_product_settings))`));
 actor(rt,s.users.master,`select public.set_company_feature_policy(${lit(s.ids.company)},'catalog',${versions.policy},${versions.catalog},true)`,{commit:true});
 rt.sql(`update public.companies set owner_id=${lit(s.users.admin)} where id=${lit(s.ids.company)};`);
 rt.sql(`delete from public.user_roles where user_id=${lit(s.users.coordinator)};insert into public.user_roles(user_id,role) values(${lit(s.users.coordinator)},'admin');`);
 rt.sql("notify pgrst, 'reload schema';");
 const expected=['get_company_governance','change_company_governance','get_company_operations','save_company_operations','save_platform_content','get_company_agenda_availability','inspect_company_dispatch_reconciliation'];
 let schemaReady=false;
 for(let n=0;n<20;n++){
  const description=rt.http(`http://${rest.name}:3000/`,{headers:{Authorization:`Bearer ${s.tokens.admin}`}});
  if(description.status===200&&expected.every(name=>description.body?.paths?.[`/rpc/${name}`])){schemaReady=true;break;}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!schemaReady)throw Error('New product RPCs are absent from local REST schema; preview withheld');
 for(const name of ['get_company_governance','get_company_operations','get_company_agenda_availability','inspect_company_dispatch_reconciliation']){
  const check=rt.http(`http://${rest.name}:3000/rpc/${name}`,{method:'POST',headers:{Authorization:`Bearer ${s.tokens.admin}`,'Content-Type':'application/json'},body:{_company_id:s.ids.company}});
  if(check.status!==200)throw Error(`Local readiness RPC ${name}: HTTP ${check.status}`);
 }
 // Revoked company RPCs may be hidden from OpenAPI; never require admin success.
 for(const who of ['admin','master'])for(const [name,body] of [
  ['get_company_content',{_company_id:s.ids.company}],
  ['save_company_content',{_company_id:s.ids.company,_document:{},_expected_version:0}],
 ]){
  const check=rt.http(`http://${rest.name}:3000/rpc/${name}`,{method:'POST',headers:{Authorization:`Bearer ${s.tokens[who]}`,'Content-Type':'application/json'},body});
  assertCompanyStudioDenied(check,`${who}/${name}`);
 }
 const password=randomBytes(15).toString('base64url')+'aA1!',service=signLocal(localAuth.jwtSecret,'service_role');
 const accounts={};
 for(const who of ['admin','coordinator','master','foreign','assigned','student']){
  const email=`${who}-${rt.token}@example.invalid`;
  const changed=rt.http(`http://${localAuth.svc.name}:9999/admin/users/${s.users[who]}`,{method:'PUT',headers:{Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:{password}});
  if(changed.status!==200)throw Error(`Synthetic ${who} account setup failed: HTTP ${changed.status}`);
  accounts[who]={email,password};
 }
 const anon=signLocal(localAuth.jwtSecret,'anon');
 const failures=[];
 const routes=[['/auth/v1',localAuth.svc.name,9999],['/rest/v1',rest.name,3000]];
 const api=createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&![uiOrigin,apiOrigin].includes(origin)){res.writeHead(403);res.end();return;}
  res.setHeader('Access-Control-Allow-Origin',origin||uiOrigin);
  res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,prefer,accept,accept-profile,content-profile,range,range-unit,x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods','GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  try{
   const parsed=new URL(req.url||'/',apiOrigin),match=routes.find(([prefix])=>parsed.pathname===prefix||parsed.pathname.startsWith(prefix+'/'));
   if(!match){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"Not available in this local preview"}');return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1048576)throw Error('Request limit');}
   const body=raw?JSON.parse(raw):null,headers={};
   for(const key of ['authorization','apikey','content-type','accept','prefer','range','range-unit','accept-profile','content-profile','x-supabase-api-version'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key];
   const [prefix,name,port]=match;
   const result=rt.http(`http://${name}:${port}${parsed.pathname.slice(prefix.length)||'/'}${parsed.search}`,{method:req.method,headers,body});
   res.writeHead(result.status||502,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(result.body==null?'':JSON.stringify(result.body));
  }catch{failures.push({at:new Date().toISOString(),kind:'local-request-failed'});res.writeHead(502,{'Content-Type':'application/json'});res.end('{"error":"Local preview request failed"}');}
 });
 let vite;
 try{
  await new Promise((resolve,reject)=>{api.once('error',reject);api.listen(57621,'127.0.0.1',resolve);});
  process.env.VITE_SUPABASE_URL=apiOrigin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=anon;process.env.VITE_SUPABASE_PROJECT_ID='sett-autonomy-preview';
  vite=await createViteServer({root:repo,envDir:rt.dir,mode:'qa',cacheDir:`${rt.dir}/vite-cache`,
   server:{host:'127.0.0.1',port:57631,strictPort:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/output/**']},watch:{ignored:['**/output/**']}}});
  await vite.listen();
  privateFile(rt.dir,'preview-access.private.json',JSON.stringify({url:uiOrigin,api:apiOrigin,accounts,companyId:s.ids.company,syntheticOnly:true}));
  privateFile(rt.dir,'preview-state.private.json',JSON.stringify({pid:process.pid,token:rt.token,name:rt.name,imageId:rt.imageId,network:rt.network,dir:rt.dir,applied,api:apiOrigin,ui:uiOrigin,synthetic:s,rest,authService:localAuth.svc}));
  privateFile(rt.dir,'preview-ready.json',JSON.stringify({ready:true,ui:uiOrigin,backend:apiOrigin,syntheticOnly:true,migrations:applied,resourcesIntentionallyKeptForUser:true}));
  console.log(JSON.stringify({previewReady:true,url:uiOrigin,privateAccessFile:`${rt.dir}/preview-access.private.json`,noDeploy:true}));
  await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
  return {applied,requestFailures:failures.length,previewClosed:true};
 }finally{
  if(vite)await vite.close();
  await new Promise(resolve=>api.close(resolve));
 }
}});
