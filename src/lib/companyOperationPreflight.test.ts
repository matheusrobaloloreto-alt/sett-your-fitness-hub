import {describe,it,expect,vi} from 'vitest';
import {companyOperationTransitionAllowed} from '../../supabase/functions/_shared/company-operation-transitions';

describe('operational server preflight',()=>{
 it('uses the authorized company and canonical stored stage',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:true,error:null});
  expect(await companyOperationTransitionAllowed({rpc},'company-a','fiscal_registration','contacted')).toBe(true);
  expect(rpc).toHaveBeenCalledWith('assert_company_operation_transition',{_company_id:'company-a',_source:'fiscal_registration_pending',_target:'contacted'});
 });
 it('fails closed for denied/failed/empty responses without any write or retry',async()=>{
  for(const result of [{data:false,error:null},{data:null,error:null},{data:true,error:{code:'42501'}}]){
   const rpc=vi.fn().mockResolvedValue(result);
   expect(await companyOperationTransitionAllowed({rpc},'a','interested','contacted')).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);
  }
  const rpc=vi.fn().mockRejectedValue(new Error('synthetic transport loss'));
  expect(await companyOperationTransitionAllowed({rpc},'a','lost','contacted')).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('leaves existing financial lifecycle and idempotent transitions to original authorization',async()=>{
  const rpc=vi.fn();
  for(const from of ['active','payment_pending','awaiting_onboarding','fiscal_registration_pending'])expect(await companyOperationTransitionAllowed({rpc},'a',from,'fiscal_registration_pending')).toBe(true);
  expect(rpc).not.toHaveBeenCalled();
 });
 it('uses stored status for NULL-stage inactive students before fiscal writes',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:false,error:null});
  expect(await companyOperationTransitionAllowed({rpc},'a',null,'fiscal_registration_pending','inactive')).toBe(false);
  expect(rpc).toHaveBeenCalledWith('assert_company_operation_transition',{_company_id:'a',_source:'lost',_target:'fiscal_registration_pending'});
  rpc.mockClear();
  expect(await companyOperationTransitionAllowed({rpc},'a',null,'fiscal_registration_pending','pending')).toBe(true);
  expect(rpc).not.toHaveBeenCalled();
 });
});
