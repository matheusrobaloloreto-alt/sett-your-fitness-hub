import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFeatureReadback,assertDashboard,exactFeatureKeys} from './commercial-complete-runtime-rest.mjs';

test('actual entitlement readback rejects empty/missing/extra keys, nonbooleans and wrong adopted values',()=>{
 const features=Object.fromEntries(exactFeatureKeys.map(k=>[k,k==='hasAgenda']));assertFeatureReadback(features,['hasAgenda']);
 assert.throws(()=>assertFeatureReadback({},[]));
 const missing={...features};delete missing.hasAgenda;assert.throws(()=>assertFeatureReadback(missing,['hasAgenda']));
 for(const value of [{...features,other:true},{...features,hasAgenda:'true'},{...features,hasAgenda:false}])assert.throws(()=>assertFeatureReadback(value,['hasAgenda']));
});
test('dashboard success must identify exact tenant/date and actual synthetic counts/contract',()=>{
 const company='10000000-0000-4000-8000-000000000001',date='2026-10-27';
 const body={version:1,companyId:company,asOfDate:date,stats:{totalStudents:1,interestedStudents:1,pendingStudents:0,awaitingRenewalStudents:0,inactiveStudents:0,trainers:2},planChart:[{name:'Synthetic 12 weeks',count:1}],trainerMap:{},renewals:{expiringContracts:[],awaitingRenewal:[],cycleCountdowns:[],trainerMap:{}},alerts:{}};
 for(const k of ['expiringContracts','cycleCountdowns','monthlyPrescriptions','pendingFeedback','contactCadence','cohortFeedback','atRiskStudents'])body[k]=[];
 for(const k of ['pendingActions','birthdays','missingWorkouts','awaitingTrainer','awaitingTrainingDate','missingEnrollment','incompleteBilling','recentStudents'])body.alerts[k]=[];
 assertDashboard(body,company,date);
 for(const mutate of [x=>x.companyId='foreign',x=>x.asOfDate='2000-01-01',x=>x.stats.totalStudents=0,x=>x.stats.trainers=3,x=>x.planChart=[],x=>x.alerts={}]){const altered=structuredClone(body);mutate(altered);assert.throws(()=>assertDashboard(altered,company,date));}
});
