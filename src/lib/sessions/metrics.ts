/** New summaries only. Missing/null/false completion flags never imply execution. */
export interface SessionLog {
  workout_id: string;
  exercise_index: number;
  set_number: number;
  weight: number;
  reps_done: number;
  completed?: boolean | null;
  deleted?: boolean;
}
export interface ExerciseSummaryItem {
  name: string;
  muscleGroup: string;
  sets: { weight: number; reps: number; setNumber?: number; isExtra?: boolean }[];
  maxWeight: number;
  volume: number;
  isPR: boolean;
}
export function calculateSessionMetrics(workoutId:string, logs:Record<string,SessionLog>, exercises:{exercise_name:string;muscle_group:string;sets:string}[], previousBestWeights:Record<string,number>, unknownPreviousExercises:ReadonlySet<number> = new Set<number>()) {
  const prescribed=exercises.map(ex=>parseInt(ex.sets)||3);
  const seen=new Set<string>();
  const confirmed=Object.values(logs).filter(log=>{
    if(log.workout_id!==workoutId || log.completed!==true || log.deleted===true) return false;
    if(!Number.isInteger(log.exercise_index) || !exercises[log.exercise_index] || !Number.isInteger(log.set_number) || log.set_number<1 || log.set_number>prescribed[log.exercise_index]+5) throw new Error('Invalid confirmed set coordinates');
    if(!Number.isFinite(log.weight) || log.weight<0 || !Number.isFinite(log.reps_done) || log.reps_done<0) throw new Error('Invalid confirmed set metrics');
    const key=`${log.exercise_index}:${log.set_number}`;
    if(seen.has(key)) throw new Error('Ambiguous duplicate confirmed set');
    seen.add(key);return true;
  });
  const exercisesSummary:ExerciseSummaryItem[]=exercises.map((ex,index)=>{
    const sets=confirmed.filter(log=>log.exercise_index===index).sort((a,b)=>a.set_number-b.set_number).map(log=>({weight:log.weight,reps:log.reps_done,setNumber:log.set_number,isExtra:log.set_number>prescribed[index]}));
    const maxWeight=Math.max(0,...sets.map(set=>set.weight));
    return {name:ex.exercise_name,muscleGroup:ex.muscle_group,sets,maxWeight,volume:sets.reduce((sum,set)=>sum+set.weight*set.reps,0),isPR:!unknownPreviousExercises.has(index) && maxWeight>0 && maxWeight>(previousBestWeights[`ex-${index}`]||0)};
  });
  return {exercisesSummary,totalVolume:exercisesSummary.reduce((sum,ex)=>sum+ex.volume,0),totalSetsCompleted:confirmed.length,totalSetsPrescribed:prescribed.reduce((sum,n)=>sum+n,0),totalExtraSetsCompleted:exercisesSummary.reduce((sum,ex)=>sum+ex.sets.filter(set=>set.isExtra).length,0)};
}
