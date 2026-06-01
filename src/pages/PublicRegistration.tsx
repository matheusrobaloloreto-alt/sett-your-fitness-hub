import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatCPF, formatCEP, formatPhone } from "@/lib/masks";
import { applyTheme } from "@/contexts/ThemeContext";

interface CompanyBranding {
  logo_url: string | null;
  platform_title: string;
  primary_color: string;
  background_color: string;
  card_color: string;
  text_color: string;
}

export default function PublicRegistration() {
  const { slug } = useParams<{ slug?: string }>();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [branding, setBranding] = useState<CompanyBranding | null>(null);

  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");

  // Resolve company + branding via public edge function (no anon RLS).
  // NOTE: Plano e pagamento foram desacoplados — agora vivem apenas em /pagamento/:studentId.
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.functions.invoke("public-registration", {
        body: { action: "context", slug: slug ?? null },
      });
      if (error || !data?.company) return;
      setCompanyId(data.company.id);
      if (data.branding) {
        setBranding(data.branding);
        applyTheme(data.branding);
      }
    };
    init();
  }, [slug]);

  const logoSrc = branding?.logo_url || null;
  const titleText = branding?.platform_title || "Set Training App";

  const handleSubmit = async () => {
    const missing: string[] = [];
    if (!fullName) missing.push("Nome Completo");
    if (!birthDate) missing.push("Data de Nascimento");
    if (!cpf) missing.push("CPF");
    if (!cep) missing.push("CEP");
    if (!address) missing.push("Rua");
    if (!addressNumber) missing.push("Número");
    if (!neighborhood) missing.push("Bairro");
    if (!city) missing.push("Cidade");
    if (!state) missing.push("Estado");
    if (!whatsapp) missing.push("WhatsApp");
    if (!email) missing.push("Email");

    if (missing.length > 0) {
      toast({ title: "Campos obrigatórios", description: `Preencha: ${missing.join(", ")}`, variant: "destructive" });
      return;
    }
    if (!companyId) {
      toast({ title: "Erro ao identificar a empresa", description: "Recarregue a página e tente novamente.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("public-registration", {
      body: {
        action: "register",
        companyId,
        student: {
          full_name: fullName,
          birth_date: birthDate,
          email,
          phone: whatsapp,
          cpf: cpf.replace(/\D/g, ""),
          cep: cep.replace(/\D/g, ""),
          address,
          address_number: addressNumber,
          neighborhood,
          city,
          state,
          whatsapp: whatsapp.replace(/\D/g, ""),
          // selected_plan_id propositalmente omitido — pagamento é fluxo separado.
        },
      },
    });

    if (error || !data?.studentId) {
      setSaving(false);
      toast({ title: "Erro ao salvar cadastro", description: error?.message || data?.error || "Falha ao cadastrar", variant: "destructive" });
      return;
    }

    setSaving(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card border-border text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-3xl text-primary">CADASTRO RECEBIDO!</h2>
            <p className="text-muted-foreground font-sans">
              Seus dados foram registrados com sucesso. Em breve seu treinador
              entrará em contato com o link para escolher o plano e finalizar o pagamento.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          {logoSrc ? (
            <img src={logoSrc} alt={titleText} className="h-16 mx-auto" />
          ) : (
            <div className="flex justify-center"><Logo size="lg" sublabel="Training App" /></div>
          )}
          <h1 className="text-4xl text-primary">CADASTRO {titleText}</h1>
          <p className="text-sm text-muted-foreground font-sans">Dados Pessoais</p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-primary text-xl">DADOS PESSOAIS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-sans">Nome Completo *</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Seu nome completo" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">Data de Nascimento *</Label>
              <Input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">CPF *</Label>
              <Input value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">CEP *</Label>
              <Input value={cep} onChange={e => setCep(formatCEP(e.target.value))} placeholder="00000-000" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">Rua *</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Nome da rua" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-sans">Número *</Label>
                <Input value={addressNumber} onChange={e => setAddressNumber(e.target.value)} placeholder="Nº" />
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Bairro *</Label>
                <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Bairro" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-sans">Cidade *</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" />
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Estado *</Label>
                <Input value={state} onChange={e => setState(e.target.value)} placeholder="UF" maxLength={2} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-sans">WhatsApp *</Label>
              <Input value={whatsapp} onChange={e => setWhatsapp(formatPhone(e.target.value))} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : "Finalizar Cadastro"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
