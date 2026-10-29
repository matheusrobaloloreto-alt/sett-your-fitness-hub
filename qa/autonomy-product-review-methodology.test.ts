import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCompanyProductSettings} from '../supabase/functions/_shared/company-product-settings.ts';
import {buildWeeklyPeriodization} from '../supabase/functions/_shared/prescription/weeklyPeriodization.ts';
import {projectAdditionalPrescriptionAnswers,projectIntercycleInputs} from '../supabase/functions/_shared/prescription/companyPolicy.ts';
import type {PrescriptionInput,TrainingWorkout} from '../supabase/functions/_shared/prescription/types.ts';

const input: PrescriptionInput={catalog:[],fitnessLevel:'avancado',daysPerWeek:3,objective:'hipertrofia'};
const workout={name:'Synthetic',exercises:[{exercise_id:'synthetic',exercise_name:'Supino máquina',phase:'forca_global',muscle_group:'peitoral',sets:4,reps:'8-12',rir:'3',rest_seconds:90,tempo:'2020',exercise_order:0,biomechanical_note:''}]} as TrainingWorkout;

test('two company policies generate independently without contaminating inputs or defaults',()=>{
 const a=normalizeCompanyProductSettings({prescription:{allowed_methods:[],first_week_volume_multiplier:0.5,default_cadence:'4020',weekly_rules:[{week:1,phase:'base',rir_min:4,rir_max:5,volume_percent:50}]}}).prescription;
 const b=normalizeCompanyProductSettings().prescription;
 const before=JSON.stringify({a,b,workout});
 const first=buildWeeklyPeriodization([workout],{...input,companyPolicy:a});
 const second=buildWeeklyPeriodization([workout],{...input,companyPolicy:b});
 assert.equal(first.workouts[0].exercises[0].weekly_prescription![0].tempo,'4020');
 assert.equal(second.workouts[0].exercises[0].weekly_prescription![0].tempo,'2020');
 assert.equal(first.weeks[0].volume_percent,50);
 assert.equal(second.weeks[0].volume_percent,80);
 assert.equal(JSON.stringify({a,b,workout}),before);
});

test('persisted extra mappings cannot project clinical fields and valid intercycle overrides objective',()=>{
 const prescription=normalizeCompanyProductSettings({prescription:{answer_mappings:[{source_key:'extra_goal',answer:'Strong',target:'objective',value:'forca'}]}}).prescription;
 const source={...input,painEva:8,injuries:['synthetic shoulder restriction']};
 const mapped=projectAdditionalPrescriptionAnswers(source,{extra_goal:'Strong',painEva:0},prescription);
 assert.equal(mapped.objective,'forca');assert.equal(mapped.painEva,8);assert.deepEqual(mapped.injuries,source.injuries);
 const newer=projectIntercycleInputs(mapped,{status:'completed',sensitive_consent:true,goals_continue:false,new_goals:'saude'});
 assert.equal(newer.objective,'saude');assert.equal(source.objective,'hipertrofia');
 assert.throws(()=>normalizeCompanyProductSettings({prescription:{answer_mappings:[{source_key:'extra_pain',answer:'No',target:'painEva',value:'0'}]}}));
 assert.throws(()=>projectAdditionalPrescriptionAnswers(source,{extra_goal:{value:'Strong'}},prescription));
});

test('deload wins over company intensity, cadence and weekly volume preferences',()=>{
 const companyPolicy=normalizeCompanyProductSettings({prescription:{first_week_volume_multiplier:1,default_cadence:'1111',weekly_rules:[{week:1,phase:'intensificacao',rir_min:2,rir_max:2,volume_percent:105}]}}).prescription;
 const result=buildWeeklyPeriodization([workout],{...input,deload:true,companyPolicy});
 assert.equal(result.weeks[0].block,'deload');assert.equal(result.weeks[0].volume_percent,50);
 assert.equal(result.workouts[0].exercises[0].weekly_prescription![0].tempo,'3110');
 assert.equal(result.workouts[0].exercises[0].weekly_prescription![0].rir,'4');
});
