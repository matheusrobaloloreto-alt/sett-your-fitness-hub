import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  auth: {user:{id:'owner'},companyId:'company',role:'admin',loading:false},
  data: {company_id:'company',owner_id:'owner',version:0,can_manage:true,
    members:[{user_id:'owner',name:'Proprietário',roles:['admin']},{user_id:'recipient',name:'Destinatário',roles:['admin']},{user_id:'trainer',name:'Professor',roles:['trainer']}],
    transfers:[],bundles:[],assignments:[],audit:[]} as Record<string,any>,
  stale:false,
}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>fixture.auth}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:async (name:string,args:Record<string,any>)=>{
  if (name==='get_company_governance') return {data:structuredClone(fixture.data),error:null};
  if (fixture.stale) return {data:null,error:{code:'PT409'}};
  if(args._action==='save_role') fixture.data={...fixture.data,version:fixture.data.version+1,bundles:[{id:'bundle',...args._payload}]};
  return {data:structuredClone(fixture.data),error:null};
}}}));
import CompanyGovernance from './CompanyGovernance';
afterEach(()=>{cleanup();fixture.data.bundles=[];fixture.data.transfers=[];fixture.data.version=0;fixture.stale=false;fixture.auth.user.id='owner';});
describe('company governance screen',()=>{
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
