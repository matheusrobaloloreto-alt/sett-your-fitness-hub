import { beforeEach, expect, it, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import { fetchAgendaAvailability, saveAgendaAvailability } from './companyAgendaAvailabilityStore';
import { defaultAgendaAvailability } from './companyAgendaAvailability';
beforeEach(()=>rpc.mockReset());
it('requires tenant, forwards version and fails closed on permission errors',async()=>{
 await expect(fetchAgendaAvailability('')).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
 rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}});await expect(fetchAgendaAvailability('a')).rejects.toThrow('indisponível');
 expect(rpc).toHaveBeenLastCalledWith('get_company_agenda_availability',{_company_id:'a'});
 rpc.mockResolvedValueOnce({data:null,error:{code:'PT409'}});
 await expect(saveAgendaAvailability('a',defaultAgendaAvailability(),2)).rejects.toThrow('Outra pessoa');
 expect(rpc).toHaveBeenLastCalledWith('save_company_agenda_availability',{_company_id:'a',_settings:defaultAgendaAvailability(),_expected_version:2});
});
it('rejects unsafe input before making a write and rejects invalid ACK versions',async()=>{
 await expect(saveAgendaAvailability('a',{...defaultAgendaAvailability(),timezone:'not-a-zone'},0)).rejects.toThrow();
 expect(rpc).not.toHaveBeenCalled();
 rpc.mockResolvedValueOnce({data:{settings:defaultAgendaAvailability(),version:4},error:null});
 await expect(saveAgendaAvailability('a',defaultAgendaAvailability(),0)).rejects.toThrow('inesperada');
});
it('reads the exact validated saved envelope',async()=>{
 const value={settings:{...defaultAgendaAvailability(),exceptions:[{date:'2026-12-25',windows:[]}]},version:3};
 rpc.mockResolvedValueOnce({data:value,error:null});expect(await fetchAgendaAvailability('a')).toEqual(value);
});
