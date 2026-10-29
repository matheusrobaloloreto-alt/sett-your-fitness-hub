import { describe, expect, it } from 'vitest';
import { defaultOperations, validateOperations, visibleOperationStages, operationalTransitionAllowed, evaluateOperationReport } from './companyOperations';
describe('bounded operations consumers', () => {
 it('rejects financial transitions and arbitrary report expressions', () => {
  const value = defaultOperations();
  expect(() => validateOperations({...value, transitions:[{from:'interested',to:'active'}]})).toThrow();
  expect(() => validateOperations({...value,reports:[{id:'x',title:'X',metric:'sql',display:'count'}]})).toThrow();
 });
 it('keeps hidden populated stages discoverable and honors saved order', () => {
  const value = defaultOperations();
  value.stages.reverse(); value.stages.find(s=>s.code==='contacted')!.visible=false;
  expect(visibleOperationStages(value, {contacted:2})[0].code).toBe('lost');
  expect(visibleOperationStages(value, {}).some(s=>s.code==='contacted')).toBe(false);
  expect(visibleOperationStages(value, {contacted:2}).some(s=>s.code==='contacted')).toBe(true);
 });
 it('restricts only operational transitions, preserving canonical financial handlers', () => {
  const value=defaultOperations(); value.transitions=[];
  expect(operationalTransitionAllowed(value,'interested','contacted')).toBe(false);
  expect(operationalTransitionAllowed(value,'payment_pending','active_onboarding')).toBe(true);
 });
 it('previews count or share from the selected safe metric, including no denominator', () => {
  expect(evaluateOperationReport({id:'a',title:'Ativos',metric:'active',display:'share'}, {active:3,pending:1,inactive:2,awaiting_renewal:0})).toBe('50%');
  expect(evaluateOperationReport({id:'a',title:'Ativos',metric:'active',display:'share'}, {active:0,pending:0,inactive:0,awaiting_renewal:0})).toBe('—');
 });
 it('rejects missing/duplicate stages, unknown fields and unsafe labels', () => {
  const value=defaultOperations();
  expect(()=>validateOperations({...value,stages:value.stages.slice(1)})).toThrow();
  expect(()=>validateOperations({...value,sql:'select 1'})).toThrow();
  expect(()=>validateOperations({...value,stages:value.stages.map(s=>({...s,label:'<script>'}))})).toThrow();
 });
});
it('does not offer noncanonical reactivation paths from dormant leads',()=>{
 const value=defaultOperations();
 expect(value.transitions.filter(t=>t.from==='lost')).toEqual([{from:'lost',to:'contacted'}]);
 expect(()=>validateOperations({...value,transitions:[{from:'lost',to:'interested'}]})).toThrow();
});
