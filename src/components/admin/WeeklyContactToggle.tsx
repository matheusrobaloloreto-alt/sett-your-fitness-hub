// Consent ledger for proactive weekly contact. The legacy student boolean is a
// cache only; the RPC appends evidence and updates it atomically.
import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageCircleHeart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function WeeklyContactToggle({ studentId }: { studentId: string }) {
  const activeStudentIdRef = useRef(studentId);
  activeStudentIdRef.current = studentId;
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [policyVersion, setPolicyVersion] = useState<string | null>(null);
  const [statusStudentId, setStatusStudentId] = useState<string | null>(null);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [attested, setAttested] = useState(false);

  useEffect(() => {
    let active = true;
    setEnabled(false);
    setPolicyVersion(null);
    setStatusStudentId(null);
    setGrantDialogOpen(false);
    setAttested(false);
    setSaving(false);
    setLoading(true);
    (async () => {
      const status = await supabase.rpc("weekly_contact_consent_status", { _student_id: studentId });
      if (!active || activeStudentIdRef.current !== studentId) return;
      const payload = !status.error && status.data && typeof status.data === "object" && !Array.isArray(status.data)
        ? status.data as { eligible?: boolean; policy_version?: string }
        : null;
      const currentPolicy = typeof payload?.policy_version === "string" ? payload.policy_version : null;
      setPolicyVersion(currentPolicy);
      setEnabled(!!currentPolicy && payload?.eligible === true);
      setStatusStudentId(studentId);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [studentId]);

  const isCurrentStudent = statusStudentId === studentId;

  const persistConsent = async (next: boolean) => {
    const originStudentId = studentId;
    const originPolicyVersion = isCurrentStudent ? policyVersion : null;
    if (!originPolicyVersion) {
      toast.error("Política de consentimento indisponível");
      return;
    }
    setEnabled(next);
    setSaving(true);
    const { error } = await supabase.rpc("record_weekly_contact_consent", {
      _student_id: originStudentId,
      _event_type: next ? "granted" : "revoked",
      _policy_version: originPolicyVersion,
      _source: "staff_confirmed_student",
    });
    if (activeStudentIdRef.current !== originStudentId) return;
    setSaving(false);
    if (error) {
      setEnabled(!next);
      toast.error("Não foi possível salvar");
    } else {
      setGrantDialogOpen(false);
      setAttested(false);
      toast.success(next ? "Contato semanal ativado" : "Contato semanal desativado");
    }
  };

  const requestToggle = (next: boolean) => {
    if (next) {
      setAttested(false);
      setGrantDialogOpen(true);
      return;
    }
    void persistConsent(false);
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <MessageCircleHeart className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`wc-${studentId}`} className="text-sm font-medium cursor-pointer">Contato semanal</Label>
          <Switch
            id={`wc-${studentId}`}
            checked={isCurrentStudent && enabled}
            disabled={!isCurrentStudent || loading || saving}
            onCheckedChange={requestToggle}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ative somente após o aluno autorizar mensagens proativas no WhatsApp. A autorização pode ser revogada a qualquer momento.
        </p>
      </div>
      <AlertDialog open={isCurrentStudent && grantDialogOpen} onOpenChange={(open) => {
        setGrantDialogOpen(open);
        if (!open) setAttested(false);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar autorização do aluno</AlertDialogTitle>
            <AlertDialogDescription>
              O contato semanal envia mensagens proativas pelo WhatsApp. Só prossiga se o aluno autorizou essa finalidade.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            <Checkbox
              id={`wc-attest-${studentId}`}
              checked={attested}
              onCheckedChange={(checked) => setAttested(checked === true)}
            />
            <Label htmlFor={`wc-attest-${studentId}`} className="text-sm leading-5 cursor-pointer">
              Confirmo que o aluno autorizou mensagens proativas de acompanhamento semanal neste WhatsApp.
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!isCurrentStudent || !attested || saving}
              onClick={(event) => {
                event.preventDefault();
                void persistConsent(true);
              }}
            >
              {saving ? "Registrando..." : "Registrar autorização"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
