import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { FlowCanvas } from "@/components/flow-builder/FlowCanvas";
import { requireDeletedAutomationFlow } from "@/lib/automationGraph";
import { parseReconciliationRows, type ReconciliationRow } from '../../../supabase/functions/_shared/dispatch-reconciliation';

const reconciliationClient = supabase as unknown as {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export function DispatchReconciliationPanel({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [selected, setSelected] = useState<ReconciliationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const generation = useRef(0);
  const acting = useRef(false);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setRows([]); setSelected(null); setFailure('');
    try {
      const result = await reconciliationClient.rpc('inspect_company_dispatch_reconciliation', { _company_id: companyId });
      if (request !== generation.current) return;
      if (result.error) throw new Error('dispatch_status_unavailable');
      setRows(parseReconciliationRows(result.data));
    } catch {
      if (request === generation.current) { setRows([]); setFailure('Não foi possível consultar os envios. Atualize para tentar novamente.'); }
    } finally { if (request === generation.current) setLoading(false); }
  }, [companyId]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
  const act = async (action: 'review' | 'cancel') => {
    if (!selected || acting.current) return;
    acting.current = true; setBusy(true); setFailure('');
    const request = generation.current;
    try {
      const result = await reconciliationClient.rpc('review_company_dispatch_reconciliation', {
        _company_id: companyId, _source: selected.source, _owner_id: selected.id,
        _expected_revision: selected.revision, _expected_updated_at: selected.updated_at, _action: action,
      });
      if (request !== generation.current) return;
      if (result.error) {
        if (result.error.code === 'PT409' || result.error.code === '40001') {
          setSelected(null); await load();
          setFailure('Este caso mudou. Confira o estado atualizado antes de decidir.');
          return;
        }
        throw new Error('dispatch_review_unavailable');
      }
      const ack = result.data as { revision?: number; action?: string; provider_resolution?: string } | null;
      if (ack?.revision !== selected.revision + 1 || ack.action !== action || ack.provider_resolution !== 'pending_technical') {
        throw new Error('dispatch_review_ack_invalid');
      }
      setSelected(null); await load();
    } catch {
      if (request === generation.current) setFailure('Não foi possível confirmar a ação. Atualize e confira o histórico antes de tentar novamente.');
    } finally { acting.current = false; setBusy(false); }
  };
  if (!loading && !failure && rows.length === 0) return null;
  return <section aria-label="Reconciliação de envios" className="mx-4 mb-3 border border-border rounded-md p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-medium">Entregas em revisão {rows.length ? `(${rows.length}${rows.length === 50 ? '+' : ''})` : ''}</h2>
      <Button size="sm" variant="outline" disabled={loading || busy} onClick={() => { setFailure(''); setSelected(null); void load(); }}>Atualizar envios</Button>
    </div>
    {!loading && !failure && rows.length > 0 && <p className="text-muted-foreground">Resultado de envio incerto. Confirmação técnica pendente; reenvio automático suspenso.</p>}
    {loading && <p role="status">Consultando envios...</p>}
    {failure && <p role="alert">{failure}</p>}
    <ul className="mt-2 max-h-48 overflow-y-auto space-y-2">{rows.map(row => <li key={`${row.source}:${row.id}`} className="flex flex-wrap justify-between items-center gap-2">
      <span className="break-words">{row.name}{row.last_action === 'cancel' ? ' — envio suspenso' : row.last_action === 'review' ? ' — revisão registrada' : ''}</span>
      <Button size="sm" variant="outline" disabled={loading || busy} onClick={() => { setSelected(row); setFailure(''); }}>Inspecionar</Button>
    </li>)}</ul>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Revisar entrega</DialogTitle><DialogDescription>Inspecione os registros antes de suspender ou registrar a revisão.</DialogDescription></DialogHeader>
        {selected && <>
          <p>{selected.name}</p>
          <p>Recibos registrados: {selected.ack_count}. Tentativas sem confirmação: {selected.unknown_count}.</p>
          <p>A revisão registra a necessidade de evidência técnica. Suspender impede a continuidade deste envio e não confirma a entrega.</p>
          {selected.source === 'intercycle' && <p>O link interciclos existente continua válido para resposta, dentro do seu prazo e das permissões originais.</p>}
          {failure && <p role="alert">{failure}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy || selected.last_action === 'review'} onClick={() => void act('review')}>Registrar revisão</Button>
            <Button variant="destructive" disabled={busy || selected.last_action === 'cancel'} onClick={() => void act('cancel')}>Suspender envio</Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}

type Flow = {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  created_at: string;
  company_id?: string;
};

const triggerLabels: Record<string, string> = {
  manual: "Manual",
  new_student: "Primeiro contato (nao aluno)",
  weekly_contact: "Contato semanal (com consentimento)",
  no_workout_7d: "Sem Treino (7 dias)",
  payment_pending: "Pagamento Pendente",
};

export default function WhatsAppAutomation() {
  const { user, role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();

  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowTrigger, setNewFlowTrigger] = useState("manual");

  const loadFlows = useCallback(async () => {
    if (!effectiveCompanyId) { setFlows([]); return; }
    let query = supabase
      .from("automation_flows")
      .select("*");

    if (effectiveCompanyId) {
      query = query.eq("company_id", effectiveCompanyId);
    }

    const { data } = await query.order("created_at", { ascending: false });
    if (data) setFlows(data as Flow[]);
  }, [effectiveCompanyId]);

  useEffect(() => { loadFlows(); }, [loadFlows]);

  const handleCreateFlow = async () => {
    if (!newFlowName.trim()) return;
    if (!effectiveCompanyId) {
      toast.error("Selecione uma empresa para criar fluxo");
      return;
    }

    const { error } = await supabase.from("automation_flows").insert({
      company_id: effectiveCompanyId,
      name: newFlowName.trim(),
      trigger_type: newFlowTrigger,
      created_by: user?.id,
    } as any);
    if (error) { toast.error("Erro ao criar fluxo"); return; }
    toast.success("Fluxo criado");
    setCreateOpen(false);
    setNewFlowName("");
    setNewFlowTrigger("manual");
    loadFlows();
  };

  const handleToggleActive = async (flow: Flow) => {
    const newActive = !flow.is_active;
    let query = supabase.from("automation_flows").update({ is_active: newActive } as any).eq("id", flow.id);
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    await query;

    // Se desativando, cancelar todas as sessões pendentes imediatamente
    if (!newActive) {
      await supabase.from("flow_sessions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() } as any)
        .eq("flow_id", flow.id)
        .eq("status", "waiting_response");
    }

    loadFlows();
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!effectiveCompanyId) { toast.error("Selecione uma empresa para excluir fluxo"); return; }
    try {
      const result = await supabase.from("automation_flows").delete().eq("id", flowId).eq("company_id", effectiveCompanyId).select("id");
      requireDeletedAutomationFlow(result, flowId);
    } catch {
      toast.error("Não foi possível confirmar a exclusão do fluxo");
      return;
    }
    if (selectedFlowId === flowId) { setSelectedFlowId(null); }
    loadFlows();
    toast.success("Fluxo excluído");
  };

  const selectedFlow = flows.find(f => f.id === selectedFlowId);

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-wide">Automação</h1>
            <p className="text-muted-foreground font-sans text-sm">Editor visual de fluxos de automação</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Novo Fluxo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar Fluxo de Automação</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Fluxo</Label>
                  <Input value={newFlowName} onChange={e => setNewFlowName(e.target.value)} placeholder="Ex: Boas-vindas novo aluno" />
                </div>
                <div className="space-y-2">
                  <Label>Gatilho</Label>
                  <Select value={newFlowTrigger} onValueChange={setNewFlowTrigger}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(triggerLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateFlow} disabled={!newFlowName.trim()}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {effectiveCompanyId && <DispatchReconciliationPanel key={effectiveCompanyId} companyId={effectiveCompanyId} />}
        <div className="flex flex-1 border border-border rounded-lg overflow-hidden bg-card min-h-0">
          {/* Flows list */}
          <div className="w-72 border-r border-border flex flex-col shrink-0">
            <div className="p-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fluxos</p>
            </div>
            <ScrollArea className="flex-1">
              {flows.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Nenhum fluxo criado</div>
              ) : (
                flows.map(flow => (
                  <button
                    key={flow.id}
                    onClick={() => setSelectedFlowId(flow.id)}
                    className={`w-full text-left p-3 border-b border-border hover:bg-muted/50 transition-colors flex items-center gap-3 ${selectedFlowId === flow.id ? "bg-primary/10" : ""}`}
                  >
                    <Zap className={`h-4 w-4 shrink-0 ${flow.is_active ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-2">{flow.name}</p>
                      <p className="text-xs text-muted-foreground">{triggerLabels[flow.trigger_type] || flow.trigger_type}</p>
                    </div>
                    <Badge variant={flow.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
                      {flow.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>

          {/* Flow visual editor */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedFlow ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-2">
                  <Zap className="h-12 w-12 mx-auto opacity-30" />
                  <p className="text-sm">Selecione um fluxo para editar</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{selectedFlow.name}</h2>
                    <p className="text-xs text-muted-foreground">Gatilho: {triggerLabels[selectedFlow.trigger_type]}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="flow-active" className="text-xs text-muted-foreground">Ativo</Label>
                      <Switch id="flow-active" checked={selectedFlow.is_active} onCheckedChange={() => handleToggleActive(selectedFlow)} />
                    </div>
                    <Button variant="destructive" size="sm" className="gap-1" onClick={() => handleDeleteFlow(selectedFlow.id)}>
                      <Trash2 className="h-3.5 w-3.5" />Excluir
                    </Button>
                  </div>
                </div>

                <FlowCanvas flowId={selectedFlow.id} companyId={selectedFlow.company_id} triggerType={selectedFlow.trigger_type} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
