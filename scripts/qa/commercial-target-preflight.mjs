import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Offline analysis of catalog metadata captured by read-only connector SELECTs.
// No connection strings, business rows, schema writes or provider operations.
export function analyzeCommercialTarget(schema, transforms){
  const checks=[];
  const check=(name,ok)=>checks.push({name,ok:ok===true});
  check('canonical project confirmed',schema.project==='zshrcgbyhzxpnlccssyz');
  check('capture date declared',/^\d{4}-\d{2}-\d{2}$/.test(schema.capturedAt||''));
  const required={
    companies:{id:'uuid',tier:'text',owner_id:'uuid',name:'text',slug:'text'},
    company_members:{company_id:'uuid',user_id:'uuid'},
    platform_settings:{company_id:'uuid'},
    automation_flows:{id:'uuid',company_id:'uuid',trigger_type:'text',is_active:'bool'},
    automation_flow_nodes:{id:'uuid',flow_id:'uuid',type:'text',node_type:'text',data:'jsonb',position_x:'numeric',position_y:'numeric'},
    automation_flow_edges:{flow_id:'uuid',source_node_id:'text',target_node_id:'text',source_handle:'text',label:'text'},
    flow_sessions:{id:'uuid',flow_id:'uuid',chat_id:'uuid',context:'jsonb',status:'text'},
    whatsapp_chats:{id:'uuid',company_id:'uuid'},whatsapp_labels:{id:'uuid',company_id:'uuid'},
    whatsapp_chat_labels:{id:'uuid',chat_id:'uuid',label_id:'uuid'},
  };
  for(const [table,columns] of Object.entries(required))for(const [column,type] of Object.entries(columns)){
    check(`column ${table}.${column}:${type}`,schema.columns?.some(c=>c.table===table&&c.column===column&&c.type===type));
  }
  const scanner=transforms.transformations?.find(f=>f.name==='process_automation_triggers')?.definition||'';
  for(const anchor of ['weekly_contact_consent_is_current','weekly_contact_current_recipient_key','recipient_generation',
    "count(fs.id) filter(where fs.created_at>now()-interval '7 days')<2","now()-interval '72 hours'"]){
    check(`scanner transformation anchor ${anchor}`,scanner.includes(anchor));
  }
  const payment=transforms.transformations?.find(f=>f.name==='mark_payment_recovery_abandoned')?.definition||'';
  check('payment abandonment transformation anchor',payment.includes("now() - interval '2 hours'"));
  const dashboard=schema.functions?.find(f=>f.name==='get_company_dashboard_snapshot')?.definition||'';
  check('dashboard declaration transform anchor',dashboard.includes('_result jsonb;'));
  check('dashboard risk transform anchor',dashboard.includes('r.training_days >= 10')||dashboard.includes('r.training_days>=10'));
  check('dashboard renewal transform anchor',dashboard.includes('_today+7')||dashboard.includes('_today+30'));
  const normalize=value=>{
    if(typeof value!=='string')return undefined;
    // SQL keywords/unquoted identifiers ignore case; literals and quoted
    // identifiers do not. Never fold bucket names such as platform-assets.
    const tokens=value.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|[^'"]+/g)||[];
    if(tokens.join('')!==value)return undefined;
    return tokens.map(token=>/^["']/.test(token)?token:token.replace(/\s+/g,' ').toLowerCase()).join('').trim();
  };
  const contracts={
    get_company_dashboard_snapshot:['_company_id uuid','jsonb'],
    reassign_student_trainer:['_student_id uuid, _trainer_id uuid, _expected_trainer_id uuid','table(student_id uuid, previous_trainer_id uuid, trainer_id uuid, updated_enrollments integer)'],
    set_registration_lead_stage:['_company_id uuid, _entity_type text, _record_id uuid, _expected_stage text, _target_stage text','jsonb'],
    reschedule_training_cycles_from:['p_enrollment_id uuid, p_cycle_id uuid, p_new_start_date date','void'],
  };
  for(const [name,[args,result]] of Object.entries(contracts)){
    const f=schema.functions?.find(f=>f.name===name);
    const parsed=f?.definition?.match(new RegExp(`FUNCTION public\\.${name}\\(([\\s\\S]*?)\\)\\s*\\n\\s*RETURNS ([\\s\\S]*?)\\n\\s*LANGUAGE plpgsql`,'i'));
    check(`optional target function ${name}`,!!parsed&&normalize(parsed[1])===normalize(args)&&normalize(parsed[2])===normalize(result));
  }
  const staffPolicies={
    flow_sessions:'(EXISTS ( SELECT 1 FROM automation_flows f WHERE ((f.id = flow_sessions.flow_id) AND is_company_staff(auth.uid(), f.company_id))))',
    whatsapp_chat_labels:'(EXISTS ( SELECT 1 FROM whatsapp_chats c WHERE ((c.id = whatsapp_chat_labels.chat_id) AND is_company_staff(auth.uid(), c.company_id))))',
  };
  const authOnly=p=>p.roles?.length===1&&p.roles[0]==='authenticated';
  for(const [table,predicate] of Object.entries(staffPolicies)){
    check(`historical staff policy ${table}`,schema.policies?.some(p=>p.schema==='public'&&p.table===table&&p.permissive==='PERMISSIVE'&&p.command==='ALL'&&authOnly(p)&&normalize(p.using)===normalize(predicate)&&normalize(p.check)===normalize(predicate)));
  }
  const storagePredicate="((bucket_id = 'platform-assets'::text) AND is_company_staff(auth.uid(), try_uuid((storage.foldername(name))[1])))";
  for(const command of ['INSERT','UPDATE']){
    check(`existing tenant Storage ${command}`,schema.policies?.some(p=>p.schema==='storage'&&p.table==='objects'&&p.command===command&&p.permissive==='PERMISSIVE'&&authOnly(p)&&normalize(p.check)===normalize(storagePredicate)&&(command!=='UPDATE'||normalize(p.using)===normalize(storagePredicate))));
  }
  const pendingVersions=(transforms.migration_versions||[]).filter(v=>v.startsWith('20261026')||v.startsWith('20261027'));
  return {project:schema.project,capturedAt:schema.capturedAt,prerequisitesCompatible:checks.every(c=>c.ok),
    checks,failed:checks.filter(c=>!c.ok).map(c=>c.name),observedInstalledContinuationVersions:pendingVersions,
    scope:'selected metadata prerequisites only; not a schema replay, actor test, migration application or release certification'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=fileURLToPath(new URL('../../output/self-service-local-20261026/',import.meta.url));
  const inputs=['commercial-target-metadata.private.json','commercial-transform-metadata.private.json'].map(name=>{
    const content=readFileSync(path.join(directory,name),'utf8');
    return {value:JSON.parse(content),sha256:createHash('sha256').update(content).digest('hex')};
  });
  const result=analyzeCommercialTarget(inputs[0].value,inputs[1].value);
  console.log(JSON.stringify({...result,inputHashes:inputs.map(i=>i.sha256)},null,2));
  if(!result.prerequisitesCompatible)process.exitCode=1;
}
