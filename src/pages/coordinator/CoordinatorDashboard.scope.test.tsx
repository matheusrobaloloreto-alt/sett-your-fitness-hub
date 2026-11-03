import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: { role: 'master', companyId: 'global', user: { id: 'operator' } }, master: { isViewingCompany: true, viewingCompany: { id: 'a' } as {id:string}|null }, read: vi.fn(), rpc: vi.fn(), insert: vi.fn(), toast: vi.fn(), calls: [] as {table:string;filters:Record<string,unknown>}[] }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => m.auth }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => m.master }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({toast: m.toast}) }));
vi.mock('@/components/BnitoFloatingAssistant', () => ({ BnitoContextButton: () => null }));
vi.mock('@/components/DashboardAlerts', () => ({ DashboardAlerts: () => null }));
vi.mock('@/components/dashboard/RenewalsAndCyclesPanel', () => ({ RenewalsAndCyclesPanel: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc, from: (table:string) => {
 const filters:Record<string,unknown> = {}; const q = { insert: m.insert, select: () => q, eq: (k:string,v:unknown) => {filters[k]=v;return q;}, order: () => q, then: (resolve:any,reject:any) => {m.calls.push({table,filters});return Promise.resolve(m.read(table,filters)).then(resolve,reject);} }; return q;
} } }));
import CoordinatorDashboard from './CoordinatorDashboard';
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
beforeEach(() => { m.calls=[];m.auth.user={id:'operator'};m.insert.mockResolvedValue({data:null,error:null});m.auth.role='master';m.master.isViewingCompany=true;m.master.viewingCompany={id:'a'};m.rpc.mockResolvedValue({data:[],error:null});m.read.mockImplementation((table,filters) => ({data:table==='students'?[{id:filters.company_id,full_name:`Aluno ${filters.company_id}`,status:'pending'}]:[],error:null})); });
afterEach(() => {cleanup();vi.clearAllMocks();});
it('master reads only selected tenant and scopes plans and staff explicitly', async () => {
 render(<CoordinatorDashboard/>);await screen.findByText('Aluno a');
 expect(m.calls.every(call=>call.filters.company_id==='a')).toBe(true);
 expect(m.calls.map(call=>call.table)).toEqual(expect.arrayContaining(['students','plans']));
 expect(m.rpc).toHaveBeenCalledWith('get_company_student_staff_directory',{_company_id:'a'});
});
it('ordinary coordinator uses its company; missing master context never falls back globally', async () => {
 m.auth.role='coordinator';m.auth.companyId='coordinator-company';const view=render(<CoordinatorDashboard/>);await screen.findByText('Aluno coordinator-company');
 m.auth.role='master';m.master.isViewingCompany=false;m.master.viewingCompany=null;view.rerender(<CoordinatorDashboard/>);
 expect(screen.getByText('Selecione uma empresa para consultar as matrículas.')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Novo Aluno'})).toBeDisabled();
 expect(m.calls.some(call=>call.filters.company_id==='global')).toBe(false);
});
it('discards late tenant A response after B completes', async () => {
 const late=deferred();m.read.mockImplementation((table,filters)=>table==='students'&&filters.company_id==='a'?late.promise:{data:table==='students'?[{id:'b',full_name:'Aluno b',status:'pending'}]:[],error:null});
 const view=render(<CoordinatorDashboard/>);await waitFor(()=>expect(m.calls).toHaveLength(2));
 m.master.viewingCompany={id:'b'};view.rerender(<CoordinatorDashboard/>);await screen.findByText('Aluno b');
 await act(async()=>late.resolve({data:[{id:'a',full_name:'Aluno a',status:'pending'}],error:null}));
 expect(screen.queryByText('Aluno a')).toBeNull();expect(screen.getByText('Aluno b')).toBeInTheDocument();
});
it('failed query is recoverable and does not present a successful zero', async () => {
 m.read.mockResolvedValue({data:null,error:{message:'offline'}});render(<CoordinatorDashboard/>);
 await screen.findByRole('alert');expect(screen.queryByText('Nenhum aluno nesta empresa.')).toBeNull();
 m.read.mockResolvedValue({data:[],error:null});fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await screen.findByText('Nenhum aluno nesta empresa.');
});
it('initial missing tenant makes no query at all',()=>{
 m.master.isViewingCompany=false;m.master.viewingCompany=null;render(<CoordinatorDashboard/>);
 expect(m.read).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();expect(screen.queryByText('Nenhum aluno nesta empresa.')).toBeNull();
});

const originalScroll = Element.prototype.scrollIntoView;
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { Element.prototype.scrollIntoView = originalScroll; });

async function startWrite(action: 'insert' | 'renew') {
  await screen.findByText('Aluno a');
  if (action === 'insert') {
    fireEvent.click(screen.getByRole('button', { name: 'Novo Aluno' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Novo sintético' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(m.insert).toHaveBeenCalledTimes(1));
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Matricular' }));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: /Plano sintético/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Liberar para o Treinador' }));
    await waitFor(() => expect(m.rpc.mock.calls.some(call => call[0] === 'replace_student_enrollment')).toBe(true));
  }
}
function writeFixture() {
  const ack = deferred();
  m.insert.mockReturnValue(ack.promise);
  m.rpc.mockImplementation(name => name === 'replace_student_enrollment' ? ack.promise : Promise.resolve({data:[],error:null}));
  m.read.mockImplementation((table, filters) => ({data:table==='students'?[{id:filters.company_id,full_name:`Aluno ${filters.company_id}`,status:'pending'}]:[{id:'plan',name:'Plano sintético',duration_weeks:6}],error:null}));
  return ack;
}
it.each(['insert','renew'] as const)('%s: late ACK from A cannot start a reload or cancel pending B', async action => {
  const ack = writeFixture(); const view = render(<CoordinatorDashboard/>); await startWrite(action);
  const b = deferred(); const base = m.read.getMockImplementation()!;
  m.read.mockImplementation((table, filters) => table==='students' && filters.company_id==='b' ? b.promise : base(table,filters));
  m.master.viewingCompany={id:'b'};view.rerender(<CoordinatorDashboard/>);
  await waitFor(()=>expect(m.calls.some(call=>call.filters.company_id==='b')).toBe(true));
  const readsBeforeAck = m.calls.length;
  await act(async()=>ack.resolve({data:[{enrollment_id:'enrollment-a'}],error:null}));
  expect(m.calls).toHaveLength(readsBeforeAck);expect(m.toast).not.toHaveBeenCalled();
  await act(async()=>b.resolve({data:[{id:'b',full_name:'Aluno b',status:'pending'}],error:null}));
  await screen.findByText('Aluno b');expect(screen.queryByText('Aluno a')).toBeNull();
});
it.each(['insert','renew'] as const)('%s: late ACK after actor change is ignored', async action => {
  const ack=writeFixture();const view=render(<CoordinatorDashboard/>);await startWrite(action);
  m.auth.user={id:'other-actor'};view.rerender(<CoordinatorDashboard/>);
  await act(async()=>{});const reads=m.calls.length;
  await act(async()=>ack.resolve({data:[{enrollment_id:'enrollment-a'}],error:null}));
  expect(m.calls).toHaveLength(reads);expect(m.toast).not.toHaveBeenCalled();
});
it.each(['insert','renew'] as const)('%s: late ACK after unmount has no toast or reload', async action => {
  const ack=writeFixture();const view=render(<CoordinatorDashboard/>);await startWrite(action);view.unmount();const reads=m.calls.length;
  await act(async()=>ack.resolve({data:[{enrollment_id:'enrollment-a'}],error:null}));
  expect(m.calls).toHaveLength(reads);expect(m.toast).not.toHaveBeenCalled();
});
it.each(['insert','renew'] as const)('%s: current ACK still refreshes its own tenant', async action => {
  const ack=writeFixture();render(<CoordinatorDashboard/>);await startWrite(action);const reads=m.calls.length;
  await act(async()=>ack.resolve({data:[{enrollment_id:'enrollment-a'}],error:null}));
  await waitFor(()=>expect(m.calls.length).toBeGreaterThan(reads));expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({title:action==='insert'?'Aluno cadastrado!':'Aluno matriculado e liberado!'}));
});
