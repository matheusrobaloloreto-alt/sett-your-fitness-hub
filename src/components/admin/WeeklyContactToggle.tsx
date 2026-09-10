// Consent ledger for proactive weekly contact. The legacy student boolean is a
// cache only; the RPC appends evidence and updates it atomically.
import { useEffect, useMemo, useRef, useState } from "react";
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
import { normalizeStudentChatPhone } from "@/lib/studentChat";

type WeeklyContactToggleProps = {
  studentId: string;
  phone?: string | null;
  countryCode?: string | null;
};

export function WeeklyContactToggle({ studentId, phone, countryCode }: WeeklyContactToggleProps) {
  const activeStudentIdRef = useRef(studentId);
  activeStudentIdRef.current = studentId;
  const normalizedRecipient = useMemo(
    () => normalizeStudentChatPhone(phone, countryCode),
    [phone, countryCode],
  );
  const activeRecipientRef = useRef(normalizedRecipient);
  activeRecipientRef.current = normalizedRecipient;
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [policyVersion, setPolicyVersion] = useState<string | null>(null);
  const [statusStudentId, setStatusStudentId] = useState<string | null>(null);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantDialogRecipient, setGrantDialogRecipient] = useState<string | null>(null);
  const [attestedRecipient, setAttestedRecipient] = useState<string | null>(null);
  const hasReliableRecipient = normalizedRecipient !== null;

  useEffect(() => {
    let active = true;
    setEnabled(false);
    setPolicyVersion(null);
    setStatusStudentId(null);
    setGrantDialogOpen(false);
    setGrantDialogRecipient(null);
    setAttestedRecipient(null);
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

  useEffect(() => {
    setEnabled(false);
    setSaving(false);
    setGrantDialogOpen(false);
    setGrantDialogRecipient(null);
    setAttestedRecipient(null);
  }, [normalizedRecipient]);

  const isCurrentStudent = statusStudentId === studentId;
  const isGrantRecipientCurrent = normalizedRecipient !== null && grantDialogRecipient === normalizedRecipient;
  const hasCurrentRecipientAttestation = isGrantRecipientCurrent && attestedRecipient === normalizedRecipient;

  const persistConsent = async (next: boolean) => {
    const originStudentId = studentId;
    const originPolicyVersion = isCurrentStudent ? policyVersion : null;
    const originRecipient = normalizedRecipient;
    if (next && (!originRecipient || grantDialogRecipient !== originRecipient || attestedRecipient !== originRecipient)) {
      toast.error("Corrija o WhatsApp do aluno antes de ativar o contato semanal.");
      return;
    }
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
    if (activeStudentIdRef.current !== originStudentId || activeRecipientRef.current !== originRecipient) return;
    setSaving(false);
    if (error) {
      setEnabled(!next);
      toast.error("Não foi possível salvar");
    } else {
      setGrantDialogOpen(false);
      setGrantDialogRecipient(null);
      setAttestedRecipient(null);
      toast.success(next ? "Contato semanal ativado" : "Contato semanal desativado");
    }
  };

  const requestToggle = (next: boolean) => {
    if (next) {
      if (!hasReliableRecipient) {
        toast.error("Corrija o WhatsApp do aluno antes de ativar o contato semanal.");
        return;
      }
      setAttestedRecipient(null);
      setGrantDialogRecipient(normalizedRecipient);
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
            disabled={!isCurrentStudent || loading || saving || (!enabled && !hasReliableRecipient)}
            onCheckedChange={requestToggle}
          />
        </div>
        {hasReliableRecipient ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            Ative somente após o aluno autorizar mensagens proativas no WhatsApp. A autorização pode ser revogada a qualquer momento.
          </p>
        ) : (
          <p className="text-xs text-destructive mt-0.5">
            Sem WhatsApp confiável. Corrija o número no perfil antes de ativar.
          </p>
        )}
      </div>
      <AlertDialog open={isCurrentStudent && isGrantRecipientCurrent && grantDialogOpen} onOpenChange={(open) => {
        setGrantDialogOpen(open);
        if (!open) {
          setGrantDialogRecipient(null);
          setAttestedRecipient(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar autorização do aluno</AlertDialogTitle>
            <AlertDialogDescription>
              O contato semanal envia mensagens proativas pelo WhatsApp. Só prossiga se o aluno autorizou essa finalidade.
              <span className="mt-2 block font-medium text-foreground">
                Destinatário desta confirmação: <span className="font-mono">+{grantDialogRecipient}</span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            <Checkbox
              id={`wc-attest-${studentId}`}
              checked={hasCurrentRecipientAttestation}
              onCheckedChange={(checked) => {
                setAttestedRecipient(checked === true && isGrantRecipientCurrent ? normalizedRecipient : null);
              }}
            />
            <Label htmlFor={`wc-attest-${studentId}`} className="text-sm leading-5 cursor-pointer">
              Confirmo que o aluno autorizou mensagens proativas de acompanhamento semanal neste WhatsApp.
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!isCurrentStudent || !hasCurrentRecipientAttestation || saving}
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
