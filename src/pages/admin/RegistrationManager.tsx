import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Copy, Check, MessageCircle, Link2, Pencil, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import FormFieldEditor from "@/components/FormFieldEditor";
import { useNavigate } from "react-router-dom";
import { openStudentChat } from "@/lib/studentChat";

interface Student {
  id: string;
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
  status: string | null;
}

function waDigits(phone?: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d; // assume Brasil se vier sem DDI
  return d;
}

export default function RegistrationManager() {
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : companyId ?? null;
  const navigate = useNavigate();
  const chatRoutePrefix = role === "master" ? "admin" : role || "admin";

  const [generalLink, setGeneralLink] = useState(`${window.location.origin}/cadastro`);
  const [link, setLink] = useState(`${window.location.origin}/cadastro`);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  useEffect(() => {
    if (!effectiveCompanyId) return;
    (supabase as any).from("companies").select("slug").eq("id", effectiveCompanyId).maybeSingle()
      .then(({ data }: any) => {
        const companyLink = `${window.location.origin}/cadastro${data?.slug ? "/" + data.slug : ""}`;
        setGeneralLink(companyLink);
        setLink(companyLink);
      });
    (supabase as any).from("students").select("id, full_name, phone, whatsapp, status")
      .eq("company_id", effectiveCompanyId)
      .in("status", ["interested", "pending", "active", "awaiting_renewal"])
      .order("full_name")
      .then(({ data }: any) => setStudents(data || []));
  }, [effectiveCompanyId]);

  // Selecionar um aluno preenche o telefone (útil pra reenviar a quem já está na base).
  useEffect(() => {
    const s = students.find((x) => x.id === studentId);
    if (s) setPhone(s.whatsapp || s.phone || "");
    setLink(generalLink);
  }, [studentId, students, generalLink]);

  const ensurePersonalLink = async (): Promise<string> => {
    if (!studentId) return link;
    if (link.includes("/cadastro-fiscal/")) return link;
    setCreatingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-registration", {
        body: { action: "create-link", studentId },
      });
      if (error || !data?.token) {
        throw new Error(data?.error || error?.message || "Não foi possível criar o link fiscal.");
      }
      const personalized = `${window.location.origin}/cadastro-fiscal/${data.token}`;
      setLink(personalized);
      return personalized;
    } finally {
      setCreatingLink(false);
    }
  };

  const sendWhatsApp = async () => {
    const digits = waDigits(phone);
    if (!digits) { toast.error("Digite o WhatsApp do interessado (ou selecione um aluno)."); return; }
    const selectedStudent = students.find((student) => student.id === studentId);
    let targetLink = link;
    try {
      targetLink = await ensurePersonalLink();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o link.");
      return;
    }
    const firstName = selectedStudent?.full_name.trim().split(/\s+/)[0] || "";
    const msg = selectedStudent
      ? `Oi, ${firstName}! Complete seus dados fiscais para seguirmos com seu plano e a emissão da nota: ${targetLink}`
      : `Olá! Faça seu cadastro por aqui: ${targetLink}`;
    await openStudentChat({
      navigate,
      routePrefix: chatRoutePrefix,
      studentId: selectedStudent?.id || null,
      phone: digits,
      message: msg,
      onNoChat: () => toast.error("Informe um telefone válido para abrir a conversa interna."),
    });
  };

  const copyLink = async () => {
    try {
      const targetLink = await ensurePersonalLink();
      await navigator.clipboard?.writeText(targetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Link copiado!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o link.");
    }
  };

  // Modo editor de perguntas — reusa o FormFieldEditor existente.
  if (editing) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar ao envio
        </Button>
        <FormFieldEditor
          formType="registration"
          title="EDITAR CADASTRO"
          subtitle="Edite as perguntas do formulário público de cadastro."
          publicPath="/cadastro"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl text-primary"><UserPlus className="h-7 w-7" /> CADASTRO</h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            Envie o cadastro fiscal individual. Ao concluir, o interessado vira pendente e recebe o checkout Asaas.
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="mr-2 h-4 w-4" /> Editar perguntas
        </Button>
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Enviar cadastro</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Interessado ou aluno</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Selecione para gerar o link individual…" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} · {s.status === "interested" ? "Interessado" : s.status === "pending" ? "Pendente" : "Aluno"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp do interessado</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(DDD) 9 xxxx-xxxx" inputMode="tel" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={sendWhatsApp} disabled={creatingLink} className="bg-[#25D366] text-white hover:bg-[#25D366]/90">
              {creatingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
              Abrir conversa com cadastro
            </Button>
            <Button variant="outline" onClick={copyLink} disabled={creatingLink}>
              {creatingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
              Copiar link
            </Button>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-2.5">
            <Link2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate font-mono-data text-xs text-muted-foreground">{link}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Selecione uma pessoa para criar um link seguro com o nome já preenchido. Sem seleção, o link geral continua disponível para novos contatos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
