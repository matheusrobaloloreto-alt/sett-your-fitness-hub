import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
import { parseGovernance, governanceError, governanceMemberLabel } from './companyGovernance';
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

describe('human member identity',()=>{
  it('disambiguates names with roles and short member codes without changing IDs',()=>{
    const first={user_id:'00000000-0000-4000-8000-000000123456',name:'Maria',roles:['admin']};
    const second={...first,user_id:'00000000-0000-4000-8000-000000654321'};
    expect(governanceMemberLabel(first)).toBe('Maria · Administrador · membro 00123456');
    expect(governanceMemberLabel(second)).toBe('Maria · Administrador · membro 00654321');
    expect(governanceMemberLabel(first)).not.toContain(first.user_id);
  });
});
