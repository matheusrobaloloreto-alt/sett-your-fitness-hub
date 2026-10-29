import {describe,expect,it} from 'vitest';
import {defaultFormDefinition,normalizeFormDefinition,projectFormAnswers} from '../../supabase/functions/_shared/form-definitions';
import {normalizeWorkoutFeedbackPayload,buildWorkoutFeedbackRecord} from '../../supabase/functions/_shared/student-workout-feedback';
import {preparePublishedWorkoutFeedback} from '../../supabase/functions/_shared/workout-feedback-form';
import type {FormReadClient} from '../../supabase/functions/_shared/published-forms';
describe('published post-workout instrument',()=>{
  it('allows personalized labels while preserving historic perception values and clinical difficulty mapping',()=>{
    const definition=defaultFormDefinition('workout_feedback');
    definition.fields.find(f=>f.key==='perception')!.options[0].label='Foi desafiador';
    for(const [perception,difficulty] of [['Difícil',8],['Bom',5],['Ótimo',3]] as const){
      const canonical=projectFormAnswers(normalizeFormDefinition(definition),{perception,reflection:'Registro sintetico'});
      const payload=normalizeWorkoutFeedbackPayload(canonical);
      expect(buildWorkoutFeedbackRecord({studentId:'synthetic-student',companyId:'synthetic-company',payload}).difficulty).toBe(difficulty);
      expect(payload.perception).toBe(perception);
    }
    definition.fields.find(f=>f.key==='perception')!.options[0].value='Intenso';
    expect(()=>normalizeFormDefinition(definition)).toThrow();
  });
  it('cannot publish an instrument that hides both canonical response paths',()=>{
    const definition=defaultFormDefinition('workout_feedback');
    definition.fields.forEach(field=>{field.hidden=true;});
    expect(()=>normalizeFormDefinition(definition)).toThrow();
  });
  it('normalizes submitted canonical values on the server and requires the published version',async()=>{
    const id='20000000-0000-4000-8000-000000000001';
    const company='10000000-0000-4000-8000-000000000001';
    const definition=defaultFormDefinition('workout_feedback');
    definition.fields[0].options[0].label='Desafiador';
    const row={id,version:1,company_id:company,kind:'workout_feedback',definition};
    const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:row,error:null})};
    const client={from:()=>query} as unknown as FormReadClient;
    await expect(preparePublishedWorkoutFeedback(client,company,{perception:'Bom'})).rejects.toMatchObject({status:409});
    const result=await preparePublishedWorkoutFeedback(client,company,{form_definition_id:id,versioned_answers:{perception:'Difícil',reflection:'Ombro cansado'},perception:'Ótimo'});
    expect(result?.payload.perception).toBe('Difícil');
    expect(result?.formDefinitionId).toBe(id);
    expect(buildWorkoutFeedbackRecord({studentId:'synthetic',companyId:company,payload:result!.payload})).toMatchObject({difficulty:8,pain_areas:['ombro']});
    await expect(preparePublishedWorkoutFeedback(client,company,{form_definition_id:id,versioned_answers:{perception:'arbitrario'}})).rejects.toMatchObject({status:422});
  });
});
