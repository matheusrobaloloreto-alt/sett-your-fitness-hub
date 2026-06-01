import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useMaster } from "@/contexts/MasterContext";

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
  price: number;
  description: string | null;
  is_active: boolean;
  cycle_duration_days: number;
}

export default function PlansManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({ name: "", duration_weeks: 12, price: 0, description: "", cycle_duration_days: 42 });
  const { toast } = useToast();
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  useEffect(() => {
    loadPlans();
  }, [effectiveCompanyId]);

  const loadPlans = async () => {
    let query = supabase.from("plans").select("*").order("created_at", { ascending: false });
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    const { data } = await query;
    setPlans((data as Plan[]) || []);
  };

  const handleSave = async () => {
    if (!form.name || !form.duration_weeks) return;

    if (editing) {
      const { error } = await supabase
        .from("plans")
        .update({ name: form.name, duration_weeks: form.duration_weeks, price: form.price, description: form.description || null, cycle_duration_days: form.cycle_duration_days, duration_days: form.duration_weeks * 7 })
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Plano atualizado!" });
    } else {
      const { error } = await supabase
        .from("plans")
        .insert({ name: form.name, duration_weeks: form.duration_weeks, price: form.price, description: form.description || null, cycle_duration_days: form.cycle_duration_days, duration_days: form.duration_weeks * 7, company_id: effectiveCompanyId });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Plano criado!" });
    }

    setOpen(false);
    setEditing(null);
    setForm({ name: "", duration_weeks: 12, price: 0, description: "", cycle_duration_days: 42 });
    loadPlans();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("plans").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Plano excluído" });
    loadPlans();
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({ name: plan.name, duration_weeks: plan.duration_weeks, price: plan.price, description: plan.description || "", cycle_duration_days: plan.cycle_duration_days || 42 });
    setOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl text-primary">PLANOS</h1>
            <p className="text-muted-foreground font-sans">Gerencie os planos da consultoria</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm({ name: "", duration_weeks: 12, price: 0, description: "", cycle_duration_days: 42 }); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo Plano</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-primary">{editing ? "EDITAR PLANO" : "NOVO PLANO"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-sans">Nome do Plano</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: PRO 24 Semanas"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Duração (semanas)</Label>
                  <Input
                    type="number"
                    value={form.duration_weeks}
                    onChange={(e) => setForm({ ...form, duration_weeks: Number(e.target.value) })}
                    min={1}
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Duração do Ciclo (dias)</Label>
                  <Select value={String(form.cycle_duration_days)} onValueChange={(v) => setForm({ ...form, cycle_duration_days: Number(v) })}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 dias</SelectItem>
                      <SelectItem value="42">42 dias</SelectItem>
                      <SelectItem value="60">60 dias</SelectItem>
                      <SelectItem value="90">90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Preço (R$)</Label>
                  <Input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    min={0}
                    step={0.01}
                    placeholder="0,00"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Descrição</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Descrição do plano..."
                    className="bg-secondary border-border"
                  />
                </div>
                <Button onClick={handleSave} className="w-full">
                  {editing ? "Salvar" : "Criar Plano"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className="bg-card border-border">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                   <CardTitle className="text-primary text-lg">{plan.name}</CardTitle>
                   <p className="text-muted-foreground text-sm font-sans">{plan.duration_weeks} semanas · Ciclo de {plan.cycle_duration_days || 42} dias</p>
                   <p className="text-foreground text-sm font-sans font-semibold">R$ {plan.price.toFixed(2).replace(".", ",")}</p>
                 </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(plan)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              {plan.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground font-sans">{plan.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
          {plans.length === 0 && (
            <p className="text-muted-foreground font-sans col-span-full text-center py-12">Nenhum plano cadastrado ainda</p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
