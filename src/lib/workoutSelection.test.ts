import { describe, it, expect } from 'vitest';
import { resolveWorkoutTarget, withWorkoutKeys, withoutWorkoutKeys } from './workoutSelection';
describe('stable workout destination', () => {
 it('keeps B after removing A and rejects a removed target', () => {
 const ws = withWorkoutKeys([{id:'A'}, {id:'B'}, {id:'C'}]);
 expect(resolveWorkoutTarget(ws.slice(1), 'B')?.index).toBe(0);
 expect(resolveWorkoutTarget(ws.slice(1), 'A')).toBeNull();
 });
 it('retains draft identities and strips keys for export', () => {
 const ws = withWorkoutKeys([{}]);
 expect(withWorkoutKeys(ws)).toEqual(ws);
 expect(withoutWorkoutKeys(ws)).toEqual([{}]);
 });
});
