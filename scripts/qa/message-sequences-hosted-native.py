"""Native staging acceptance. Uses only prior manifest-owned fictional company/users.
No Edge/provider calls, no production URLs, no scheduler changes. Leaves private fixture receipts.
Run only AFTER the reviewed additive migration is installed in the existing staging project.
"""
from pathlib import Path
import runpy,json,copy,uuid,urllib.request,urllib.error,base64,hashlib,concurrent.futures,threading,os,atexit
ROOT=Path(__file__).resolve().parents[2]
B=ROOT/'output/hosted-staging-preflight-20261028'
OUT=ROOT/'output/message-sequences-20261029.private';OUT.mkdir(mode=0o700,exist_ok=True)
RUN=str(uuid.uuid4())
(OUT/'native-acceptance.private.json').write_text(json.dumps({'runId':RUN,'all_passed':False,'status':'running'}));(OUT/'native-acceptance.private.json').chmod(0o600)
def fail_unfinished():
 p=OUT/'native-acceptance.private.json';d=json.loads(p.read_text())
 if d.get('runId')==RUN and d.get('status')=='running':d['status']='failed';d['all_passed']=False;p.write_text(json.dumps(d,indent=2))
atexit.register(fail_unfinished)
for asset in ['qa-audio.mp3','qa-video.mp4','qa-image.png']:assert (OUT/asset).is_file() and (OUT/asset).stat().st_size>0
HASHES={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'supabase/functions/_shared/message-sequence.ts',ROOT/'supabase/migrations/20261029122806_company_whatsapp_message_sequences.sql']}
mod=runpy.run_path(str(B/'hosted-fixture.private.py'));assert mod['REF']=='ifymocggowdlqqcxugko'
state=json.loads((B/'fixture-identities.private.json').read_text());assert state['projectRef']==mod['REF'] and state['run']=='20261028-c9ede238'
api=mod['API']();company=state['companyA'];tokens={k:api.login(v)['access_token'] for k,v in state['people'].items()};results=[];written=None;manifest={'runId':RUN,'candidateHashes':HASHES,'projectRef':mod['REF'],'ownedCompany':company,'files':[],'sequences':[],'no_provider_calls':True}
def save(name,data):
 p=OUT/name;p.write_text(json.dumps(data,indent=2));p.chmod(0o600)
def check(name,ok,status=None):
 results.append({'gate':name,'passed':bool(ok),'status':status});save('native-acceptance.private.json',{'runId':RUN,'candidateHashes':HASHES,'status':'running','results':results,'all_passed':False,'projectRef':mod['REF'],'providerCalls':0})
 if not ok:raise AssertionError('Native acceptance failed: '+name)
def rpc(name,body,who='admin',admin=False):return api.rpc(name,body,token=None if admin else tokens[who],admin=admin)
def current():
 s,d=api.call('/rest/v1/company_product_settings?company_id=eq.'+company+'&select=settings,version',token=tokens['admin']);check('read_owned_settings',s==200 and len(d)==1,s);return d[0]
def storage(who,path,body=None,method='POST',mime='application/json'):
 req=urllib.request.Request(mod['URL']+'/storage/v1/'+path,data=body,headers={'apikey':api.k['anon'],'Authorization':'Bearer '+(api.k['service_role'] if who=='service' else tokens[who]),'Content-Type':mime,'x-upsert':'false'},method=method)
 try:
  with urllib.request.build_opener(mod['NoRedirect']()).open(req,timeout=30) as r:status=r.status;raw=r.read()
 except urllib.error.HTTPError as e:status=e.code;raw=e.read()
 try:d=json.loads(raw)
 except Exception:d=None
 return status,d,raw
original=current();save('settings-baseline.private.json',original)
# Minimal valid PNG, not student media. Bytes are deterministic and harmless.
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
path=company+'/message-settings/'+str(uuid.uuid4())+'.png'
try:
 for who in ['foreign','student','trainer']:
  s,d,_=storage(who,'object/whatsapp-media/'+path,png,mime='image/png');check('deny_'+who+'_upload',s in [400,403] and any(v in json.dumps(d).lower() for v in ['row-level','unauthorized','permission']),s)
 s,_,_=storage('admin','object/whatsapp-media/'+path,png,mime='image/png');check('native_image_upload',s==200,s);manifest['files'].append(path);save('fixture-manifest.private.json',manifest)
 s,d,_=storage('admin','object/sign/whatsapp-media/'+path,json.dumps({'expiresIn':60}).encode());check('owner_sign_private_media',s==200 and isinstance(d.get('signedURL'),str),s)
 with urllib.request.urlopen(mod['URL']+'/storage/v1'+d['signedURL'],timeout=20) as response:read=response.read()
 check('signed_media_exact_bytes',hashlib.sha256(read).digest()==hashlib.sha256(png).digest())
 for who in ['foreign','student']:
  s,d,_=storage(who,'object/sign/whatsapp-media/'+path,b'{"expiresIn":60}');check('deny_'+who+'_sign',s in [400,403,404] and any(v in json.dumps(d).lower() for v in ['not found','row-level','unauthorized','permission']),s)
 s,_,_=storage('admin','object/whatsapp-media/'+path,png,method='PUT',mime='image/png');check('immutable_media',s in [400,401,403,404],s)
 parts=[{'id':'first','type':'text','text':'Oi, {{primeiro_nome}}!'}, {'id':'second','type':'image','text':'','media':{'bucket':'whatsapp-media','path':path,'mimeType':'image/png','fileName':'fixture.png'}}]
 for kind,filename,mime,extension in [('audio','qa-audio.mp3','audio/mpeg','mp3'),('video','qa-video.mp4','video/mp4','mp4')]:
  media_path=company+'/message-settings/'+str(uuid.uuid4())+'.'+extension
  content=(OUT/filename).read_bytes()
  status,_,_=storage('admin','object/whatsapp-media/'+media_path,content,mime=mime);check('native_'+kind+'_upload',status==200,status)
  manifest['files'].append(media_path);save('fixture-manifest.private.json',manifest)
  status,signed,_=storage('admin','object/sign/whatsapp-media/'+media_path,b'{"expiresIn":60}');check('native_'+kind+'_sign',status==200,status)
  with urllib.request.urlopen(mod['URL']+'/storage/v1'+signed['signedURL'],timeout=20) as response:downloaded=response.read()
  check('native_'+kind+'_exact_bytes',hashlib.sha256(downloaded).digest()==hashlib.sha256(content).digest())
  parts.append({'id':kind,'type':kind,'text':'','media':{'bucket':'whatsapp-media','path':media_path,'mimeType':mime,'fileName':filename}})
 draft=copy.deepcopy(original['settings']);draft.setdefault('message_sequences',{})['pre_registration_confirmation']=parts
 s,d=rpc('save_company_product_settings',{'_company_id':company,'_settings':draft,'_expected_version':original['version']});check('native_save_sequence',s==200 and d['version']==original['version']+1,s);written={'settings':copy.deepcopy(d['settings']),'version':d['version']}
 saved=current();check('save_readback_exact_sequence',saved['settings']['message_sequences']['pre_registration_confirmation']==parts)
 check('legacy_text_preserved',saved['settings']['messages']==original['settings']['messages'])
 s,d=rpc('save_company_product_settings',{'_company_id':company,'_settings':draft,'_expected_version':original['version']});check('stale_CAS_denied',s==409,s)
 s,d=rpc('save_company_product_settings',{'_company_id':company,'_settings':draft,'_expected_version':saved['version']},who='foreign');check('foreign_settings_write_denied',s==403,s)
 foreign_path=state['companyB']+'/message-settings/'+str(uuid.uuid4())+'.png'
 s,_,_=storage('service','object/whatsapp-media/'+foreign_path,png,mime='image/png');check('owned_foreign_valid_media_fixture',s==200,s);manifest['files'].append(foreign_path);save('fixture-manifest.private.json',manifest)
 s,_,_=storage('foreign','object/sign/whatsapp-media/'+foreign_path,b'{"expiresIn":60}');check('foreign_fixture_owner_can_sign',s==200,s)
 invalid=[]
 x=copy.deepcopy(draft);x['message_sequences']['pre_registration_confirmation']=[];invalid.append(('empty_sequence',x))
 x=copy.deepcopy(draft);x['message_sequences']['pre_registration_confirmation'][1]['id']='first';invalid.append(('duplicate_id',x))
 x=copy.deepcopy(draft);x['message_sequences']['pre_registration_confirmation'][1]['media']['path']=foreign_path;invalid.append(('foreign_media_reference',x))
 x=copy.deepcopy(draft);x['message_sequences']['pre_registration_confirmation'][0]['text']='{{missing}}';invalid.append(('unsupported_variable',x))
 x=copy.deepcopy(draft);x['message_sequences']['daily_reminder_title']=parts;invalid.append(('push_sequence',x))
 for name,x in invalid:
  s,d=rpc('save_company_product_settings',{'_company_id':company,'_settings':x,'_expected_version':saved['version']});check('reject_'+name,s==400 and d.get('code')=='22023',s)
 check('rejected_saves_unchanged',current()==saved)
 # Native concurrent CAS, two independent GoTrue sessions, single winner.
 second=api.login(state['people']['admin'])['access_token'];barrier=threading.Barrier(2)
 def attempt(i):
  x=copy.deepcopy(draft);x['message_sequences']['pre_registration_confirmation'][0]['text']='Concurrent '+str(i)
  barrier.wait(10);return api.rpc('save_company_product_settings',{'_company_id':company,'_settings':x,'_expected_version':saved['version']},token=tokens['admin'] if i==0 else second)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(attempt,[0,1]));statuses=[v[0] for v in outcomes]
 check('native_concurrent_CAS',sorted(statuses)==[200,409]);winner=outcomes[statuses.index(200)][1];written={'settings':copy.deepcopy(winner['settings']),'version':winner['version']}
 # Service-only durable journal. Fake receipt below tests database transitions, never claims provider delivery.
 chat=str(uuid.uuid4());s,d=api.call('/rest/v1/whatsapp_chats',{'id':chat,'company_id':company,'remote_jid':'14155550199@s.whatsapp.net','contact_name':'Synthetic sequence QA'},admin=True);check('owned_journal_chat_fixture',s==201,s);manifest['chatId']=chat;save('fixture-manifest.private.json',manifest)
 occurrence=hashlib.sha256(uuid.uuid4().bytes).hexdigest();snap={'parts':[{'id':'a','type':'text','text':'First'},{'id':'b','type':'text','text':'Second'}],'recipient':'14155550199@s.whatsapp.net','instanceName':'synthetic-never-sent'}
 args={'_company_id':company,'_chat_id':chat,'_occurrence':occurrence,'_snapshot':snap,'_scope':None}
 s,d=rpc('snapshot_company_message_sequence',args,admin=True);check('native_snapshot_create',s==200 and d['snapshot']==snap,s);sid=d['id'];manifest['sequences'].append(sid);save('fixture-manifest.private.json',manifest)
 s,d=rpc('snapshot_company_message_sequence',args);check('journal_authenticated_denied',s in [401,403] and d.get('code')=='42501',s)
 s,d=rpc('claim_company_message_part',{'_sequence_id':sid,'_index':1,'_scope':None},admin=True);check('journal_order_enforced',s==400 and d.get('message')=='dispatch_uncertain',s)
 s,d=rpc('claim_company_message_part',{'_sequence_id':sid,'_index':0,'_scope':None},admin=True);check('native_claim_first',s==200 and d.get('state')=='in_flight',s);token=d['token']
 s,d=rpc('claim_company_message_part',{'_sequence_id':sid,'_index':0,'_scope':None},admin=True);check('ambiguous_inflight_not_reclaimed',s==400 and d.get('message')=='dispatch_uncertain',s)
 s,d=rpc('ack_company_message_part',{'_sequence_id':sid,'_index':0,'_token':token,'_receipt':'SYNTHETIC-DB-TRANSITION-NO-PROVIDER'},admin=True);check('native_database_ack_transition',s in [200,204],s)
 s,d=rpc('snapshot_company_message_sequence',{**args,'_snapshot':{'parts':[{'id':'new','type':'text','text':'Changed'}]}},admin=True);check('snapshot_immutable_after_edit',s==200 and d['snapshot']==snap and d['states']==['acked','pending'],s)
 s,d=rpc('claim_company_message_part',{'_sequence_id':sid,'_index':0,'_scope':None},admin=True);check('acked_part_returns_without_reclaim',s==200 and d=={'state':'acked'},s)
 s,d=rpc('claim_company_message_part',{'_sequence_id':sid,'_index':1,'_scope':None},admin=True);check('next_part_after_ack',s==200 and d.get('state')=='in_flight',s)
finally:
 if written is not None:
  latest=current();check('restore_does_not_adopt_foreign_version',latest==written)
  s,d=rpc('save_company_product_settings',{'_company_id':company,'_settings':original['settings'],'_expected_version':written['version']});check('restore_owned_settings',s==200,s)
  check('restore_readback',current()['settings']==original['settings'])
# Success is a terminal receipt, never inherited from a previous execution.
save('native-acceptance.private.json',{'runId':RUN,'candidateHashes':HASHES,'projectRef':mod['REF'],'status':'passed','results':results,'all_passed':all(r['passed'] for r in results),'providerCalls':0})
print(json.dumps({'staging':mod['REF'],'passed':len(results),'all_passed':all(x['passed'] for x in results),'providerCalls':0,'productionWrites':0}))
