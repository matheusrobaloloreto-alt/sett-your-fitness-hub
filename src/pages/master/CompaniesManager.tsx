import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, CreditCard, ExternalLink, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useMaster } from "@/contexts/MasterContext";
import { useNavigate } from "react-router-dom";

interface Company {
  id: string;
  name: string;
  owner_user_id: string;
  slug: string | null;
  tier: string;
  is_active: boolean;
  created_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
}

const tierLabel: Record<string, string> = { 
  basic: "Básico", 
  intermediate: "Intermediário", 
  advanced: "Avançado" 
};

const tierPrice: Record<string, string> = {
  basic: "R$ 199/mês",
  intermediate: "R$ 400/mês",
  advanced: "R$ 799/mês",
};

const tierFeatures: Record<string, string[]> = {
  basic: ["Prescrição de Treino", "Biblioteca de Exercícios"],
  intermediate: ["Tudo do Básico", "+ Dashboard", "+ Cadastro", "+ Anamnese", "+ Alunos", "+ Agenda", "+ Equipe", "+ Financeiro"],
  advanced: ["Tudo do Intermediário", "+ WhatsApp CRM", "+ Automação"],
};

const subscriptionStatusLabel: Record<string, string> = {
  active: "Ativa",
  canceled: "Cancelada",
  past_due: "Pagamento Atrasado",
  inactive: "Sem Assinatura",
};

const subscriptionStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  canceled: "secondary",
  past_due: "destructive",
  inactive: "outline",
};

export default function CompaniesManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", tier: "basic", owner_email: "" });
  const [processingCheckout, setProcessingCheckout] = useState<string | null>(null);
  const { setViewingCompany } = useMaster();
  const navigate = useNavigate();

  const fetchCompanies = async () => {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false });
    setCompanies((data || []) as Company[]);
    setLoading(false);
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleCreate = async () => {
    if (!form.name) { toast.error("Nome é obrigatório"); return; }

    let ownerUserId = "";
    if (form.owner_email) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("full_name", `%${form.owner_email}%`)
        .limit(1)
        .maybeSingle();
      if (profile) ownerUserId = profile.user_id;
    }

    if (!ownerUserId) {
      toast.error("Não foi possível encontrar o proprietário. Verifique o nome.");
      return;
    }

    const { error } = await supabase.from("companies").insert({
      name: form.name,
      slug: form.slug || null,
      tier: form.tier as any,
      owner_user_id: ownerUserId,
    });

    if (error) { toast.error("Erro ao criar empresa: " + error.message); return; }

    const { data: newCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (newCompany) {
      await supabase.from("company_members").insert({
        company_id: newCompany.id,
        user_id: ownerUserId,
      });
    }

    toast.success("Empresa criada com sucesso!");
    setDialogOpen(false);
    setForm({ name: "", slug: "", tier: "basic", owner_email: "" });
    fetchCompanies();
  };

  const handleEnterCompany = (company: Company) => {
    setViewingCompany({
      id: company.id,
      name: company.name,
      tier: company.tier,
      slug: company.slug,
    });
    toast.success(`Entrando no painel de ${company.name}`);
    navigate("/admin");
  };

  const handleCreateCheckout = async (companyId: string, tier: string) => {
    setProcessingCheckout(companyId);
    try {
      const { data, error } = await supabase.functions.invoke("create-company-checkout", {
        body: { companyId, tier },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      toast.error("Erro ao criar checkout: " + error.message);
    } finally {
      setProcessingCheckout(null);
    }
  };

  const handleManageSubscription = async (companyId: string) => {
    setProcessingCheckout(companyId);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: { companyId },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      toast.error("Erro ao abrir portal: " + error.message);
    } finally {
      setProcessingCheckout(null);
    }
  };

  const handleUpdateTier = async (companyId: string, newTier: string) => {
    const { error } = await supabase
      .from("companies")
      .update({ tier: newTier as any })
      .eq("id", companyId);

    if (error) { toast.error("Erro ao atualizar tier"); return; }
    toast.success("Tier atualizado!");
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, tier: newTier } : c));
  };

  const handleToggleActive = async (companyId: string, isActive: boolean) => {
    const { error } = await supabase
      .from("companies")
      .update({ is_active: !isActive })
      .eq("id", companyId);

    if (error) { toast.error("Erro ao alterar status"); return; }
    toast.success(isActive ? "Empresa desativada" : "Empresa ativada");
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, is_active: !isActive } : c));
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gestão de Empresas</h1>
            <p className="text-muted-foreground font-sans">Gerencie todas as instâncias e assinaturas da plataforma.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Nova Empresa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Empresa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome da Empresa</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Studio Fitness" />
                </div>
                <div>
                  <Label>Slug (URL)</Label>
                  <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="studio-fitness" />
                </div>
                <div>
                  <Label>Nome do Proprietário (busca no perfil)</Label>
                  <Input value={form.owner_email} onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))} placeholder="Nome do profissional" />
                </div>
                <div>
                  <Label>Tier Inicial</Label>
                  <Select value={form.tier} onValueChange={v => setForm(f => ({ ...f, tier: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Básico - {tierPrice.basic}</SelectItem>
                      <SelectItem value="intermediate">Intermediário - {tierPrice.intermediate}</SelectItem>
                      <SelectItem value="advanced">Avançado - {tierPrice.advanced}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1 font-sans">
                    {tierFeatures[form.tier]?.join(" • ")}
                  </p>
                </div>
                <Button onClick={handleCreate} className="w-full">Criar Empresa</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : companies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground font-sans">Nenhuma empresa cadastrada.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {companies.map((company) => (
              <Card key={company.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{company.name}</p>
                        <p className="text-xs text-muted-foreground font-sans">
                          {company.slug || "sem slug"} • Criada em {new Date(company.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge variant={company.is_active ? "default" : "secondary"}>
                        {company.is_active ? "Ativa" : "Inativa"}
                      </Badge>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleEnterCompany(company)}
                      >
                        <LogIn className="h-4 w-4 mr-1" />
                        Entrar
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(company.id, company.is_active)}
                      >
                        {company.is_active ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  </div>

                  {/* Subscription Section */}
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Plano: {tierLabel[company.tier]}</p>
                        <p className="text-xs text-muted-foreground">{tierPrice[company.tier]}</p>
                      </div>
                      <Badge variant={subscriptionStatusVariant[company.subscription_status || "inactive"]}>
                        {subscriptionStatusLabel[company.subscription_status || "inactive"]}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Manual tier change */}
                      <Select
                        value={company.tier}
                        onValueChange={(val) => handleUpdateTier(company.id, val)}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">Básico</SelectItem>
                          <SelectItem value="intermediate">Intermediário</SelectItem>
                          <SelectItem value="advanced">Avançado</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Subscription actions */}
                      {company.stripe_subscription_id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleManageSubscription(company.id)}
                          disabled={processingCheckout === company.id}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Gerenciar
                        </Button>
                      ) : (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="default"
                              size="sm"
                              disabled={processingCheckout === company.id}
                            >
                              <CreditCard className="h-4 w-4 mr-1" />
                              Assinar
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Escolher Plano para {company.name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              {(["basic", "intermediate", "advanced"] as const).map((tier) => (
                                <Card 
                                  key={tier} 
                                  className={`cursor-pointer hover:border-primary transition-colors ${company.tier === tier ? "border-primary" : ""}`}
                                  onClick={() => handleCreateCheckout(company.id, tier)}
                                >
                                  <CardContent className="py-3">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="font-medium">{tierLabel[tier]}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {tierFeatures[tier].slice(0, 3).join(" • ")}
                                        </p>
                                      </div>
                                      <p className="font-bold text-primary">{tierPrice[tier]}</p>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
