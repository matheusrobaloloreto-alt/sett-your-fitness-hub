import { beforeEach, expect, it, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import { fetchCompanyOperations, saveCompanyOperations, fetchOperationMetrics } from './companyOperationsStore';
import { defaultOperations } from './companyOperations';
beforeEach(()=>rpc.mockReset());
it('loads the explicit company envelope and never falls back on an authorization error',async()=>{
 rpc.mockResolvedValueOnce({data:{settings:null,version:0},error:null});
 expect((await fetchCompanyOperations('tenant-a')).settings.stages).toHaveLength(7);
 expect(rpc).toHaveBeenCalledWith('get_company_operations',{_company_id:'tenant-a'});
 rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}});
 await expect(fetchCompanyOperations('tenant-b')).rejects.toThrow('indisponível');
});
it('sends OCC and tenant to the only save RPC, rejects stale versions and invalid acknowledgements',async()=>{
 const settings=defaultOperations();rpc.mockResolvedValueOnce({data:null,error:{code:'PT409'}});
 await expect(saveCompanyOperations('a',settings,1)).rejects.toThrow('Recarregue');
 expect(rpc).toHaveBeenCalledWith('save_company_operations',{_company_id:'a',_settings:settings,_expected_version:1});
 rpc.mockResolvedValueOnce({data:{settings,version:9},error:null});
 await expect(saveCompanyOperations('a',settings,1)).rejects.toThrow('inesperada');
});
it('does not call the server for missing tenant or invalid configuration',async()=>{
 await expect(fetchOperationMetrics('')).rejects.toThrow();
 await expect(saveCompanyOperations('',defaultOperations(),0)).rejects.toThrow();
 await expect(saveCompanyOperations('a',{...defaultOperations(),stages:[]},0)).rejects.toThrow();
 expect(rpc).not.toHaveBeenCalled();
});
it('rejects malformed aggregate responses instead of displaying zero',async()=>{
 rpc.mockResolvedValueOnce({data:{active:-1},error:null});
 await expect(fetchOperationMetrics('a')).rejects.toThrow('inválidos');
});
it('preflights an operational action against the server before a consumer proceeds',async()=>{
 const {assertCompanyOperationalTransition}=await import('./companyOperationsStore');
 rpc.mockResolvedValueOnce({data:false,error:null});
 await expect(assertCompanyOperationalTransition('a','interested','contacted')).rejects.toThrow('Transição indisponível');
 rpc.mockResolvedValueOnce({data:true,error:null});
 await expect(assertCompanyOperationalTransition('a','interested','contacted')).resolves.toBeUndefined();
 expect(rpc).toHaveBeenLastCalledWith('assert_company_operation_transition',{_company_id:'a',_source:'interested',_target:'contacted'});
});
it('keeps existing commercial labels supplied in the initial version-zero baseline',async()=>{
 const settings=defaultOperations();settings.stages[0].label='Meu cadastro';
 rpc.mockResolvedValueOnce({data:{settings,version:0},error:null});
 expect((await fetchCompanyOperations('a')).settings.stages[0].label).toBe('Meu cadastro');
});
