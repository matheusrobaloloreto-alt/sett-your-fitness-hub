import {describe,expect,it,vi} from 'vitest';
import {defaultFormDefinition,projectFormAnswers} from '../../supabase/functions/_shared/form-definitions';
import {prepareVersionedPreRegistration,type FormReadClient} from '../../supabase/functions/_shared/published-forms';
const company='10000000-0000-4000-8000-000000000001';
const oldId='20000000-0000-4000-8000-000000000001';
const newId='20000000-0000-4000-8000-000000000002';
function fixture() {
  const definition=defaultFormDefinition('pre_registration');
  const raw:Record<string,unknown>={full_name:'Aluno Sintetico',whatsapp:'48999990000',budget_range:'300_400',requested_services:['strength'],modalities:['Nenhum'],gender:'M'};
  for(const field of definition.fields){if(raw[field.key]!==undefined||!field.required)continue;raw[field.key]=field.type==='boolean'?false:field.type==='number'?(field.min??0):field.type==='select'?(field.options.some(o=>o.value==='nao')?'nao':field.options[0].value):'Sintetico';}
  const {full_name,whatsapp,...answers}=projectFormAnswers(definition,raw);
  const body={action:'pre-register',companyId:company,slug:'synthetic',fullName:full_name,whatsapp,whatsappConfirmed:true,budgetRange:raw.budget_range,preferredContactPeriod:raw.preferred_contact_period,answers,form_definition_id:oldId,versioned_answers:raw};
  const rows=[{id:oldId,version:1,company_id:company,kind:'pre_registration',definition},{id:newId,version:2,company_id:company,kind:'pre_registration',definition}];
  const from=vi.fn((table:string)=>{
    if(table!=='company_form_definitions')throw new Error('Unexpected non-definition access');
    let id:string|undefined;
    const query={select:()=>query,eq:(column:string,value:string)=>{if(column==='id')id=value;return query;},order:()=>query,limit:()=>query,maybeSingle:async()=>({data:id?rows.find(row=>row.id===id)??null:rows.at(-1)??null,error:null})};
    return query;
  });
  return {body,rows,from,client:{from} as unknown as FormReadClient};
}
describe('versioned public pre-registration boundary',()=>{
  it('requires a version after first publication but accepts previously published versions',async()=>{
    const f=fixture();
    const {form_definition_id:_id,versioned_answers:_raw,...legacy}=f.body;
    await expect(prepareVersionedPreRegistration(f.client,company,legacy)).rejects.toMatchObject({status:409});
    expect((await prepareVersionedPreRegistration(f.client,company,f.body))?.snapshot.definition_id).toBe(oldId);
    f.rows.length=0;
    expect(await prepareVersionedPreRegistration(f.client,company,legacy)).toBeNull();
  });
  it('rejects unknown envelope keys before accessing persistence or definitions',async()=>{
    const f=fixture();
    await expect(prepareVersionedPreRegistration(f.client,company,{...f.body,skip_validation:true})).rejects.toMatchObject({status:422});
    expect(f.from).not.toHaveBeenCalled();
  });
  it('bounds the original UTF-8 request rather than only the projected answers',async()=>{
    const f=fixture();
    await expect(prepareVersionedPreRegistration(f.client,company,{...f.body,fullName:'界'.repeat(24000)})).rejects.toMatchObject({status:422});
    expect(f.from).not.toHaveBeenCalled();
  });
  it('rejects mismatched company and conflicting confirmed identity',async()=>{
    const f=fixture();
    await expect(prepareVersionedPreRegistration(f.client,company,{...f.body,companyId:'another-company'})).rejects.toMatchObject({status:422});
    await expect(prepareVersionedPreRegistration(f.client,company,{...f.body,whatsapp:'48988880000'})).rejects.toMatchObject({status:422});
    f.rows[0].company_id='another-company';
    await expect(prepareVersionedPreRegistration(f.client,company,f.body)).rejects.toMatchObject({status:409});
  });
  it('rejects nested raw answers even on optional fields and missing-ID versioned payloads',async()=>{
    const f=fixture();
    await expect(prepareVersionedPreRegistration(f.client,company,{...f.body,versioned_answers:{...f.body.versioned_answers,extra_comments:{deep:{payload:true}}}})).rejects.toMatchObject({status:422});
    f.rows.length=0;
    await expect(prepareVersionedPreRegistration(f.client,company,{...f.body,form_definition_id:''})).rejects.toMatchObject({status:422});
  });
  it('keeps old published definitions usable when the new version adds a required extra',async()=>{
    const f=fixture();
    f.rows[1].definition=structuredClone(f.rows[0].definition);
    f.rows[1].definition.fields.push({key:'extra_context',type:'text',label:'Contexto',required:true,hidden:false,help:'',options:[]});
    expect((await prepareVersionedPreRegistration(f.client,company,f.body))?.snapshot.definition_id).toBe(oldId);
    await expect(prepareVersionedPreRegistration(f.client,company,{...f.body,form_definition_id:newId})).rejects.toMatchObject({status:422});
  });
});
