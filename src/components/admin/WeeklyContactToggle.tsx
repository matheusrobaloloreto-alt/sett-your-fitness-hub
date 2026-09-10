// Consent ledger for proactive weekly contact. The legacy student boolean is a
// cache only; the RPC appends evidence and updates it atomically.
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MessageCircleHeart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function WeeklyContactToggle({ studentId }: { studentId: string; initial?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [policyVersion, setPolicyVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setEnabled(false);
    setLoading(true);
    (async () => {
      const status = await supabase.rpc("weekly_contact_consent_status", { _student_id: studentId });
      if (!active) return;
      const payload = !status.error && status.data && typeof status.data === "object" && !Array.isArray(status.data)
        ? status.data as { eligible?: boolean; policy_version?: string }
        : null;
      const currentPolicy = typeof payload?.policy_version === "string" ? payload.policy_version : null;
      setPolicyVersion(currentPolicy);
      setEnabled(!!currentPolicy && payload?.eligible === true);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [studentId]);

  const toggle = async (next: boolean) => {
    if (!policyVersion) {
      toast.error("Política de consentimento indisponível");
      return;
    }
    setEnabled(next);
    setSaving(true);
    const { error } = await supabase.rpc("record_weekly_contact_consent", {
      _student_id: studentId,
      _event_type: next ? "granted" : "revoked",
      _policy_version: policyVersion,
      _source: "staff_confirmed_student",
    });
    setSaving(false);
    if (error) {
      setEnabled(!next);
      toast.error("Não foi possível salvar");
    } else {
      toast.success(next ? "Contato semanal ativado" : "Contato semanal desativado");
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <MessageCircleHeart className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`wc-${studentId}`} className="text-sm font-medium cursor-pointer">Contato semanal</Label>
          <Switch id={`wc-${studentId}`} checked={enabled} disabled={loading || saving} onCheckedChange={toggle} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ative somente após o aluno autorizar mensagens proativas no WhatsApp. A autorização pode ser revogada a qualquer momento.
        </p>
      </div>
    </div>
  );
}
