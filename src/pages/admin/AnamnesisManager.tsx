import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Copy, Check, Link2, Loader2, MessageCircle, Pencil, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import FormFieldEditor from "@/components/FormFieldEditor";
import { useNavigate } from "react-router-dom";
import { openStudentChat } from "@/lib/studentChat";

// Anamnese ÚNICA (estúdio integrado). A aba Anamnese seleciona o aluno, gera o link da
// anamnese estruturada e envia direto no WhatsApp dele (ou copia o link).
interface Student { id: string; full_name: string; phone: string | null; whatsapp: string | null; status: string | null; }

const BLOCKS = [
  "Dados e composição", "Objetivo + modalidades de interesse", "Rotina de treino (e cardio por modalidade)",
  "Saúde e histórico", "Triagem clínica (PAR-Q) + dor articular", "Rotina alimentar (se quiser dicas)",
  "Preferências e substituições alimentares",
];

function waDigits(phone?: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d; // assume Brasil se vier sem DDI
  return d;
}

interface AnamnesisManagerProps {
  embedded?: boolean;
}

export default function AnamnesisManager({ embedded = false }: AnamnesisManagerProps = {}) {
  const { user, companyId: authCompanyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : authCompanyId ?? null;
  const navigate = useNavigate();
  const chatRoutePrefix = role === "master" ? "admin" : role || "admin";

  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [link, setLink] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!effectiveCompanyId) { setStudents([]); return; }
    (supabase as any)
      .from("students")
      .select("id, full_name, phone, whatsapp, status")
      .eq("company_id", effectiveCompanyId)
      .eq("status", "active")
      .order("full_name")
      .then(({ data }: any) => setStudents(data || []));
  }, [effectiveCompanyId]);

  const student = useMemo(() => students.find((s) => s.id === studentId) || null, [students, studentId]);

  // Sempre que troca de aluno, zera o link gerado.
  useEffect(() => { setLink(""); setCopied(false); }, [studentId]);

  async function createInvite(): Promise<string | null> {
    if (!studentId || !effectiveCompanyId) { toast.error("Selecione um aluno."); return null; }
    if (link) return link;
    setCreating(true);
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await (supabase as any).from("anamnese_invites").insert({
      company_id: effectiveCompanyId, student_id: studentId, token,
      student_name: student?.full_name, created_by: user?.id ?? null, status: "pending",
    });
    setCreating(false);
    if (error) { toast.error("Não consegui gerar o link: " + error.message); return null; }
    const url = `${window.location.origin}/anamnese-convite/${token}`;
    setLink(url);
    return url;
  }

  async function sendWhatsApp() {
    const url = await createInvite();
    if (!url) return;
    const nome = (student?.full_name || "").trim().split(/\s+/)[0] || "";
    const msg = `Oi, ${nome}! Pra eu montar seu plano do jeito certo, responde essa anamnese rapidinha (leva uns minutos): ${url}`;
    await openStudentChat({
      navigate,
      routePrefix: chatRoutePrefix,
      studentId,
      phone: student?.whatsapp || student?.phone,
      message: msg,
      onNoChat: () => {
        void navigator.clipboard?.writeText(url);
        toast.success("Aluno sem telefone cadastrado — link copiado.");
      },
    });
  }

  async function copyLink() {
    const url = await createInvite();
    if (!url) return;
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Link copiado!");
  }

  // Modo editor de perguntas — reusa o FormFieldEditor (perguntas de sistema travadas).
  if (editing) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar ao envio
        </Button>
        <FormFieldEditor
          formType="anamnesis"
          title="EDITAR ANAMNESE"
          subtitle="Adicione perguntas suas à anamnese. As perguntas padrão são fixas e não podem ser removidas."
          publicPath="/anamnese-convite"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl text-primary"><ClipboardCheck className="h-7 w-7" /> ANAMNESE</h1>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              Anamnese única do estúdio — gere o link e abra a conversa dentro do app.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar anamnese
            </Button>
            <BnitoContextButton
              label="anamnese do estúdio"
              context="Anamnese estruturada única (dados, objetivo, modalidades, rotina, saúde, PAR-Q, nutrição condicional) que alimenta todas as prescrições."
              question="Quais respostas da anamnese mais impactam a qualidade e a segurança da prescrição?"
              text="BNITO da anamnese"
            />
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Editar anamnese
          </Button>
          <BnitoContextButton
            label="anamnese do estúdio"
            context="Anamnese estruturada única (dados, objetivo, modalidades, rotina, saúde, PAR-Q, nutrição condicional) que alimenta todas as prescrições."
            question="Quais respostas da anamnese mais impactam a qualidade e a segurança da prescrição?"
            text="BNITO"
          />
        </div>
      )}

      <Card className="bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Enviar anamnese para um aluno</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Aluno</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Selecione o aluno…" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {student && !waDigits(student.whatsapp || student.phone) && (
              <p className="text-xs text-amber-600">Esse aluno não tem WhatsApp/telefone cadastrado — dá pra copiar o link.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={sendWhatsApp} disabled={!studentId || creating} className="bg-[#25D366] text-white hover:bg-[#25D366]/90">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
              Gerar link e abrir conversa
            </Button>
            <Button variant="outline" onClick={copyLink} disabled={!studentId || creating}>
              {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
              Copiar link
            </Button>
          </div>

          {link && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-2.5">
              <Link2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-mono-data text-xs text-muted-foreground">{link}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">O que a anamnese coleta</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {BLOCKS.map((b) => <Badge key={b} variant="outline" className="text-[11px] font-normal">{b}</Badge>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            É a mesma anamnese estruturada do estúdio (única). Os blocos de nutrição só aparecem se o aluno quiser
            dicas (anamnese "viva"), e os campos de corrida/natação/ciclismo aparecem conforme as modalidades de interesse.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
