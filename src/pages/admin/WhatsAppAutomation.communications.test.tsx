import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DispatchReconciliationPanel } from './WhatsAppAutomation';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('@/components/flow-builder/FlowCanvas',()=>({FlowCanvas:()=>null}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({})}));
vi.mock('@/contexts/MasterContext',()=>({useMaster:()=>({})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const row={id:'case',source:'intercycle',name:'Anamnese interciclos',status:'failed',updated_at:'2026-10-27T12:00:00Z',revision:0,last_action:null,ack_count:0,unknown_count:1};
const result=(data:unknown,error:unknown=null)=>({data,error});

it('inspects evidence and records review with exact tenant/version; reloads authoritative state',async()=>{
  mocks.rpc.mockResolvedValueOnce(result([row])).mockResolvedValueOnce(result({revision:1,action:'review',provider_resolution:'pending_technical'})).mockResolvedValueOnce(result([{...row,revision:1,last_action:'review'}]));
  render(<DispatchReconciliationPanel companyId="company-a"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Inspecionar'}));
  expect(screen.getByText(/Recibos registrados: 0/)).toHaveTextContent('Tentativas sem confirmação: 1');
  expect(screen.getByText(/link interciclos existente continua válido/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Registrar revisão'}));
  await screen.findByText(/revisão registrada/);
  expect(mocks.rpc).toHaveBeenNthCalledWith(2,'review_company_dispatch_reconciliation',{
    _company_id:'company-a',_source:'intercycle',_owner_id:'case',_expected_revision:0,_expected_updated_at:row.updated_at,_action:'review',
  });
});
it('cancel has a visible inspect step, preserves links, and no resend/force ACK control',async()=>{
  mocks.rpc.mockResolvedValueOnce(result([row])).mockResolvedValueOnce(result({revision:1,action:'cancel',provider_resolution:'pending_technical'})).mockResolvedValueOnce(result([{...row,revision:1,last_action:'cancel'}]));
  render(<DispatchReconciliationPanel companyId="company-a"/>);
  expect(screen.queryByRole('button',{name:'Suspender envio'})).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button',{name:'Inspecionar'}));
  expect(screen.queryByRole('button',{name:/reenviar|confirmar entrega/i})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Suspender envio'}));
  await screen.findByText(/envio suspenso/);
  expect(mocks.rpc.mock.calls[1][1]._action).toBe('cancel');
});
it('OCC conflict reloads without retrying the mutation or success acknowledgement',async()=>{
  mocks.rpc.mockResolvedValueOnce(result([row])).mockResolvedValueOnce(result(null,{code:'PT409'})).mockResolvedValueOnce(result([{...row,revision:2,last_action:'review'}]));
  render(<DispatchReconciliationPanel companyId="company-a"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Inspecionar'}));
  fireEvent.click(screen.getByRole('button',{name:'Registrar revisão'}));
  await screen.findByText('Este caso mudou. Confira o estado atualizado antes de decidir.');
  expect(mocks.rpc.mock.calls.filter(([n])=>n==='review_company_dispatch_reconciliation')).toHaveLength(1);
});
it('uncertain write response requires readback instead of showing success',async()=>{
  mocks.rpc.mockResolvedValueOnce(result([row])).mockResolvedValueOnce(result({revision:99,action:'review'}));
  render(<DispatchReconciliationPanel companyId="company-a"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Inspecionar'}));
  fireEvent.click(screen.getByRole('button',{name:'Registrar revisão'}));
  await waitFor(()=>expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Não foi possível confirmar a ação'));
  expect(screen.getByRole('button',{name:'Registrar revisão'})).not.toBeDisabled();
});
it('ignores a previous company response after unmount and replacement',async()=>{
  let old:(v:unknown)=>void=()=>{};
  mocks.rpc.mockReturnValueOnce(new Promise(r=>{old=r;})).mockResolvedValueOnce(result([]));
  const first=render(<DispatchReconciliationPanel companyId="company-a"/>); first.unmount();
  render(<DispatchReconciliationPanel companyId="company-b"/>);
  old(result([row]));
  await waitFor(()=>expect(screen.queryByText('Anamnese interciclos')).not.toBeInTheDocument());
});
