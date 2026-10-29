import {act,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {AutomationRecoveryStatus} from './AutomationRecoveryStatus';

const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
beforeEach(()=>rpc.mockReset());

describe('read-only uncertain dispatch status',()=>{
  it('shows uncertainty without an unsafe resend command',async()=>{
    rpc.mockResolvedValue({data:[{id:'attempt-a',source:'flow',name:'Contato semanal',updated_at:'2026-10-26T12:00:00Z'}],error:null});
    render(<AutomationRecoveryStatus companyId="company-a"/>);
    expect(await screen.findByText('Contato semanal')).toBeInTheDocument();
    expect(screen.getByText(/Reenvio automático suspenso/)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button',{name:'Atualizar confirmações'})).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('get_company_dispatch_uncertainties',{_company_id:'company-a'});
  });
  it('shows read failure rather than claiming an empty healthy queue',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'42501'}});
    render(<AutomationRecoveryStatus companyId="company-a"/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar');
  });
  it('ignores old-company status arriving after a company switch',async()=>{
    let resolveOld!:(value:unknown)=>void;
    rpc.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
    rpc.mockResolvedValue({data:[{id:'b',source:'intercycle',name:'Current company',updated_at:null}],error:null});
    const {rerender}=render(<AutomationRecoveryStatus companyId="company-a"/>);
    rerender(<AutomationRecoveryStatus companyId="company-b"/>);
    await screen.findByText('Current company');
    await act(async()=>resolveOld({data:[{id:'a',source:'flow',name:'Foreign old company',updated_at:null}],error:null}));
    await waitFor(()=>expect(screen.queryByText('Foreign old company')).not.toBeInTheDocument());
    expect(screen.getByText('Current company')).toBeInTheDocument();
  });
});
