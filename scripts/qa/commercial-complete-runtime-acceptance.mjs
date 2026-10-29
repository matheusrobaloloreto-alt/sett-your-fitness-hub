import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {Runtime,configureManagedAuthorization,verifyCaptureManifest,readCapture,freezeMigrations,assertFrozen,bootstrapAuth,privateFile,sha,capturePath} from './commercial-complete-runtime.mjs';
import {loadAuthTableACLs,restoreAuthTableACLs} from './commercial-complete-runtime-auth-acl.mjs';
import {restAcceptance} from './commercial-complete-runtime-rest.mjs';
import {loadStorageBoundary,bootstrapStorage} from './commercial-complete-runtime-storage.mjs';
import {seedSynthetic,seedPriorHistoryCycles,baselineBusiness,bindOriginals,postBusiness,startRest} from './commercial-complete-runtime-business.mjs';
import {verifyCatalog,verifyDefaultACLs} from './commercial-complete-runtime-catalog.mjs';
import {loadAuthCapture,loadPrivileges,loadSequences,loadRoleDefaults,defaultACLs,installSchema} from './commercial-complete-runtime-install.mjs';

export async function main({onReady}={}){
 const rt=new Runtime();const evidence={scope:'complete-target-local-acceptance-attempt',model:'inherited GPT-6 executor; requested 5.5 unavailable',stage:'preflight',startedAt:new Date().toISOString(),baselineAccepted:false,migrationsApplied:[],acceptance:[],noDeploy:true,sharedDB57422Untouched:true};
 let frozen=[];
 try{
  evidence.captureManifest=verifyCaptureManifest();
  const capture=readCapture(),auth=loadAuthCapture(),privileges=loadPrivileges(),sequences=loadSequences(),roles=loadRoleDefaults(),authTables=loadAuthTableACLs();frozen=freezeMigrations();
  evidence.captureHash=capture.hash;evidence.authCaptureHash=auth.hash;evidence.privilegeCaptureHash=privileges.hash;evidence.sequencesCaptureHash=sequences.hash;evidence.rolesCaptureHash=roles.hash;evidence.authTablesCaptureHash=authTables.hash;evidence.inputs=frozen.map(({name,hash})=>({name,hash}));
  evidence.runnerHashes=readdirSync(new URL('./',import.meta.url)).filter(name=>name.startsWith('commercial-complete-runtime')&&name.endsWith('.mjs')).sort().map(name=>({name,hash:sha(readFileSync(new URL(name,import.meta.url)))}));
  await rt.start();evidence.resource={container:rt.name,network:rt.network,image:rt.imageId,volumes:rt.volumes};
  evidence.egress=rt.egressProof();evidence.stage='actual-auth-bootstrap';const localAuth=await bootstrapAuth(rt);
  evidence.authImage=localAuth.svc.imageId;evidence.stage='baseline-install';
  evidence.install=installSchema(rt,capture.data,auth.data,privileges.data,sequences.data,roles.data);
  evidence.authTableACLs=restoreAuthTableACLs(rt,authTables.data,capture.data.roles);
  evidence.stage='baseline-catalog-verification';evidence.catalog=verifyCatalog(rt,capture.data,auth.data,privileges.data,sequences.data,roles.data);
  evidence.stage='baseline-seed';const synthetic=await seedSynthetic(rt,localAuth);
  evidence.businessDate=synthetic.businessDate;evidence.stage='baseline-business';evidence.baseline=baselineBusiness(rt,synthetic);bindOriginals(rt);seedPriorHistoryCycles(rt,synthetic);evidence.baselineAccepted=true;
  evidence.stage='baseline-accepted';
  evidence.stage='default-privileges';defaultACLs(rt,roles.data);evidence.defaultPrivileges=verifyDefaultACLs(rt,roles.data);
  evidence.stage='storage-bootstrap';const storage=loadStorageBoundary();evidence.storageCaptureHash=storage.hash;evidence.storage=await bootstrapStorage(rt,localAuth,storage.data);
  evidence.stage='explicit-migrations';
  for(const m of frozen){
   assertFrozen(frozen);const source=m.bytes.toString('utf8');const standalone=source.replace(/^\s*--[^\n]*$/mg,'').trim().startsWith('begin;');
   rt.sql(`set role postgres;${standalone?'':'begin;'}\n${source}\nreset role;update cron.job set active=false;${standalone?'':'commit;'}`,{phase:`migration:${m.name}`});
   evidence.migrationsApplied.push({name:m.name,hash:m.hash});console.log(`MIGRATION ${m.name}`);
  }
  evidence.activeCronJobs=Number(rt.value('select count(*) from cron.job where active'));if(evidence.activeCronJobs!==0)throw Error('Local cron jobs still active');
  evidence.stage='post-migration-business';evidence.postMigration=postBusiness(rt,synthetic);
  evidence.stage='actual-rest';const rest=await startRest(rt,localAuth);evidence.restImage=rest.imageId;
  evidence.rest=restAcceptance(rt,synthetic,rest);evidence.stage='accepted-with-runtime-boundaries';evidence.egressAfter=rt.egressProof();
  evidence.networkFunctions={trackFunctions:rt.value('show track_functions'),observedBusinessCalls:Number(rt.value("select coalesce(sum(calls),0) from pg_stat_user_functions where schemaname in ('public','commercial_private') and funcname in ('reassign_student_trainer','reschedule_training_cycles_from','get_company_dashboard_snapshot')")),observedNetCalls:Number(rt.value("select coalesce(sum(calls),0) from pg_stat_user_functions where schemaname='net'")),queuedNetRequests:Number(rt.value('select count(*) from net.http_request_queue'))};
  if(evidence.networkFunctions.trackFunctions!=='all'||evidence.networkFunctions.observedBusinessCalls===0||evidence.networkFunctions.observedNetCalls!==0||evidence.networkFunctions.queuedNetRequests!==0)throw Error('Network-function nonuse proof failed');


  // Baseline authorization/role/business tests MUST succeed before any migration.
  // Added below only once schema installation is proven, never mark accepted here.
  evidence.limit='App schema/business acceptance only; pg_net 0.20.4 differs from hosted 0.20.0; hosted Storage/Auth internals and real provider execution not cloned';
  // Optional local product acceptance/preview owns its lifetime inside this
  // try/finally. No hook means the existing one-shot acceptance is unchanged.
  if(onReady)evidence.product=await onReady({rt,synthetic,localAuth,rest,evidence});
 }catch(e){if(e.privateCatalog)privateFile(rt.dir,'catalog-difference.private.json',JSON.stringify(e.privateCatalog));evidence.failure={phase:evidence.stage,message:e.message,dependencies:e.dependencies,catalogDifference:e.catalogDifference};process.exitCode=1;}
 finally{
  try{if(evidence.captureManifest)verifyCaptureManifest(evidence.captureManifest.hash);if(frozen.length)assertFrozen(frozen);if(evidence.captureHash&&sha(readFileSync(capturePath))!==evidence.captureHash)throw Error('Capture changed during acceptance');for(const item of evidence.runnerHashes||[])if(sha(readFileSync(new URL(item.name,import.meta.url)))!==item.hash)throw Error(`Runner drift: ${item.name}`);evidence.sourcesUnchanged=true;}catch(e){evidence.sourceError=e.message;process.exitCode=1;}
  try{evidence.cleanup=rt.cleanup();}catch(e){evidence.cleanup={cleanup:false,error:e.message};process.exitCode=1;}
  evidence.accepted=evidence.stage==='accepted-with-runtime-boundaries'&&evidence.sourcesUnchanged===true&&evidence.cleanup?.cleanup===true&&!evidence.failure;
  evidence.finishedAt=new Date().toISOString();privateFile(rt.dir,'acceptance-result.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({accepted:evidence.accepted,stage:evidence.stage,baselineAccepted:evidence.baselineAccepted,failure:evidence.failure,cleanup:evidence.cleanup,evidence:`${rt.dir}/acceptance-result.json`}));
 }
 return evidence;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
