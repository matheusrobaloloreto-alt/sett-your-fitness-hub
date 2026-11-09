import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({company:'a',read:vi.fn(),invoke:vi.fn(),toast:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({role:'admin',companyId:m.company,user:{id:'operator'}})}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>({isViewingCompany:false,viewingCompany:null})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:m.toast})}));
vi.mock('@/hooks/useRolePermissions',()=>({useManageRolePermissions:()=>({isEnabled:()=>false,togglePermission:vi.fn(),loading:false})}));
vi.mock('@/components/master/CompanyOperatorConsole',()=>({default:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:m.invoke},from:(table:string)=>{const filters:Record<string,unknown>={};const q={select:()=>q,order:()=>q,range:()=>q,is:()=>q,gte:()=>q,lte:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},in:(k:string,v:unknown)=>{filters[k]=v;return q;},then:(a:any,b:any)=>Promise.resolve(m.read(table,filters)).then(a,b)};return q;}}}));
import TeamManager from './TeamManager';
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
beforeEach(()=>{m.company='a';m.invoke.mockResolvedValue({data:{emails:[],accounts:[]},error:null});m.read.mockImplementation((table,filters)=>({data:table==='company_members'?[{user_id:filters.company_id}]:table==='user_roles'?[{user_id:(filters.user_id as string[])[0],role:'trainer'}]:table==='profiles'?[{user_id:(filters.user_id as string[])[0],full_name:`Treinador ${(filters.user_id as string[])[0]}`}]:[],error:null}));});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('base members are visible while enrichment is pending; account absence is not inferred',async()=>{
 const pending=deferred();m.invoke.mockReturnValue(pending.promise);render(<TeamManager/>);
 await screen.findByText('Treinador a');expect(screen.queryByText('Nenhum membro na equipe')).toBeNull();expect(screen.queryByText('Carregando equipe...')).toBeNull();
 expect(m.invoke).toHaveBeenCalledWith('manage-team-member',expect.objectContaining({body:expect.objectContaining({action:'list-emails',company_id:'a'})}));
 expect(screen.getByTitle('Alterar senha')).not.toBeDisabled();
 await act(async()=>pending.resolve({data:null,error:{message:'offline'}}));await screen.findByText('Equipe carregada; dados de login e e-mail indisponíveis.');expect(screen.getByTitle('Alterar senha')).not.toBeDisabled();
});
it('ignores late tenant A enrichment after B loads',async()=>{
 const late=deferred();m.invoke.mockImplementation((_name,options)=>options.body.company_id==='a'?late.promise:Promise.resolve({data:{emails:[{user_id:'b',email:'b@example.test'}]},error:null}));
 const view=render(<TeamManager/>);await screen.findByText('Treinador a');m.company='b';view.rerender(<TeamManager/>);await screen.findByText('Treinador b');
 await act(async()=>late.resolve({data:{accounts:[{user_id:'a',auth_exists:false,email:'a@example.test'}]},error:null}));expect(screen.queryByText('Treinador a')).toBeNull();expect(screen.queryByText('a@example.test')).toBeNull();
});
it('membership failure is recoverable and distinct from empty team',async()=>{
 m.read.mockResolvedValue({data:null,error:{message:'offline'}});render(<TeamManager/>);await screen.findByRole('alert');expect(screen.queryByText('Nenhum membro na equipe')).toBeNull();
 m.read.mockResolvedValue({data:[],error:null});fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await screen.findByText('Nenhum membro na equipe');
});
it('roles or profiles error cannot masquerade as empty or unnamed team',async()=>{
 m.read.mockImplementation(table=>({data:table==='company_members'?[{user_id:'a'}]:null,error:table==='user_roles'?{message:'denied'}:null}));render(<TeamManager/>);await screen.findByRole('alert');expect(screen.queryByText('Nenhum membro na equipe')).toBeNull();
});
it('late base membership response cannot repopulate another tenant',async()=>{
 const late=deferred();m.read.mockImplementation((table,filters)=>table==='company_members'&&filters.company_id==='a'?late.promise:({data:[],error:null}));
 const view=render(<TeamManager/>);await waitFor(()=>expect(m.read).toHaveBeenCalled());m.company='b';view.rerender(<TeamManager/>);await screen.findByText('Nenhum membro na equipe');
 await act(async()=>late.resolve({data:[{user_id:'a'}],error:null}));expect(m.invoke).not.toHaveBeenCalled();expect(screen.queryByText('Treinador a')).toBeNull();
});
it('profile failure is an error rather than a fabricated unnamed member',async()=>{
 m.read.mockImplementation(table=>({data:table==='company_members'?[{user_id:'a'}]:table==='user_roles'?[{user_id:'a',role:'trainer'}]:null,error:table==='profiles'?{message:'denied'}:null}));
 render(<TeamManager/>);await screen.findByRole('alert');expect(screen.queryByText('Sem nome')).toBeNull();expect(screen.queryByText('Nenhum membro na equipe')).toBeNull();
});
it('missing company performs no reads and offers no confirmed empty result',()=>{
 m.company='';render(<TeamManager/>);expect(m.read).not.toHaveBeenCalled();expect(m.invoke).not.toHaveBeenCalled();expect(screen.queryByText('Nenhum membro na equipe')).toBeNull();expect(screen.getByText('Selecione uma empresa.')).toBeInTheDocument();
});

it('performance uses total assigned portfolio including inactive students',async()=>{
 m.read.mockImplementation((table,filters)=>({data:table==='company_members'?[{user_id:'a'}]:table==='user_roles'?[{user_id:'a',role:'trainer'}]:table==='profiles'?[{user_id:'a',full_name:'Treinador a'}]:table==='students'?[{id:'s1',full_name:'Ativo',company_id:'a',assigned_trainer_id:'a',status:'active'},{id:'s2',full_name:'Inativo',company_id:'a',assigned_trainer_id:'a',status:'inactive'}]:[],error:null}));
 render(<TeamManager/>);await screen.findByText('Treinador a');
 fireEvent.mouseDown(screen.getByRole('tab',{name:/Performance/}),{button:0,ctrlKey:false});
 await screen.findByText('2 alunos na carteira total');
});
it('performance query failure is displayed as error instead of zero colleagues',async()=>{
 render(<TeamManager/>);await screen.findByText('Treinador a');
 m.read.mockResolvedValue({data:null,error:{message:'offline'}});
 fireEvent.mouseDown(screen.getByRole('tab',{name:/Performance/}),{button:0,ctrlKey:false});
 await screen.findByText('Não foi possível carregar a performance.');expect(screen.queryByText('Nenhum membro encontrado nesta empresa')).toBeNull();
});
it('activity ignores a response from the company that was left',async()=>{
 const late=deferred();const base=m.read.getMockImplementation()!;
 m.read.mockImplementation((table,filters)=>table==='staff_sessions'?late.promise:base(table,filters));
 const view=render(<TeamManager/>);await screen.findByText('Treinador a');
 fireEvent.mouseDown(screen.getByRole('tab',{name:/Atividade/}),{button:0,ctrlKey:false});
 await waitFor(()=>expect(m.read.mock.calls.some(call=>call[0]==='staff_sessions')).toBe(true));
 m.company='b';view.rerender(<TeamManager/>);
 await act(async()=>late.resolve({data:[{user_id:'a',started_at:'2026-11-03T10:00:00Z',last_seen_at:'2026-11-03T11:00:00Z'}],error:null}));
 expect(screen.queryByText('Treinador a')).toBeNull();expect(screen.queryByText('1 acesso(s)')).toBeNull();
});
