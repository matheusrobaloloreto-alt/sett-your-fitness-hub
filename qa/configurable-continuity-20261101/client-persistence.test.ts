import {beforeEach,describe,it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),row:null as unknown,error:null as unknown,company:''}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:api.from,rpc:api.rpc}}));
import {fetchCompanyProductSettings,saveCompanyProductSettings,normalizeCompanyProductSettings as normalize} from '@/lib/companyProductSettings';
beforeEach(()=>{api.rpc.mockReset();api.from.mockReset();api.row=null;api.error=null;api.company='';api.from.mockImplementation(()=>({select:()=>({eq:(_key:string,company:string)=>{api.company=company;return {maybeSingle:async()=>({data:api.row,error:api.error})};}})}));});
describe('QA cfgcontinuity: client de persistência real; transporte mockado, não prova DB',()=>{
 it.each(['keep_until_replaced','hide_on_expiry'])('saves %s with exact tenant/CAS and reads it back',async mode=>{
  const settings=normalize({prescription:{expired_workout_behavior:mode}});const before=structuredClone(settings);
  const stored=structuredClone(settings);delete (stored.prescription as Partial<typeof stored.prescription>).expired_workout_behavior;
  api.rpc.mockResolvedValue({data:{settings:stored,version:8,expired_workout_behavior:mode},error:null});
  const saved=await saveCompanyProductSettings('company-a',settings,7);
  expect(api.rpc).toHaveBeenCalledExactlyOnceWith('save_company_product_settings',{_company_id:'company-a',_settings:settings,_expected_version:7});
  api.row={settings:stored,version:saved.version,expired_workout_behavior:mode};
  const read=await fetchCompanyProductSettings('company-a');expect(api.company).toBe('company-a');expect(read.settings.prescription.expired_workout_behavior).toBe(mode);expect(read.version).toBe(8);expect(settings).toEqual(before);
 });
 it('rejects an invalid enum before attempting the save RPC',async()=>{const settings={...normalize({}),prescription:{...normalize({}).prescription,expired_workout_behavior:'grant_everything'}};await expect(saveCompanyProductSettings('company-a',settings as never,0)).rejects.toThrow();expect(api.rpc).not.toHaveBeenCalled();});
 it.each(['PT409','40001'])('propagates CAS conflict %s without retry or local grant',async code=>{api.rpc.mockResolvedValue({data:null,error:{code,message:'conflict'}});await expect(saveCompanyProductSettings('company-a',normalize({}),4)).rejects.toMatchObject({code});expect(api.rpc).toHaveBeenCalledTimes(1);});
 it('permission errors are not replaced with a default keep policy',async()=>{api.error={code:'42501'};await expect(fetchCompanyProductSettings('company-a')).rejects.toMatchObject({code:'42501'});});
 it('invalid server enum never normalizes to a permissive policy',async()=>{api.row={version:1,settings:{prescription:{}},expired_workout_behavior:'future_invalid'};await expect(fetchCompanyProductSettings('company-a')).rejects.toThrow();});
});
