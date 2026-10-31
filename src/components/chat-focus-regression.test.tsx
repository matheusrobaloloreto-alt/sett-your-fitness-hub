import {act,cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({fetch:vi.fn(),unmount:vi.fn(),auth:{user:{id:'synthetic-staff'},role:'admin',companyId:'synthetic-company'},master:{viewingCompany:null,isViewingCompany:false,contextLoading:false}}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>state.auth}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>state.master}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.fetch}}));

vi.mock('@/hooks/useRolePermissions',()=>({useRolePermissions:()=>({canAccess:()=>true,loading:false})}));
vi.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/admin/registration'})}));
vi.mock('@/pages/admin/WhatsAppChat',async()=>{const React=await import('react');return{default:function DiagnosticChat(){React.useEffect(()=>()=>state.unmount(),[]);return <input aria-label="diagnostic attachment" type="file"/>;}}});
import {useCompanyFeatures} from '@/hooks/useCompanyFeatures';
import {WhatsAppChatPanelProvider} from '@/components/WhatsAppChatPanel';
import {unrestrictedMasterFeatures} from '@/lib/companyFeatureEntitlements';
const valid={data:{company_id:'synthetic-company',source:'legacy',version:1,tier:'advanced',features:unrestrictedMasterFeatures},error:null};
beforeEach(()=>{state.auth={user:{id:'synthetic-staff'},role:'admin',companyId:'synthetic-company'};state.fetch.mockReset();});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
it('must preserve the open attachment composer across focus and identical permission refresh',async()=>{
 let finish!:(v:unknown)=>void;
 state.fetch.mockResolvedValueOnce(valid).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render(<WhatsAppChatPanelProvider><div>Underlying registration page</div></WhatsAppChatPanelProvider>);
 await waitFor(()=>expect(screen.getByLabelText('Abrir conversas do WhatsApp')).toBeEnabled());
 fireEvent.click(screen.getByLabelText('Abrir conversas do WhatsApp'));
 await screen.findByLabelText('diagnostic attachment');
 act(()=>window.dispatchEvent(new Event('focus')));
 expect(state.fetch).toHaveBeenCalledTimes(2);
 const during=!!screen.queryByLabelText('diagnostic attachment');
 await act(async()=>finish(valid));
 await screen.findByLabelText('Abrir conversas do WhatsApp');
 console.log(JSON.stringify({duringRefreshComposerPresent:during,afterIdenticalRefreshComposerPresent:!!screen.queryByLabelText('diagnostic attachment'),unmounts:state.unmount.mock.calls.length}));
 expect(during).toBe(true);
 expect(state.unmount).not.toHaveBeenCalled();
 expect(screen.getByLabelText('diagnostic attachment')).toBeInTheDocument();
});

async function open() {
 const view=render(<WhatsAppChatPanelProvider><div>Underlying registration page</div></WhatsAppChatPanelProvider>);
 await waitFor(()=>expect(screen.getByLabelText('Abrir conversas do WhatsApp')).toBeEnabled());
 fireEvent.click(screen.getByLabelText('Abrir conversas do WhatsApp'));
 await screen.findByLabelText('diagnostic attachment');
 return view;
}
it('deduplicates pending focus, blocks controls, preserves selected file and recovers from rejection',async()=>{
 let reject!:(e:Error)=>void;
 state.fetch.mockResolvedValueOnce(valid).mockImplementationOnce(()=>new Promise((_,r)=>{reject=r})).mockResolvedValue(valid);
 await open();
 const input=screen.getByLabelText('diagnostic attachment') as HTMLInputElement;
 const file=new File(['synthetic'],'synthetic.pdf',{type:'application/pdf'});
 fireEvent.change(input,{target:{files:[file]}});
 act(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));});
 expect(state.fetch).toHaveBeenCalledTimes(2);
 expect(input).toBeDisabled();
 expect(input.files?.[0]).toBe(file);
 await act(async()=>reject(new Error('offline')));
 expect(input).toBeDisabled();
 fireEvent.click(screen.getByText('Tentar novamente'));
 await waitFor(()=>expect(input).toBeEnabled());
 expect(input.files?.[0]).toBe(file);
 expect(state.unmount).not.toHaveBeenCalled();
});
it('times out and ignores a late successful ACK after retry revokes access',async()=>{
 let finish!:(v:unknown)=>void;
 state.fetch.mockResolvedValueOnce(valid).mockImplementationOnce(()=>new Promise(r=>{finish=r})).mockResolvedValue({data:{...valid.data,features:{...unrestrictedMasterFeatures,hasWhatsApp:false}},error:null});
 await open();
 vi.useFakeTimers();
 act(()=>window.dispatchEvent(new Event('focus')));
 await act(async()=>{await vi.advanceTimersByTimeAsync(15001)});
 expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
 vi.useRealTimers();
 fireEvent.click(screen.getByText('Tentar novamente'));
 await waitFor(()=>expect(screen.queryByLabelText('diagnostic attachment')).toBeNull());
 await act(async()=>finish(valid));
 expect(screen.queryByLabelText('diagnostic attachment')).toBeNull();
});
it.each(['user','company','role','logout'])('discards composer on %s change and ignores the old ACK',async(change)=>{
 let finish!:(v:unknown)=>void;
 state.fetch.mockResolvedValueOnce(valid).mockImplementationOnce(()=>new Promise(r=>{finish=r})).mockResolvedValue(valid);
 const view=await open();
 act(()=>window.dispatchEvent(new Event('focus')));
 if(change==='user')state.auth={...state.auth,user:{id:'other'}};
 if(change==='company')state.auth={...state.auth,companyId:'other-company'};
 if(change==='role')state.auth={...state.auth,role:'trainer'};
 if(change==='logout')state.auth={...state.auth,user:null as never};
 view.rerender(<WhatsAppChatPanelProvider><div>Underlying registration page</div></WhatsAppChatPanelProvider>);
 expect(screen.queryByLabelText('diagnostic attachment')).toBeNull();
 await act(async()=>finish(valid));
 expect(screen.queryByLabelText('diagnostic attachment')).toBeNull();
});
it('allows explicit cancel during validation without reopening on ACK',async()=>{
 let finish!:(v:unknown)=>void;
 state.fetch.mockResolvedValueOnce(valid).mockImplementationOnce(()=>new Promise(r=>{finish=r}));
 await open();
 act(()=>window.dispatchEvent(new Event('focus')));
 fireEvent.click(screen.getByText('Close'));
 await act(async()=>finish(valid));
 expect(screen.queryByLabelText('diagnostic attachment')).toBeNull();
});

it('shares validation across consumers and pauses dispatch until same-scope ACK',async()=>{
 let finish!:(v:unknown)=>void;
 state.fetch.mockResolvedValueOnce(valid).mockImplementationOnce(()=>new Promise(r=>{finish=r}));
 const a=renderHook(useCompanyFeatures);
 const b=renderHook(useCompanyFeatures);
 await waitFor(()=>expect(a.result.current.canSendWhatsApp()).toBe(true));
 expect(state.fetch).toHaveBeenCalledTimes(1);
 act(()=>window.dispatchEvent(new Event('focus')));
 expect(a.result.current.canSendWhatsApp()).toBe(false);
 let resolved=false;
 const pending=a.result.current.waitForWhatsAppValidation().then(value=>{resolved=value;return value});
 await act(async()=>{await Promise.resolve()});
 expect(resolved).toBe(false);
 await act(async()=>finish(valid));
 expect(await pending).toBe(true);
 expect(b.result.current.canSendWhatsApp()).toBe(true);
});
it('cancels a validation waiter when the last scope consumer leaves',async()=>{
 state.fetch.mockImplementation(()=>new Promise(()=>{}));
 const a=renderHook(useCompanyFeatures);
 const pending=a.result.current.waitForWhatsAppValidation();
 a.unmount();
 expect(await pending).toBe(false);
});
