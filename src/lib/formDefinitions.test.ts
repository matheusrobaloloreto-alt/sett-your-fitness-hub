import { describe, expect, it } from 'vitest';
import { defaultFormDefinition, normalizeFormDefinition, validateFormAnswers, projectFormAnswers } from '../../supabase/functions/_shared/form-definitions';
import {validateInviteAnamnesis} from '../../supabase/functions/_shared/public-anamnesis-validation';

describe('company form definitions', () => {
  it('allows core labels and order changes while retaining machine keys', () => {
    const form = defaultFormDefinition('intercycle');
    form.fields[0].label = 'Como foi esta etapa?';
    form.fields.reverse();
    expect(normalizeFormDefinition(form).fields.find(f => f.key === 'prescription_evaluation')?.label).toBe('Como foi esta etapa?');
  });
  it('rejects hidden identity, removed clinical questions, and arbitrary engine mappings', () => {
    const form = defaultFormDefinition('initial');
    form.fields = form.fields.filter(f => f.key !== 'clin_chest_pain');
    expect(() => normalizeFormDefinition(form)).toThrow();
    const pre = defaultFormDefinition('pre_registration');
    pre.fields.find(f => f.key === 'whatsapp')!.hidden = true;
    expect(() => normalizeFormDefinition(pre)).toThrow();
    const extra = defaultFormDefinition('intercycle');
    extra.fields.push({ key: 'extra_question', label: 'Extra', type: 'text', required: false, hidden: false, help: '', options: [], mapping: 'injuries' } as never);
    expect(() => normalizeFormDefinition(extra)).toThrow();
  });
  it('validates empty required values and options for every supported type without rejecting false or zero', () => {
    for (const type of ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean', 'consent'] as const) {
      const form = defaultFormDefinition('intercycle');
      form.fields.push({ key: 'extra_question', label: 'Extra', type, required: true, hidden: false, help: '', options: ['one','two'].map(value => ({value,label:value})) });
      expect(validateFormAnswers(form, {extra_question: ''})).toContain('Extra');
    }
    const form = defaultFormDefinition('checkin');
    expect(validateFormAnswers(form, {sleep_quality: 1, stress: 1, pain: 0})).toEqual([]);
    expect(validateFormAnswers(form, {sleep_quality: 99, stress: 1, pain: 0})).toContain('Como foi seu sono?');
  });
  it('preserves canonical values when choice labels change and projects extras separately', () => {
    const form = defaultFormDefinition('intercycle');
    form.fields[0].options[0].label = 'Encaixou muito bem';
    form.fields.push({key:'extra_question',label:'Observacao',type:'text',required:false,hidden:false,help:'',options:[]});
    const result = projectFormAnswers(normalizeFormDefinition(form), {prescription_evaluation:'better', extra_question:'Detalhe'});
    expect(result.prescription_evaluation).toBe('better');
    expect(result.custom_answers).toEqual({extra_question:{label:'Observacao',value:'Detalhe'}});
    form.fields[0].options[0].value = 'custom_engine_value';
    expect(() => normalizeFormDefinition(form)).toThrow();
  });
  it('rejects fractional clinical EVA and NPS scores and unsupported hidden mappings',()=>{
    const form=defaultFormDefinition('intercycle');
    expect(validateFormAnswers(form,{pain_present:true,pain_eva:3.5})).toContain('EVA (0 a 10)');
    expect(validateFormAnswers(defaultFormDefinition('cycle_feedback'),{nps:5.5})).toContain('De 0 a 10, o quanto voce recomendaria seu treinador?');
  });
  it('projects the complete default initial instrument into the existing clinical contract',()=>{
    const form=defaultFormDefinition('initial');
    const answers:Record<string,unknown>={requested_services:['strength'],gender:'M',modalities:['Nenhum']};
    for(const field of form.fields){
      if(answers[field.key]!==undefined||!field.required)continue;
      answers[field.key]=field.type==='boolean'?false:field.type==='number'?(field.min??0):field.type==='select'?(field.options.some(o=>o.value==='nao')?'nao':field.options[0].value):'Sintetico';
    }
    expect(validateInviteAnamnesis(projectFormAnswers(form,answers),[])).toEqual([]);
    const pre=defaultFormDefinition('pre_registration');
    const projected=projectFormAnswers(pre,{...answers,full_name:'Aluno Sintetico',whatsapp:'48999990000',budget_range:'300_400'});
    expect(projected.available_equipment).toEqual([]);
  });
  it('allows declining optional extra consent while required clinical consent must be affirmative',()=>{
    const form=defaultFormDefinition('intercycle');
    form.fields.push({key:'extra_consent',label:'Contato opcional',type:'consent',required:false,hidden:false,help:'',options:[]});
    expect(validateFormAnswers(form,{extra_consent:false})).not.toContain('Contato opcional');
    expect(validateFormAnswers(form,{sensitive_consent:false})).toContain(form.fields.find(f=>f.key==='sensitive_consent')!.label);
  });
});
