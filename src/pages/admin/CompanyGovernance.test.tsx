import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  auth: {user:{id:'owner'},companyId:'company',role:'admin',loading:false},
  data: {company_id:'company',owner_id:'owner',version:0,can_manage:true,
    members:[{user_id:'owner',name:'Proprietário',roles:['admin']},{user_id:'recipient',name:'Destinatário',roles:['admin']},{user_id:'trainer',name:'Professor',roles:['trainer']}],
    transfers:[],bundles:[],assignments:[],audit:[]} as Record<string,any>,
  master:{viewingCompany:null as {id:string}|null,contextLoading:false,contextError:null},
  calls:[] as {name:string,args:Record<string,any>}[],
  stale:false,
}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>fixture.master}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>fixture.auth}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:async (name:string,args:Record<string,any>)=>{
  fixture.calls.push({name,args});
  if(args._action==='initialize_owner' && !fixture.stale) fixture.data={...fixture.data,owner_id:'owner',owner_kind:'registered',legacy_owner_id:null,pending_confirmation:false,can_initialize:false,version:fixture.data.version+1};
  if (name==='get_company_governance') return {data:structuredClone(fixture.data),error:null};
  if (fixture.stale) return {data:null,error:{code:'PT409'}};
  if(args._action==='save_role') fixture.data={...fixture.data,version:fixture.data.version+1,bundles:[{id:'bundle',...args._payload}]};
  return {data:structuredClone(fixture.data),error:null};
}}}));
import CompanyGovernance from './CompanyGovernance';
afterEach(()=>{cleanup();fixture.data.bundles=[];fixture.data.transfers=[];fixture.data.version=0;fixture.stale=false;fixture.auth.user.id='owner';fixture.auth.role='admin';fixture.master.viewingCompany=null;fixture.calls=[];});
describe('company governance screen',()=>{
  it('requires explicit confirmation for the eligible legacy owner',async()=>{
    const original={...fixture.data};
    fixture.data={...fixture.data,owner_id:null,owner_kind:'legacy',legacy_owner_id:'owner',pending_confirmation:true,can_initialize:true};
    const view=render(<CompanyGovernance/>);
    expect(await screen.findByRole('button',{name:'Confirmar proprietário'})).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Confirmo o registro/));
    expect(screen.getByRole('button',{name:'Confirmar proprietário'})).toBeEnabled();
    view.unmount();fixture.auth.user.id='recipient';render(<CompanyGovernance/>);
    await screen.findByText(/cadastro pendente/);
    expect(screen.queryByRole('button',{name:'Confirmar proprietário'})).not.toBeInTheDocument();
    fixture.data=original;
  });
  it.each([{actor:'recipient',canManage:true},{actor:'trainer',canManage:false}])('shows the legacy owner to $actor without an initialization control',async({actor,canManage})=>{
    const original={...fixture.data};
    fixture.auth.user.id=actor;
    fixture.data={...fixture.data,owner_id:null,owner_kind:'legacy',legacy_owner_id:'owner',pending_confirmation:true,can_initialize:false,can_manage:canManage};
    render(<CompanyGovernance/>);
    const title=await screen.findByText('Proprietário atual:');
    expect(title.parentElement).toHaveTextContent('Proprietário · Administrador · membro owner');
    expect(screen.getByText(/cadastro pendente/)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Confirmar proprietário'})).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Confirmo o registro/)).not.toBeInTheDocument();
    expect(fixture.calls.filter(call=>call.name==='change_company_governance')).toHaveLength(0);
    fixture.data=original;
  });
  it('initializes only after checkbox and click, then removes the action',async()=>{
    const original={...fixture.data};
    fixture.data={...fixture.data,owner_id:null,owner_kind:'legacy',legacy_owner_id:'owner',pending_confirmation:true,can_initialize:true};
    render(<CompanyGovernance/>);
    await screen.findByRole('button',{name:'Confirmar proprietário'});
    expect(fixture.calls.filter(c=>c.name==='change_company_governance')).toHaveLength(0);
    fireEvent.click(screen.getByLabelText(/Confirmo o registro/));
    fireEvent.click(screen.getByRole('button',{name:'Confirmar proprietário'}));
    await screen.findByText(/Operação salva/);
    expect(fixture.calls.filter(c=>c.name==='change_company_governance')).toEqual([{name:'change_company_governance',args:{_company_id:'company',_action:'initialize_owner',_payload:{expected_legacy_owner_id:'owner'},_expected_version:0}}]);
    expect(screen.queryByRole('button',{name:'Confirmar proprietário'})).not.toBeInTheDocument();
    fixture.data=original;
  });
  it('uses selected master company and requires an explicit selection',async()=>{
    fixture.auth.role='master';
    const view=render(<CompanyGovernance/>);
    expect(screen.getByRole('alert')).toHaveTextContent('Selecione uma empresa');
    expect(fixture.calls).toHaveLength(0);
    fixture.master.viewingCompany={id:'company'};
    view.rerender(<CompanyGovernance/>);
    await screen.findByText('Proprietário atual:');
    expect(fixture.calls[0].args._company_id).toBe('company');
    fixture.master.viewingCompany={id:'other'};
    view.rerender(<CompanyGovernance/>);
    await screen.findByRole('alert');
    expect(screen.queryByText('Proprietário atual:')).not.toBeInTheDocument();
  });
  it('disambiguates homonyms in options and repeats identity in confirmation while submitting IDs',async()=>{
    const original={...fixture.data};
    const first='11111111-1111-4111-8111-111111123456', second='22222222-2222-4222-8222-222222654321';
    fixture.data={...fixture.data,members:[fixture.data.members[0],{user_id:first,name:'Maria',roles:['admin']},{user_id:second,name:'Maria',roles:['admin']}]};
    render(<CompanyGovernance/>);
    const select=await screen.findByLabelText('Novo proprietário (administrador existente)');
    expect(screen.getByRole('option',{name:'Maria · Administrador · membro 11123456'})).toHaveValue(first);
    expect(screen.getByRole('option',{name:'Maria · Administrador · membro 22654321'})).toHaveValue(second);
    fireEvent.change(select,{target:{value:second}});
    expect(screen.getByLabelText(/Confirmo o destinatário/)).toHaveAccessibleName(/Maria · Administrador · membro 22654321/);
    expect(document.body.textContent).not.toContain(first);
    expect(document.body.textContent).not.toContain(second);
    fixture.data=original;
  });
  it('saves a named bundle and reads it back after remount',async()=>{
    const view=render(<CompanyGovernance/>);
    await screen.findByText('Proprietário atual:');
    fireEvent.change(screen.getByLabelText('Nome do papel'),{target:{value:'Visão comercial'}});
    fireEvent.click(screen.getByRole('button',{name:'Salvar papel'}));
    await screen.findByText('Visão comercial',{selector:'p'});
    view.unmount();render(<CompanyGovernance/>);
    await screen.findByText('Visão comercial',{selector:'p'});
    expect(screen.getByText(/Painel completo da empresa/)).toBeInTheDocument();
  });
  it('requires reload after an OCC failure before another mutation',async()=>{
    fixture.stale=true;
    render(<CompanyGovernance/>);
    await screen.findByText('Proprietário atual:');
    fireEvent.change(screen.getByLabelText('Nome do papel'),{target:{value:'Visão'}});
    fireEvent.click(screen.getByRole('button',{name:'Salvar papel'}));
    await screen.findByRole('alert');
    expect(screen.getByRole('button',{name:'Salvar papel'})).toBeDisabled();
    fixture.stale=false;
    fireEvent.click(screen.getByRole('button',{name:'Recarregar'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Salvar papel'})).toBeEnabled());
  });
  it('offers acceptance only to the named recipient and requires confirmation',async()=>{
    fixture.data.transfers=[{id:'request',requester_id:'owner',recipient_id:'recipient',status:'pending',expires_at:'2099-01-01T00:00:00Z'}];
    const view=render(<CompanyGovernance/>);
    await screen.findByText(/Solicitação para/);
    expect(screen.queryByRole('button',{name:'Aceitar transferência'})).not.toBeInTheDocument();
    view.unmount();fixture.auth.user.id='recipient';render(<CompanyGovernance/>);
    expect(await screen.findByRole('button',{name:'Aceitar transferência'})).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Confirmo o aceite/));
    expect(screen.getByRole('button',{name:'Aceitar transferência'})).toBeEnabled();
  });
});
