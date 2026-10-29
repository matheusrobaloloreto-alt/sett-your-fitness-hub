import { describe, expect, it } from 'vitest';
import { parseGovernance, governanceError } from './companyGovernance';
describe('governance RPC boundary', () => {
  it('rejects a response from another tenant and malformed revision', () => {
    const value = {company_id:'one',version:0,owner_id:null,can_manage:false,members:[],transfers:[],bundles:[],assignments:[],audit:[]};
    expect(parseGovernance(value,'one').version).toBe(0);
    expect(() => parseGovernance(value,'two')).toThrow();
    expect(() => parseGovernance({...value,version:-1},'one')).toThrow();
    expect(() => parseGovernance({...value,transfers:null},'one')).toThrow();
  });
  it('explains stale and denied writes without claiming success', () => {
    expect(governanceError({code:'PT409'})).toMatch(/Recarregue/);
    expect(governanceError({code:'42501'})).toMatch(/permissão/);
    expect(governanceError({message:'private backend detail'})).not.toContain('private backend detail');
  });
});
