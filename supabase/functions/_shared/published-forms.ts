import { defaultFormDefinition, normalizeFormDefinition, projectFormAnswers, validateFormAnswers, type FormKind, type PublishedForm } from './form-definitions.ts';
import { HttpError, isUuid } from './tenant-auth.ts';

type Result = {data: unknown; error: {code?:string;message?:string}|null};
export interface FormReadClient {from(table:string):{select(columns:string):{eq(column:string,value:string):{eq(column:string,value:string):{order(column:string,options:{ascending:boolean}):{limit(count:number):{maybeSingle():PromiseLike<Result>}}};maybeSingle():PromiseLike<Result>}}}}
export async function loadPublishedForm(client:FormReadClient,companyId:string,kind:FormKind,id?:string|null):Promise<PublishedForm|null> {
  const query=client.from('company_form_definitions').select('id,company_id,kind,version,definition');
  const result=id ? await query.eq('id',id).maybeSingle() : await query.eq('company_id',companyId).eq('kind',kind).order('version',{ascending:false}).limit(1).maybeSingle();
  if(result.error) {
    if(!id && ['42P01','PGRST205'].includes(result.error.code??'')) return null;
    throw new HttpError(503,'Definicao do formulario indisponivel.');
  }
  if(!result.data){if(id)throw new HttpError(409,'Versao do formulario indisponivel.');return null;}
  const row=result.data as PublishedForm & {company_id:string;kind:string};
  if(row.company_id!==companyId || row.kind!==kind || row.definition.kind!==kind) throw new HttpError(409,'Versao do formulario invalida.');
  return {id:row.id,version:row.version,definition:normalizeFormDefinition(row.definition)};
}
export function assertPublishedAnswers(form:PublishedForm,definitionId:unknown,answers:unknown):asserts answers is Record<string,unknown> {
  let serialized='';try{serialized=JSON.stringify(answers);}catch{throw new HttpError(422,'Respostas invalidas.');}
  if(definitionId!==form.id || !answers || typeof answers!=='object' || Array.isArray(answers) || new TextEncoder().encode(serialized).length>64000) throw new HttpError(422,'Versao ou respostas invalidas. Reabra o link.');
  const record=answers as Record<string,unknown>;
  if(Object.values(record).some(value=>value!==null && value!==undefined && !(typeof value==='string' && value.length<=2000) && !(typeof value==='number' && Number.isFinite(value)) && typeof value!=='boolean' && !(Array.isArray(value)&&value.length<=50&&value.every(v=>typeof v==='string'&&v.length<=200))))throw new HttpError(422,'Estrutura de respostas invalida.');
  const keys=new Set(form.definition.fields.map(f=>f.key));
  if(Object.keys(record).some(key=>!keys.has(key))) throw new HttpError(422,'Perguntas desconhecidas.');
  const invalid=validateFormAnswers(form.definition,record);
  if(invalid.length) throw new HttpError(422,`Revise: ${invalid.join(', ')}.`);
}

export function publishedCustomFields(form:PublishedForm) {
  const core=new Set(defaultFormDefinition(form.definition.kind).fields.map(field=>field.key));
  return form.definition.fields.filter(f=>!core.has(f.key)&&!f.hidden).map(f=>({id:f.key,label:f.label,is_required:f.required,field_type:f.type==='multiselect'?'checkbox':f.type,options:f.options.map(o=>o.value)}));
}

const PRE_REGISTRATION_ENVELOPE_KEYS=new Set(['action','companyId','slug','fullName','whatsapp','budgetRange','preferredContactPeriod','whatsappConfirmed','answers','form_definition_id','versioned_answers']);
function assertPreRegistrationSource(body:Record<string,unknown>,companyId:string) {
  let serialized='';try{serialized=JSON.stringify(body);}catch{throw new HttpError(422,'Pre-cadastro invalido.');}
  if(new TextEncoder().encode(serialized).length>64*1024 || Object.keys(body).some(key=>!PRE_REGISTRATION_ENVELOPE_KEYS.has(key)))throw new HttpError(422,'Envelope de pre-cadastro invalido ou excede os limites.');
  const pending:[unknown,number][]=[[body,0]];
  while(pending.length){const [value,depth]=pending.pop()!;if(depth>6)throw new HttpError(422,'Pre-cadastro excede os limites.');if(value&&typeof value==='object')for(const child of Object.values(value))pending.push([child,depth+1]);}
  if(body.companyId!==undefined && body.companyId!==null && body.companyId!==companyId)throw new HttpError(422,'Empresa inconsistente.');
}

export async function prepareVersionedPreRegistration(client:FormReadClient,companyId:string,body:Record<string,unknown>) {
  assertPreRegistrationSource(body,companyId);
  if(!Object.hasOwn(body,'form_definition_id')) {
    if(Object.hasOwn(body,'versioned_answers'))throw new HttpError(422,'Versao obrigatoria.');
    const latest=await loadPublishedForm(client,companyId,'pre_registration');
    if(latest)throw new HttpError(409,'O formulario foi atualizado. Reabra o link para preencher a versao publicada.');
    return null;
  }
  if(!isUuid(body.form_definition_id))throw new HttpError(422,'Versao invalida.');
  const form=await loadPublishedForm(client,companyId,'pre_registration',body.form_definition_id);
  if(!form)throw new HttpError(422,'Versao indisponivel.');
  assertPublishedAnswers(form,body.form_definition_id,body.versioned_answers);
  const projected=projectFormAnswers(form.definition,body.versioned_answers);
  const {full_name,whatsapp,...answers}=projected;
  for(const [key,value] of Object.entries({fullName:full_name,whatsapp,budgetRange:projected.budget_range,preferredContactPeriod:projected.preferred_contact_period})) {
    if(Object.hasOwn(body,key)&&body[key]!==value)throw new HttpError(422,'Identidade ou preferencias inconsistentes com as respostas.');
  }
  if(body.answers!==undefined){
    const stable=(value:unknown):string=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>`${JSON.stringify(key)}:${stable(v)}`).join(',')}}`:JSON.stringify(value);
    if(stable(body.answers)!==stable(answers))throw new HttpError(422,'Respostas duplicadas inconsistentes.');
  }
  return {
    legacyBody:{action:body.action,companyId,slug:body.slug??null,fullName:full_name,whatsapp,whatsappConfirmed:body.whatsappConfirmed,budgetRange:projected.budget_range,preferredContactPeriod:projected.preferred_contact_period,answers},
    customFields:publishedCustomFields(form),
    snapshot:{definition_id:form.id,submission_id:crypto.randomUUID(),answers:body.versioned_answers},
  };
}
