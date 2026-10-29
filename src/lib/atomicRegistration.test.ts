import {describe,it,expect,vi} from 'vitest';
import {atomicRegistration} from '../../supabase/functions/_shared/atomic-registration';
const id='10000000-0000-4000-8000-000000000001',student='20000000-0000-4000-8000-000000000001',lead='30000000-0000-4000-8000-000000000001';
const valid={id:lead,company_id:id,token:lead,student:{id:student},studentId:student,leadId:lead,expires_at:'2099-01-01T00:00:00Z',messageSent:false,confirmedPhone:'5548990000101'};
describe('atomic registration acknowledgements',()=>{
 it('accepts only a scoped confirmed result and forwards exactly one RPC',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:valid,error:null});
  expect(await atomicRegistration({rpc},'convert_lead_to_fiscal_atomic',{_lead_id:lead,_actor_id:student,_confirmed_phone:'5548990000101'},id)).toEqual(valid);
  expect(rpc).toHaveBeenCalledOnce();expect(rpc).toHaveBeenCalledWith('convert_lead_to_fiscal_atomic',{_lead_id:lead,_actor_id:student,_confirmed_phone:'5548990000101'});
 });
 it.each([{company_id:student},{token:'bad'},{student:{id:'bad'}},{expires_at:'not-a-date'},{leadId:student},{studentId:lead},{messageSent:true},{confirmedPhone:'5548990000999'}])('rejects inconsistent server acknowledgement %j',async patch=>{
  const rpc=vi.fn().mockResolvedValue({data:{...valid,...patch},error:null});
  await expect(atomicRegistration({rpc},'convert_lead_to_fiscal_atomic',{_lead_id:lead,_confirmed_phone:'5548990000101'},id)).rejects.toMatchObject({status:503});expect(rpc).toHaveBeenCalledOnce();
 });
 it.each([['42501',403],['PT409',409],['PT422',422],['22023',422],['PGRST202',503]])('handles %s without retry or leaking details',async(code,status)=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:{code,message:'private synthetic database detail'}});
  await expect(atomicRegistration({rpc},'convert_lead_to_fiscal_atomic',{_lead_id:lead,_confirmed_phone:'5548990000101'},id)).rejects.toMatchObject({status});expect(rpc).toHaveBeenCalledOnce();
 });
});
