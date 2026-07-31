// Cadência de Contatos — quem está ficando pra trás sem resposta (leads + alunos ativos).
// Mostra o tempo desde a ÚLTIMA MENSAGEM RECEBIDA no WhatsApp; botão "inativar" tira do countdown.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Timer, MessageSquare, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  cadenceDisplayName,
  cadenceTone,
  filterCadenceByWindow,
  formatCadence,
  type CadenceRow,
  type CadenceWindowDays,
} from "@/lib/contactCadence";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TONE_CLASS: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-600",
  warn: "bg-amber-500/15 text-amber-600",
  late: "bg-destructive/15 text-destructive",
};

export function ContactCadenceCard({ companyId, routePrefix }: { companyId: string | null | undefined; routePrefix?: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CadenceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [windowDays, setWindowDays] = useState<CadenceWindowDays>(90);

  const load = useCallback(async () => {
    if (!companyId) { setRows([]); setLoaded(true); return; }
    const { data, error } = await (supabase as any).rpc("contact_cadence", { _company_id: companyId });
    if (error) { setRows([]); setLoaded(true); return; } // RPC ainda não migrada → card se esconde
    setRows((data || []) as CadenceRow[]);
    setLoaded(true);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const mute = async (row: CadenceRow) => {
    const { error } = await (supabase as any).from("whatsapp_chats").update({ cadence_muted: true }).eq("id", row.chat_id);
    if (error) { toast.error("Não consegui inativar este contato"); return; }
    setRows((r) => r.filter((x) => x.chat_id !== row.chat_id));
    toast.success(`${cadenceDisplayName(row)} saiu da cadência de contatos.`);
  };

  if (!loaded || rows.length === 0) return null;
  const filteredRows = filterCadenceByWindow(rows, windowDays);
  const leads = filteredRows.filter((r) => r.kind === "lead").length;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-primary text-lg">
          <Timer className="h-5 w-5" /> Cadência de Contatos
          <span className="ml-auto flex items-center gap-1.5">
            <Select value={String(windowDays)} onValueChange={(value) => setWindowDays(Number(value) as CadenceWindowDays)}>
              <SelectTrigger className="h-8 w-[132px] rounded-lg text-xs" aria-label="Período da cadência">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Até 1 semana</SelectItem>
                <SelectItem value="14">Até 2 semanas</SelectItem>
                <SelectItem value="30">Até 1 mês</SelectItem>
                <SelectItem value="90">Até 3 meses</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">{filteredRows.length} sem resposta</Badge>
            {leads > 0 && <Badge className="bg-blue-500/15 text-blue-600">{leads} lead(s)</Badge>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {filteredRows.slice(0, 20).map((r) => (
            <div key={r.chat_id} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 py-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold font-mono-data shrink-0", TONE_CLASS[cadenceTone(r.hours_since)])}>
                {formatCadence(r.hours_since)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{cadenceDisplayName(r)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.kind === "lead" ? "Lead (ainda não é aluno)" : `Aluno · ${r.student_status || ""}`} · sem responder
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/${routePrefix || "admin"}/whatsapp-chat`, { state: { chatId: r.chat_id } })}
                className="rounded p-1.5 text-primary hover:bg-muted/60"
                title="Abrir conversa"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => mute(r)}
                className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted/60"
                title="Inativar (tirar do countdown)"
              >
                <BellOff className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {filteredRows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contato sem resposta neste período.</p>
        )}
        {filteredRows.length > 20 && <p className="mt-2 text-[11px] text-muted-foreground">Mostrando os 20 mais atrasados de {filteredRows.length}.</p>}
      </CardContent>
    </Card>
  );
}
