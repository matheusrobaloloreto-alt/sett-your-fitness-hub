import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { Element.prototype.scrollIntoView = originalScrollIntoView; });
const m=vi.hoisted(()=>({ company:'a', hasWhatsApp:true, featureLoading:false, read:vi.fn(), rpc:vi.fn(), calls:[] as {table:string;filters:Record<string,unknown>}[], toast:vi.fn() }));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({role:'admin',companyId:m.company,user:{id:'operator'}})}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>({isViewingCompany:false,viewingCompany:null})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:m.toast})}));
vi.mock('@/hooks/useCompanyFeatures',()=>({useCompanyFeatures:()=>({hasWhatsApp:m.hasWhatsApp,loading:m.featureLoading,error:null})}));
vi.mock('@/hooks/useCompanyExperiencePolicy',()=>({useCompanyExperiencePolicy:()=>({policy:{},error:null})}));
vi.mock('@/components/BnitoFloatingAssistant',()=>({BnitoContextButton:()=>null}));
vi.mock('@/components/admin/StudentChatButton',()=>({StudentChatButton:()=> <button>Abrir conversa</button>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:m.rpc,from:(table:string)=>{const filters:Record<string,unknown>={};const q={select:()=>q,order:()=>q,range:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},in:()=>q,then:(a:any,b:any)=>{m.calls.push({table,filters});return Promise.resolve(m.read(table,filters)).then(a,b);}};return q;}}}));
import Portfolio from './Portfolio';
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
const student=(name:string)=>({id:name,company_id:m.company,full_name:name,status:'active',assigned_trainer_id:null});
const mount=()=>render(<MemoryRouter><Portfolio/></MemoryRouter>);
beforeEach(()=>{m.company='a';m.hasWhatsApp=true;m.featureLoading=false;m.calls=[];m.read.mockResolvedValue({data:[],error:null});m.rpc.mockResolvedValue({data:[],error:null});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('query error is not zero or empty; retry recovers actual students',async()=>{
 m.read.mockResolvedValue({data:null,error:{message:'offline'}});mount();await screen.findByRole('alert');
 expect(screen.queryByText('0 aluno(s)')).toBeNull();expect(screen.queryByText('Nenhum aluno disponível nesta empresa.')).toBeNull();
 m.read.mockImplementation(table=>({data:table==='students'?[student('Aluno recuperado')]:[],error:null}));
 fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await screen.findByText('Aluno recuperado');expect(screen.getByText('1 aluno(s)')).toBeInTheDocument();
});
it('successful empty response is an explicit real zero',async()=>{mount();await screen.findByText('Nenhum aluno disponível nesta empresa.');expect(screen.getByText('0 aluno(s)')).toBeInTheDocument();});
it('pending request has no false zero; tenant switch ignores old response',async()=>{
 const late=deferred();m.read.mockImplementation((table,filters)=>table==='students'&&filters.company_id==='a'?late.promise:{data:table==='students'?[student('Aluno B')]:[],error:null});
 const view=mount();await waitFor(()=>expect(m.calls.length).toBeGreaterThan(0));expect(screen.queryByText('0 aluno(s)')).toBeNull();
 m.company='b';view.rerender(<MemoryRouter><Portfolio/></MemoryRouter>);await screen.findByText('Aluno B');
 await act(async()=>late.resolve({data:[student('Aluno A')],error:null}));expect(screen.queryByText('Aluno A')).toBeNull();
});
it('complementary read errors are not converted into missing enrollment or cycle',async()=>{
 m.read.mockImplementation(table=>({data:table==='students'?[student('Aluno')]:null,error:table==='enrollments'?{message:'offline'}:null}));mount();await screen.findByRole('alert');expect(screen.queryByText('1 aluno(s)')).toBeNull();
});
it('missing company makes no student read and no successful zero',()=>{
 m.company='';mount();expect(m.read).not.toHaveBeenCalled();expect(screen.queryByText('0 aluno(s)')).toBeNull();expect(screen.getByText('Selecione uma empresa.')).toBeInTheDocument();
});
it('trainer selection remains explicit across failure and retry, and Todos removes the trainer filter',async()=>{
 m.rpc.mockImplementation(name=>Promise.resolve({data:name==='get_company_student_staff_directory'?[{user_id:'trainer',full_name:'Professor sintético',roles:['trainer']}]:[],error:null}));
 mount();await screen.findByText('Nenhum aluno disponível nesta empresa.');
 fireEvent.keyDown(screen.getByRole('combobox'),{key:'ArrowDown'});
 m.read.mockResolvedValue({data:null,error:{message:'offline'}});
 fireEvent.click(await screen.findByRole('option',{name:/Professor sintético/}));
 await screen.findByRole('alert');
 m.read.mockResolvedValue({data:[],error:null});
 fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
 await screen.findByText('Nenhum aluno disponível nesta empresa.');
 await waitFor(()=>expect(m.calls.some(call=>call.filters.assigned_trainer_id==='trainer')).toBe(true));
 expect(screen.getAllByText(/Professor sintético/).length).toBeGreaterThan(0);
 fireEvent.keyDown(screen.getByRole('combobox'),{key:'ArrowDown'});
 fireEvent.click(await screen.findByRole('option',{name:'Todos os alunos'}));
 await waitFor(()=>expect(m.calls.filter(call=>call.table==='students').slice(-1)[0]?.filters.assigned_trainer_id).toBeUndefined());
});

it('shows the current contracted plan and current portfolio trainer despite a conflicting enrollment trainer', async () => {
 const learner = { ...student('Aluno sintético'), assigned_trainer_id: 'portfolio-trainer' };
 const contract = { student_id: learner.id, company_id: 'a', status: 'active', trainer_id: 'enrollment-trainer' };
 m.rpc.mockImplementation(async name => ({ data: name === 'get_company_student_staff_directory' ? [
  { user_id: 'portfolio-trainer', full_name: 'Pessoa da Carteira', roles: ['trainer'] },
  { user_id: 'enrollment-trainer', full_name: 'Pessoa da Matrícula', roles: ['trainer'] },
 ] : [], error: null }));
 m.read.mockImplementation(table => ({ data: table === 'students' ? [learner] : table === 'enrollments' ? [
  { ...contract, id: 'expired', plan_id: 'expired', start_date: '2000-01-01', end_date: '2000-12-31' },
  { ...contract, id: 'current', plan_id: 'current', start_date: '2020-01-01', end_date: '2100-12-31' },
  { ...contract, id: 'future', plan_id: 'future', start_date: '2101-01-01', end_date: '2101-12-31' },
 ] : table === 'plans' ? [{ id: 'current', company_id: 'a', name: 'Contrato sintético' }] : [], error: null }));
 mount();
 expect(await screen.findByText('Plano contratado vigente: Contrato sintético')).toBeInTheDocument();
 expect(screen.getByText('Professor da carteira: Pessoa da Carteira')).toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Ativos (1)' })).toBeInTheDocument();
 expect(m.calls.some(call => call.table === 'enrollments' && call.filters.company_id === 'a')).toBe(true);
});


it.each(['whatsapp_chats', 'contact_cadence'])('retains roster and counts when %s fails', async source => {
 m.read.mockImplementation(table => ({
  data: table === 'students' ? [student('Aluno com falha de WhatsApp')] : [],
  error: table === source ? { message: 'offline' } : null,
 }));
 if (source === 'contact_cadence') m.rpc.mockImplementation(async name => {
  if (name === 'contact_cadence') throw new Error('offline');
  return { data: [], error: null };
 });
 mount();
 expect(await screen.findByText('Aluno com falha de WhatsApp')).toBeInTheDocument();
 expect(await screen.findByText('Alguns dados do WhatsApp estão indisponíveis.')).toBeInTheDocument();
 expect(screen.getByText('1 aluno(s)')).toBeInTheDocument();
 expect(screen.queryByText(/sem resposta há/)).toBeNull();
});

it.each(['denied', 'loading'])('skips WhatsApp reads and chat while entitlement is %s', async state => {
 m.hasWhatsApp=state === 'loading';
 m.featureLoading=state === 'loading';
 m.read.mockImplementation(table => ({ data: table === 'students' ? [student('Aluno sem WhatsApp')] : [], error: null }));
 mount();
 expect(await screen.findByText('Aluno sem WhatsApp')).toBeInTheDocument();
 expect(screen.getByText('1 aluno(s)')).toBeInTheDocument();
 expect(screen.queryByRole('button', { name: 'Abrir conversa' })).toBeNull();
 expect(m.calls.some(call => call.table === 'whatsapp_chats')).toBe(false);
 expect(m.rpc).not.toHaveBeenCalledWith('contact_cadence', expect.anything());
});

it('loads roster before a WhatsApp read resolves', async () => {
 const late = deferred();
 m.read.mockImplementation(table => table === 'whatsapp_chats' ? late.promise : {
  data: table === 'students' ? [student('Aluno com WhatsApp pendente')] : [], error: null,
 });
 mount();
 expect(await screen.findByText('Aluno com WhatsApp pendente')).toBeInTheDocument();
 expect(screen.getByText('1 aluno(s)')).toBeInTheDocument();
 await act(async () => late.resolve({ data: [], error: null }));
 expect(await screen.findByRole('button', { name: 'Abrir conversa' })).toBeInTheDocument();
});
