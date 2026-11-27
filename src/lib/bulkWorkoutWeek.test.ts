import { describe, it, expect } from 'vitest';
import { editWorkoutWeek } from './bulkWorkoutWeek';
import { initializeNewWeeklyWorkoutDraft } from './weeklyStrengthPeriodization';

describe('bulk editing one workout week', () => {
  const draft = () => initializeNewWeeklyWorkoutDraft([{ exercises: [1,2].map(id => ({
    id, sets:'3', reps:'12', rest:'60s', notes:'preservar', method:null,
    group_id:'group', tempo:'3010', set_types:['normal','normal','falha'],
  })) }])[0].exercises;
  it('changes every exercise only in the target week, preserving base and other weeks', () => {
    const source = draft(); const snapshot = structuredClone(source);
    const result = editWorkoutWeek(source, 3, { sets:4, reps:'8–10', rest_seconds:90 });
    expect(source).toEqual(snapshot);
    for (const [index, exercise] of result.entries()) {
      expect(exercise.sets).toBe('3'); expect(exercise.reps).toBe('12'); expect(exercise.rest).toBe('60s');
      expect(exercise.notes).toBe('preservar'); expect(exercise.group_id).toBe('group');
      for (const block of exercise.weekly_prescription!) {
        const old = source[index].weekly_prescription!.find(b => b.week === block.week)!;
        if (block.week !== 3) expect(block).toEqual(old);
        else { expect(block).toMatchObject({sets:4,reps:'8–10',rest_seconds:90,tempo:old.tempo}); expect(block.set_types).toHaveLength(4); }
      }
    }
  });
  it('retains unspecified metrics and accepts zero rest', () => {
    const source=draft(); const result=editWorkoutWeek(source, 6, {rest_seconds:0});
    expect(result[0].weekly_prescription![5]).toEqual({...source[0].weekly_prescription![5],rest_seconds:0});
  });
  it('rejects legacy base-only prescriptions and invalid values rather than changing every week', () => {
    expect(() => editWorkoutWeek([{sets:'3',reps:'12',rest:'60',notes:''}],1,{sets:4})).toThrow();
    for (const week of [0,7,1.5]) expect(() => editWorkoutWeek(draft(),week,{sets:4})).toThrow();
    expect(() => editWorkoutWeek(draft(),1,{sets:0})).toThrow();
  });
});
