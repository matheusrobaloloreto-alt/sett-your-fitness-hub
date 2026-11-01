import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import type {PropsWithChildren} from 'react';
const api=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),modes:new Map<string,unknown>(),failure:'' as string,owner:true,delay:null as null|Promise<unknown>,reads:[] as Array<{table:string;filters:Record<string,string>;select:string}>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:api.from,rpc:api.rpc}}));
import {readStudentPrescriptionPolicy,useStudentPrescriptionPolicy} from '@/hooks/useStudentPrescriptionPolicy';
const a={companyId:'a',studentId:'student-a',userId:'user-a'};
const b={companyId:'b',studentId:'student-b',userId:'user-b'};
beforeEach(()=>{api.from.mockReset();api.rpc.mockReset();api.modes=new Map([['a','keep_until_replaced'],['b','hide_on_expiry']]);api.failure='';api.owner=true;api.delay=null;api.reads=[];
 api.from.mockImplementation((table:string)=>{const filters:Record<string,string>={};let columns='';const q={select:(value:string)=>{columns=value;return q},eq:(key:string,value:string)=>{filters[key]=value;return q},maybeSingle:async()=>{
  api.reads.push({table,filters:{...filters},select:columns});if(api.failure===table)return {data:null,error:{code:'42501'}};
  if(table==='students')return {data:api.owner?{id:filters.id,company_id:filters.company_id}:null,error:null};
  if(table==='company_members'||table==='company_product_settings')return {data:null,error:null};
  throw Error('Unexpected table '+table);
 }};return q;});
 api.rpc.mockImplementation(async(name:string,args:{_company_id:string})=>{
  expect(name).toBe('get_company_workout_expiry_policy');
  const company=args._company_id;api.reads.push({table:'policy-rpc',filters:{company_id:company},select:''});
  if(api.failure==='policy-rpc')return {data:null,error:{code:'42501'}};
  if(api.delay&&company==='a')return api.delay;
  const mode=api.modes.get(company);
  return {data:mode==='NULL'?null:{company_id:company,version:mode==='ABSENT'?0:1,expired_workout_behavior:mode==='ABSENT'?'keep_until_replaced':mode},error:null};
 });});
afterEach(cleanup);
const renderPolicy=(scope=a)=>{const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;const view=renderHook(({scope})=>useStudentPrescriptionPolicy(scope),{initialProps:{scope},wrapper});return {...view,client};};
describe('QA minimal RPC reader for student without company_members',()=>{
 it('student without membership sees persisted hide via RPC, not null RLS row default keep',async()=>{api.modes.set('a','hide_on_expiry');expect((await readStudentPrescriptionPolicy(a)).behavior).toBe('hide_on_expiry');expect(api.rpc).toHaveBeenCalledWith('get_company_workout_expiry_policy',{_company_id:'a'});expect(api.reads.some(x=>x.table==='company_product_settings')).toBe(false);});
 it('confirmed absent policy is an explicit server keep/version0 envelope',async()=>{api.modes.set('a','ABSENT');expect((await readStudentPrescriptionPolicy(a)).behavior).toBe('keep_until_replaced');});
 it('null RPC data is never treated as legacy keep',async()=>{api.modes.set('a','NULL');await expect(readStudentPrescriptionPolicy(a)).rejects.toThrow();});
 it('permission denied cannot fall back to keep',async()=>{api.failure='policy-rpc';await expect(readStudentPrescriptionPolicy(a)).rejects.toThrow();});
 it.each(['','unknown','KEEP_UNTIL_REPLACED',null,true])('rejects invalid server mode %j',async mode=>{api.modes.set('a',mode);await expect(readStudentPrescriptionPolicy(a)).rejects.toThrow();});
 it('rejects an RPC envelope for another company',async()=>{api.rpc.mockResolvedValue({data:{company_id:'b',version:1,expired_workout_behavior:'keep_until_replaced'},error:null});await expect(readStudentPrescriptionPolicy(a)).rejects.toThrow();});
});
describe('QA policy hook: loading, errors, tenant and refetch',()=>{
 it('blocks during initial validation and grants only after a confirmed keep response',async()=>{let finish!:(v:unknown)=>void;api.delay=new Promise(r=>{finish=r});const view=renderPolicy();expect(view.result.current.allowContinuity).toBe(false);expect(view.result.current.loading).toBe(true);await waitFor(()=>expect(api.reads.some(x=>x.table==='policy-rpc')).toBe(true));await act(async()=>finish({data:{company_id:'a',version:1,expired_workout_behavior:'keep_until_replaced'},error:null}));await waitFor(()=>expect(view.result.current.allowContinuity).toBe(true));});
 it('policy refetch removes a cached keep grant while loading and stays blocked after hide',async()=>{const view=renderPolicy();await waitFor(()=>expect(view.result.current.allowContinuity).toBe(true));let finish!:(v:unknown)=>void;api.delay=new Promise(r=>{finish=r});act(()=>window.dispatchEvent(new CustomEvent('company-product-settings-changed',{detail:{companyId:'a'}})));expect(view.result.current.allowContinuity).toBe(false);expect(view.result.current.loading).toBe(true);await waitFor(()=>expect(api.reads.filter(x=>x.table==='policy-rpc').length).toBeGreaterThan(1));await act(async()=>finish({data:{company_id:'a',version:1,expired_workout_behavior:'hide_on_expiry'},error:null}));await waitFor(()=>expect(view.result.current.loading).toBe(false));expect(view.result.current.allowContinuity).toBe(false);});
 it('a refetch error cannot reuse the earlier keep value',async()=>{const view=renderPolicy();await waitFor(()=>expect(view.result.current.allowContinuity).toBe(true));api.failure='policy-rpc';act(()=>window.dispatchEvent(new CustomEvent('company-product-settings-changed',{detail:{companyId:'a'}})));await waitFor(()=>expect(view.result.current.error).toBeTruthy());expect(view.result.current.allowContinuity).toBe(false);});
 it('switches tenant immediately and ignores a delayed old-company keep result',async()=>{let finish!:(v:unknown)=>void;api.delay=new Promise(r=>{finish=r});const view=renderPolicy();await waitFor(()=>expect(api.reads.some(x=>x.table==='policy-rpc')).toBe(true));view.rerender({scope:b});expect(view.result.current.allowContinuity).toBe(false);await waitFor(()=>expect(view.result.current.loading).toBe(false));await act(async()=>finish({data:{company_id:'a',version:1,expired_workout_behavior:'keep_until_replaced'},error:null}));expect(view.result.current.allowContinuity).toBe(false);});
});
