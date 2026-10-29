import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  changeCompanyGovernance, fetchCompanyGovernance, governanceError, GOVERNANCE_PERMISSIONS,
  type GovernanceAction, type GovernanceSnapshot,
} from '@/lib/companyGovernance';

export default function CompanyGovernance() {
  const { user, companyId, loading } = useAuth();
  if (loading) return <p role="status">Carregando sessão…</p>;
  if (!user || !companyId) return <p role="alert">Selecione uma empresa com acesso de equipe.</p>;
  // Remount on tenant OR identity changes: a late response cannot populate another company.
  return <GovernanceEditor key={`${companyId}:${user.id}`} companyId={companyId} actorId={user.id} />;
}

function GovernanceEditor({companyId,actorId}:{companyId:string;actorId:string}) {
  const [snapshot,setSnapshot] = useState<GovernanceSnapshot | null>(null);
  const [busy,setBusy] = useState(false);
  const [needsReload,setNeedsReload] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [recipient,setRecipient] = useState('');
  const [confirmed,setConfirmed] = useState(false);
  const [acceptId,setAcceptId] = useState('');
  const [name,setName] = useState('');
  const [editingRole,setEditingRole] = useState('');
  const [bundleId,setBundleId] = useState('');
  const [trainerId,setTrainerId] = useState('');
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  const reload = useCallback(async()=>{
    if (running.current) return;
    running.current=true;setBusy(true);setError('');setNotice('');
    try {
      const result=await fetchCompanyGovernance(companyId);
      if (alive.current) {setSnapshot(result);setNeedsReload(false);setConfirmed(false);setAcceptId('');}
    } catch(e) {if(alive.current){setError(governanceError(e));setNeedsReload(true);}}
    finally {running.current=false;if(alive.current)setBusy(false);}
  },[companyId]);
  useEffect(()=>{void reload();},[reload]);
  const mutate = async(action:GovernanceAction,payload:Record<string,unknown>)=>{
    if(!snapshot || running.current || needsReload) return;
    running.current=true;setBusy(true);setError('');setNotice('');
    try {
      const saved=await changeCompanyGovernance(companyId,action,payload,snapshot.version);
      if(alive.current){setSnapshot(saved);setConfirmed(false);setAcceptId('');setNotice('Operação salva e confirmada pelo servidor.');}
    } catch(e) {if(alive.current){setError(governanceError(e));setNeedsReload(true);}}
    finally {running.current=false;if(alive.current)setBusy(false);}
  };
  const locked=busy || needsReload || !snapshot?.can_manage;
  const memberName=(id:string|null)=>snapshot?.members.find(m=>m.user_id===id)?.name || id || 'Não definido';
  const eligible=snapshot?.members.filter(m=>m.roles.includes('admin') && m.user_id!==actorId) || [];
  const pending=snapshot?.transfers.some(t=>t.status==='pending');
  return <main className="mx-auto max-w-4xl space-y-6 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Governança da empresa</h1>
      <Button variant="outline" disabled={busy} onClick={()=>void reload()}>Recarregar</Button></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!snapshot && <p role="status">{busy?'Carregando governança…':'Governança indisponível.'}</p>}
    {snapshot && <>
      <Card><CardHeader><CardTitle>Propriedade</CardTitle></CardHeader><CardContent className="space-y-4">
        <p><strong>Proprietário atual:</strong> {memberName(snapshot.owner_id)}</p>
        <p className="text-sm text-muted-foreground">Transfere o cadastro de proprietário da empresa após aceite do destinatário. Os acessos atuais da equipe e dos alunos são preservados. Faturamento e titularidade jurídica não são alterados.</p>
        {snapshot.can_manage && snapshot.owner_id===actorId && <fieldset disabled={locked || pending} className="space-y-3">
          <label className="block">Novo proprietário (administrador existente)
            <select className="mt-1 block w-full rounded border bg-background p-2" value={recipient} onChange={e=>{setRecipient(e.target.value);setConfirmed(false);}}>
              <option value="">Selecione o membro exato</option>
              {eligible.map(m=><option key={m.user_id} value={m.user_id}>{m.name} · {m.user_id}</option>)}
            </select></label>
          {!eligible.length && <p>É necessário outro administrador já vinculado à empresa. Nenhum acesso será concedido automaticamente.</p>}
          {recipient && <p className="break-all">Destinatário: {memberName(recipient)} · {recipient}</p>}
          <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo o destinatário e a solicitação de transferência.</label>
          <Button disabled={!recipient || !confirmed || locked || pending} onClick={()=>void mutate('request_transfer',{recipient_id:recipient})}>Solicitar transferência</Button>
        </fieldset>}
        {pending && <p>Existe uma solicitação pendente. Resolva-a antes de solicitar outra.</p>}
        <p className="text-sm">O pedido aparece aqui para o destinatário; expira em 48 horas.</p>
        {snapshot.transfers.map(t=><div key={t.id} className="space-y-2 rounded border p-3">
          <p>Solicitação para {memberName(t.recipient_id)} · {t.status}</p>
          <p className="break-all text-xs">Membro: {t.recipient_id} · Vence: {new Date(t.expires_at).toLocaleString('pt-BR')}</p>
          {t.status==='pending' && (t.requester_id===actorId || t.recipient_id===actorId) && <div className="flex flex-wrap items-center gap-3">
            {t.recipient_id===actorId && <>
              <label className="flex items-start gap-2"><input type="checkbox" checked={acceptId===t.id} disabled={locked} onChange={e=>setAcceptId(e.target.checked?t.id:'')}/>Confirmo o aceite da propriedade desta empresa.</label>
              <Button disabled={locked || acceptId!==t.id} onClick={()=>void mutate('accept_transfer',{request_id:t.id})}>Aceitar transferência</Button>
            </>}
            <Button variant="outline" disabled={locked} onClick={()=>void mutate('cancel_transfer',{request_id:t.id})}>Cancelar solicitação</Button>
          </div>}
          {t.status==='expired' && (t.requester_id===actorId || t.recipient_id===actorId) && <p className="text-xs">Prazo encerrado; este pedido não pode ser aceito.</p>}
        </div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Papéis personalizados</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Cada papel reúne permissões operacionais existentes. Atribuição disponível para professores da empresa; não altera funções administrativas nem permissões clínicas.</p>
        <p>{GOVERNANCE_PERMISSIONS[0].label}</p>
        {snapshot.can_manage && <fieldset disabled={locked} className="space-y-3">
          <label className="block">Editar papel
            <select className="mt-1 block w-full rounded border bg-background p-2" value={editingRole} onChange={e=>{setEditingRole(e.target.value);setName(snapshot.bundles.find(r=>r.id===e.target.value)?.name || '');}}>
              <option value="">Criar novo</option>{snapshot.bundles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
          <label className="block" htmlFor="governance-role-name">Nome do papel</label>
          <Input id="governance-role-name" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/>
          <Button disabled={locked || !name.trim()} onClick={()=>void mutate('save_role',{role_id:editingRole || undefined,name:name.trim(),permissions:['company_dashboard_full']})}>Salvar papel</Button>
          <label className="block">Papel para atribuir
            <select className="mt-1 block w-full rounded border bg-background p-2" value={bundleId} onChange={e=>setBundleId(e.target.value)}>
              <option value="">Selecione</option>{snapshot.bundles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
          <label className="block">Professor existente
            <select className="mt-1 block w-full rounded border bg-background p-2" value={trainerId} onChange={e=>setTrainerId(e.target.value)}>
              <option value="">Selecione</option>{snapshot.members.filter(m=>m.roles.includes('trainer')).map(m=><option key={m.user_id} value={m.user_id}>{m.name} · {m.user_id}</option>)}
            </select></label>
          <Button disabled={locked || !bundleId || !trainerId} onClick={()=>void mutate('assign_role',{role_id:bundleId,user_id:trainerId})}>Atribuir papel</Button>
        </fieldset>}
        {snapshot.bundles.map(r=><div key={r.id} className="space-y-2 rounded border p-3"><p className="font-semibold">{r.name}</p>
          {snapshot.assignments.filter(a=>a.role_id===r.id).map(a=><div key={a.user_id} className="flex flex-wrap items-center gap-2"><span>{memberName(a.user_id)}</span>
            {snapshot.can_manage && <Button variant="outline" disabled={locked} onClick={()=>void mutate('unassign_role',{role_id:r.id,user_id:a.user_id})}>Remover atribuição de {memberName(a.user_id)}</Button>}</div>)}
          {snapshot.can_manage && <Button variant="outline" disabled={locked} onClick={()=>void mutate('delete_role',{role_id:r.id})}>Excluir papel {r.name}</Button>}
        </div>)}
      </CardContent></Card>
      {snapshot.can_manage && <Card><CardHeader><CardTitle>Histórico de governança</CardTitle></CardHeader><CardContent>
        <p className="text-sm">Versão {snapshot.version} · últimas 50 ações</p>
        <ul className="space-y-2">{snapshot.audit.map(a=><li key={a.id} className="break-words text-sm">{a.action} · {memberName(a.actor_id)} · {new Date(a.created_at).toLocaleString('pt-BR')} · versão {a.version}</li>)}</ul>
      </CardContent></Card>}
    </>}
  </main>;
}
