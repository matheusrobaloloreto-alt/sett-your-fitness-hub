import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import CompanyIntegrations from './CompanyIntegrations';
const state=vi.hoisted(()=>({role:'admin',companyId:'company-a',isViewingCompany:false,viewingCompany:null as {id:string}|null,hasWhatsApp:true,loading:false}));
const api=vi.hoisted(()=>({getSession:vi.fn(),rpc:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>state}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>state}));
vi.mock('@/hooks/useCompanyFeatures',()=>({useCompanyFeatures:()=>state}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:api.getSession},rpc:api.rpc}}));
const requests:Array<{action:string;companyId:string}>=[];
beforeEach(()=>{
 vi.resetAllMocks();state.role='admin';state.companyId='company-a';state.isViewingCompany=false;state.viewingCompany=null;state.hasWhatsApp=true;state.loading=false;requests.length=0;
 api.getSession.mockResolvedValue({data:{session:{access_token:'synthetic-session'}}});
 api.rpc.mockResolvedValue({data:[{provider:'asaas',configured:false,mask:null,version:0,consumer_enabled:false},{provider:'whatsapp_evolution',configured:false,mask:null,version:0,consumer_enabled:false}],error:null});
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return{ok:true,status:200,json:async()=>body.action==='check-status'?{status:'connected',phone:body.companyId==='company-a'?'1111111111':'2222222222'}:{enabled:false,source:'none'}};}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('shows the current connection separately from an empty preparation vault without changing it',async()=>{
 render(<CompanyIntegrations companyId="company-a"/>);
 expect(await screen.findByText('Conectado')).toBeInTheDocument();
 expect(screen.getByText(/Estar vazio aqui não significa/)).toBeInTheDocument();
 await waitFor(()=>expect(api.rpc).toHaveBeenCalledWith('get_company_integration_status',{_company_id:'company-a'}));
 expect(requests.map(r=>r.action).sort()).toEqual(['check-status','fetch-bot-settings']);
 expect(screen.getByRole('button',{name:'Desconectar'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Conectar WhatsApp'})).not.toBeInTheDocument();
});
it('remounting the centralized panel only reads the existing connection',async()=>{
 const first=render(<CompanyIntegrations companyId="company-a"/>);await screen.findByText('Conectado');first.unmount();render(<CompanyIntegrations companyId="company-a"/>);await screen.findByText('Conectado');
 expect(requests.filter(r=>['init-connection','disconnect','refresh-qr','disable-bot'].includes(r.action))).toEqual([]);
});
it('keeps late results from the previous company out of the new connection panel',async()=>{
 let finish!:(value:unknown)=>void;
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);if(body.companyId==='company-a'&&body.action==='check-status')return new Promise(resolve=>{finish=resolve});return{ok:true,status:200,json:async()=>body.action==='check-status'?{status:'connected',phone:'2222222222'}:{enabled:false,source:'none'}};}));
 const view=render(<CompanyIntegrations companyId="company-a"/>);await waitFor(()=>expect(finish).toBeTypeOf('function'));
 state.companyId='company-b';view.rerender(<CompanyIntegrations companyId="company-b"/>);await screen.findByText('2222222222');
 await act(async()=>finish({ok:true,status:200,json:async()=>({status:'connected',phone:'1111111111'})}));
 expect(screen.queryByText('1111111111')).not.toBeInTheDocument();expect(screen.getByText('2222222222')).toBeInTheDocument();
 expect(requests.some(r=>r.action==='disconnect')).toBe(false);
});
it.each(['trainer','coordinator','student'])('does not mount the admin vault or query the connection for %s',async role=>{
 state.role=role;render(<CompanyIntegrations companyId="company-a"/>);expect(screen.getByRole('alert')).toHaveTextContent(/administrador/);await act(async()=>{});expect(api.rpc).not.toHaveBeenCalled();expect(requests).toEqual([]);
});
it('denies a different company even to an admin',()=>{render(<CompanyIntegrations companyId="company-b"/>);expect(screen.getByRole('alert')).toBeInTheDocument();expect(api.rpc).not.toHaveBeenCalled()});
it('honors the existing feature gate without opening the connection panel',async()=>{state.hasWhatsApp=false;render(<CompanyIntegrations companyId="company-a"/>);expect(screen.getByText('O WhatsApp não está habilitado para esta empresa.')).toBeInTheDocument();await act(async()=>{});expect(requests).toEqual([])});
