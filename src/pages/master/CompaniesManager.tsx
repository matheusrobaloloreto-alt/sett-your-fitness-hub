import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, CreditCard, ExternalLink, LogIn, Pencil } from "lucide-react";
import { usePlatformCatalog } from "@/hooks/usePlatformCatalog";
import { saveCompanyPublicProfile } from "@/lib/companyPublicProfile";
import CompanyAdmissionPolicy from "@/components/master/CompanyAdmissionPolicy";
import CompanyFeaturePolicy from "@/components/master/CompanyFeaturePolicy";
import type {CompanyLimitSource} from "@/lib/companyAdmissionPolicy";
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
  subscription_status: string | null;
  has_subscription?: boolean;
  company_limit_source?:CompanyLimitSource;
  company_limit_policy_version?:number;
}

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
  const catalog = usePlatformCatalog();
  const catalogReady=!!catalog.data && !catalog.isError && !catalog.isPending;
  const tierLabel = Object.fromEntries(Object.entries(catalog.data?.tiers || {}).map(([id,tier]) => [id,tier.name]));
  const tierPrice = Object.fromEntries(Object.entries(catalog.data?.tiers || {}).map(([id,tier]) => [id, `${tier.monthly_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês`]));
  const tierFeatures = Object.fromEntries(Object.entries(catalog.data?.tiers || {}).map(([id,tier]) => [id,[tier.description]]));
  const [editing, setEditing] = useState<Company | null>(null);
  const [identity, setIdentity] = useState({ name: "", slug: "" });
  const [savingIdentity, setSavingIdentity] = useState(false);
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
    const { data: billing } = await supabase
      .from("company_billing")
      .select("company_id, stripe_subscription_id");
    const subscribed = new Set(
      (billing || [])
        .filter((b: any) => b.stripe_subscription_id)
        .map((b: any) => b.company_id)
    );
    setCompanies(
      ((data || []) as Company[]).map((c) => ({
        ...c,
        has_subscription: subscribed.has(c.id),
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleCreate = async () => {
    if (!form.name) { toast.error("Nome é obrigatório"); return; }

    const ownerUserId = form.owner_email.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerUserId)) {
      toast.error("Informe o identificador exato do proprietário verificado.");
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
    if(!catalogReady || !catalog.data?.tiers[tier as keyof typeof catalog.data.tiers])return;
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

  const saveIdentity = async () => {
    if (!editing || savingIdentity) return;
    setSavingIdentity(true);
    try {
      await saveCompanyPublicProfile(editing,identity);
      toast.success("Identidade atualizada."); setEditing(null); await fetchCompanies();
    } catch(cause) { toast.error(cause instanceof Error?cause.message:"Não foi possível salvar a identidade."); }
    finally { setSavingIdentity(false); }
  };

  return (
    <>
      <Dialog open={!!editing} onOpenChange={open => { if (!open && !savingIdentity) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Identidade da empresa</DialogTitle></DialogHeader><Label htmlFor="company-name">Nome</Label><Input id="company-name" value={identity.name} maxLength={120} onChange={e => setIdentity(v => ({ ...v,name:e.target.value }))} /><Label htmlFor="company-slug">Slug</Label><Input id="company-slug" value={identity.slug} maxLength={80} onChange={e => setIdentity(v => ({ ...v,slug:e.target.value }))} /><p className="text-sm text-muted-foreground">Transferência de proprietário exige um fluxo separado com verificação de identidade.</p><Button disabled={savingIdentity} onClick={saveIdentity}>Salvar identidade</Button></DialogContent></Dialog>
      <div className="sett-master-page p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
                  <Label>Identificador exato do proprietário</Label>
                  <Input value={form.owner_email} onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))} placeholder="UUID do usuário verificado" />
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
                <CardContent className="py-4 min-w-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground break-words">{company.name}</p>
                        <p className="text-xs text-muted-foreground font-sans break-all">
                          {company.slug || "sem slug"} • Criada em {new Date(company.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="icon" variant="outline" title="Editar identidade" aria-label={`Editar ${company.name}`} onClick={() => { setEditing(company); setIdentity({ name: company.name, slug: company.slug || "" }); }}><Pencil className="h-4 w-4" /></Button>
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

                  <CompanyAdmissionPolicy key={`${company.id}:${company.company_limit_policy_version || 0}`} companyId={company.id} name={company.name} source={company.company_limit_source || "legacy"} version={company.company_limit_policy_version || 0} onSaved={value=>setCompanies(current=>current.map(item=>item.id===company.id?{...item,...value}:item))}/>
                  {/* Subscription Section */}
                  <CompanyFeaturePolicy companyId={company.id} name={company.name}/>
                  <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Plano: {tierLabel[company.tier] || company.tier}</p>
                        <p className="text-xs text-muted-foreground">{tierPrice[company.tier]}</p>
                        {!catalogReady && <p role={catalog.isError?"alert":"status"} className="text-xs text-muted-foreground">{catalog.isError?"Catálogo indisponível. Recarregue antes de criar uma assinatura.":"Carregando catálogo de assinaturas..."}</p>}
                      </div>
                      <Badge variant={subscriptionStatusVariant[company.subscription_status || "inactive"]}>
                        {subscriptionStatusLabel[company.subscription_status || "inactive"]}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                      {company.has_subscription ? (
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
                              disabled={!catalogReady || processingCheckout === company.id}
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
                              {(catalogReady ? (["basic", "intermediate", "advanced"] as const) : []).map((tier) => (
                                <Card 
                                  key={tier} 
                                  className={`cursor-pointer hover:border-primary transition-colors ${company.tier === tier ? "border-primary" : ""}`}
                                  onClick={() => handleCreateCheckout(company.id, tier)}
                                >
                                  <CardContent className="py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div>
                                        <p className="font-medium">{tierLabel[tier]}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {tierFeatures[tier]?.slice(0, 3).join(" • ")}
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
    </>
  );
}
