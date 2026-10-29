import {describe,it,expect} from 'vitest';
import {calculateSessionMetrics, type SessionLog} from './metrics';
const exercise=[{exercise_name:'Agachamento',muscle_group:'Pernas',sets:'2'}];
const row=(set_number:number,overrides:Partial<SessionLog>={}):SessionLog=>({workout_id:'w',exercise_index:0,set_number,weight:20,reps_done:10,completed:true,...overrides});
describe('confirmed session metrics',()=>{
  it('excludes false/null/missing, tombstones and other workouts from count, volume and PR',()=>{
    const result=calculateSessionMetrics('w',{a:row(1,{completed:false,weight:200}),b:row(2,{completed:null}),c:row(3,{completed:undefined}),d:row(4,{deleted:true}),e:row(5,{workout_id:'other'})},exercise,{});
    expect(result).toMatchObject({totalSetsCompleted:0,totalVolume:0,totalSetsPrescribed:2,totalExtraSetsCompleted:0});
    expect(result.exercisesSummary[0]).toMatchObject({sets:[],maxWeight:0,isPR:false});
  });
  it('counts confirmed bodyweight/zero-load sets and extras separately from the prescription',()=>{
    const result=calculateSessionMetrics('w',{b:row(3,{weight:0}),a:row(1),c:row(2,{weight:0,reps_done:0})},exercise,{'ex-0':15});
    expect(result).toMatchObject({totalSetsCompleted:3,totalVolume:200,totalSetsPrescribed:2,totalExtraSetsCompleted:1});
    expect(result.exercisesSummary[0]).toMatchObject({maxWeight:20,isPR:true,sets:[{setNumber:1,isExtra:false},{setNumber:2,isExtra:false},{setNumber:3,isExtra:true}]});
  });
  it.each([{weight:NaN},{reps_done:-1},{exercise_index:9},{set_number:8}])('rejects invalid confirmed metrics without quietly producing a summary: %j',patch=>{
    expect(()=>calculateSessionMetrics('w',{a:row(1,patch)},exercise,{})).toThrow();
  });
  it('rejects ambiguous duplicate coordinates instead of silently double counting',()=>{
    expect(()=>calculateSessionMetrics('w',{a:row(1),b:row(1)},exercise,{})).toThrow('Ambiguous duplicate');
  });
  it('does not announce a 20kg PR against an uncertain historical baseline',()=>{
    const result=calculateSessionMetrics('w',{a:row(1)},exercise,{'ex-0':15},new Set([0]));
    expect(result.exercisesSummary[0]).toMatchObject({maxWeight:20,volume:200,isPR:false});
    expect(result.totalSetsCompleted).toBe(1);
  });

});
