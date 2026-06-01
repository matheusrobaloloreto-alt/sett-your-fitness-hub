import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, GripVertical, Pencil, Trash2, ChevronUp, ChevronDown, X, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FormField {
  id: string;
  form_type: string;
  label: string;
  field_type: string;
  options: string[];
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  field_key: string | null;
  company_id: string | null;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  select: "Seleção",
  radio: "Escolha única",
  checkbox: "Múltipla escolha",
  number: "Número",
  date: "Data",
};

interface FormFieldEditorProps {
  formType: "registration" | "anamnesis";
  title: string;
  subtitle: string;
  publicPath?: string;
}

export default function FormFieldEditor({ formType, title, subtitle, publicPath }: FormFieldEditorProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [form, setForm] = useState({ label: "", field_type: "text", is_required: false, options: [] as string[] });
  const [newOption, setNewOption] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const loadFields = async () => {
    setLoading(true);
    let query = supabase
      .from("form_fields")
      .select("*")
      .eq("form_type", formType)
      .order("sort_order", { ascending: true });
    
    // Filter by company_id — include records with matching company_id OR null (legacy)
    if (effectiveCompanyId) {
      query = query.or(`company_id.eq.${effectiveCompanyId},company_id.is.null`);
    }
    
    const { data } = await query;
    setFields((data || []).map((d: any) => ({
      ...d,
      options: Array.isArray(d.options) ? d.options : [],
    })));
    setLoading(false);
  };

  useState(() => { loadFields(); });

  const openAdd = () => {
    setEditingField(null);
    setForm({ label: "", field_type: "text", is_required: false, options: [] });
    setNewOption("");
    setEditOpen(true);
  };

  const openEdit = (f: FormField) => {
    setEditingField(f);
    setForm({
      label: f.label,
      field_type: f.field_type,
      is_required: f.is_required,
      options: [...f.options],
    });
    setNewOption("");
    setEditOpen(true);
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    setForm({ ...form, options: [...form.options, newOption.trim()] });
    setNewOption("");
  };

  const removeOption = (idx: number) => {
    setForm({ ...form, options: form.options.filter((_, i) => i !== idx) });
  };

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);

    if (editingField) {
      const { error } = await supabase.from("form_fields").update({
        label: form.label.trim(),
        field_type: form.field_type,
        is_required: form.is_required,
        options: form.options,
      }).eq("id", editingField.id);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Campo atualizado!" });
      }
    } else {
      const maxOrder = fields.length > 0 ? Math.max(...fields.map(f => f.sort_order)) : 0;
      const { error } = await supabase.from("form_fields").insert({
        form_type: formType,
        label: form.label.trim(),
        field_type: form.field_type,
        is_required: form.is_required,
        options: form.options,
        sort_order: maxOrder + 1,
        company_id: effectiveCompanyId,
      });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Campo adicionado!" });
      }
    }

    setSaving(false);
    setEditOpen(false);
    loadFields();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("form_fields").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Campo removido!" });
      loadFields();
    }
  };

  const handleMove = async (idx: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= fields.length) return;

    const current = fields[idx];
    const target = fields[targetIdx];

    await Promise.all([
      supabase.from("form_fields").update({ sort_order: target.sort_order }).eq("id", current.id),
      supabase.from("form_fields").update({ sort_order: current.sort_order }).eq("id", target.id),
    ]);
    loadFields();
  };

  const handleToggleActive = async (f: FormField) => {
    await supabase.from("form_fields").update({ is_active: !f.is_active }).eq("id", f.id);
    loadFields();
  };

  const needsOptions = ["select", "radio", "checkbox"].includes(form.field_type);

  // Build the public link with company slug
  const copyPublicLink = async () => {
    let url = `${window.location.origin}${publicPath}`;
    if (companyId) {
      // Try to get company slug
      const { data: company } = await supabase
        .from("companies")
        .select("slug")
        .eq("id", companyId)
        .single();
      if (company?.slug) {
        url = `${window.location.origin}${publicPath}/${company.slug}`;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado!", description: url });
    } catch {
      // Fallback for mobile / insecure contexts
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast({ title: "Link copiado!", description: url });
    }
  };

  const renderFieldPreview = (f: FormField) => {
    const baseClass = "bg-secondary border-border text-foreground pointer-events-none";
    switch (f.field_type) {
      case "text":
        return <div className={`h-9 rounded-md border px-3 flex items-center text-sm text-muted-foreground ${baseClass}`}>Resposta curta</div>;
      case "textarea":
        return <div className={`h-16 rounded-md border px-3 pt-2 text-sm text-muted-foreground ${baseClass}`}>Resposta longa</div>;
      case "number":
        return <div className={`h-9 rounded-md border px-3 flex items-center text-sm text-muted-foreground ${baseClass}`}>0</div>;
      case "date":
        return <div className={`h-9 rounded-md border px-3 flex items-center text-sm text-muted-foreground ${baseClass}`}>dd/mm/aaaa</div>;
      case "select":
        return (
          <div className={`h-9 rounded-md border px-3 flex items-center justify-between text-sm text-muted-foreground ${baseClass}`}>
            <span>Selecione...</span>
            <ChevronDown className="h-4 w-4" />
          </div>
        );
      case "radio":
        return (
          <div className="space-y-1.5">
            {f.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-sans">
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40" />
                <span className="text-foreground">{o}</span>
              </div>
            ))}
          </div>
        );
      case "checkbox":
        return (
          <div className="space-y-1.5">
            {f.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-sans">
                <div className="w-4 h-4 rounded border-2 border-muted-foreground/40" />
                <span className="text-foreground">{o}</span>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl text-primary">{title}</h1>
          <p className="text-muted-foreground font-sans">{subtitle}</p>
        </div>
        {publicPath && formType === "registration" && (
          <Button variant="outline" size="sm" onClick={copyPublicLink}>
            <Copy className="h-4 w-4 mr-1" />Copiar link
          </Button>
        )}
        {formType === "anamnesis" && (
          <p className="text-xs text-muted-foreground font-sans max-w-xs text-right">
            O link da anamnese é individual por aluno, gerado após o cadastro.
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground font-sans text-center py-12">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {fields.map((f, idx) => (
            <Card key={f.id} className={`border-border transition-opacity ${f.is_active ? "bg-card" : "bg-muted/50 opacity-60"}`}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMove(idx, "up")} disabled={idx === 0}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMove(idx, "down")} disabled={idx === fields.length - 1}>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-sans font-medium text-foreground">{f.label}</span>
                      {f.is_required && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">Obrigatório</Badge>}
                      <Badge variant="outline" className="text-[10px]">{FIELD_TYPE_LABELS[f.field_type] || f.field_type}</Badge>
                      {f.field_key && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Sistema</Badge>}
                      {!f.is_active && <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">Desativado</Badge>}
                    </div>
                    {renderFieldPreview(f)}
                  </div>

                  <div className="flex items-center gap-1">
                    <Switch checked={f.is_active} onCheckedChange={() => handleToggleActive(f)} />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(f)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!f.field_key && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover campo?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita. O campo "{f.label}" será removido permanentemente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(f.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" className="w-full border-dashed border-2" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />Adicionar pergunta
          </Button>
        </div>
      )}

      {/* Edit/Add Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-primary">{editingField ? "EDITAR CAMPO" : "NOVO CAMPO"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-sans">Pergunta *</Label>
              <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} className="bg-secondary border-border" placeholder="Ex: Qual seu nome completo?" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">Tipo do campo</Label>
              <Select value={form.field_type} onValueChange={v => setForm({ ...form, field_type: v })}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_required} onCheckedChange={v => setForm({ ...form, is_required: v })} />
              <Label className="font-sans">Obrigatório</Label>
            </div>

            {needsOptions && (
              <div className="space-y-2">
                <Label className="font-sans">Opções</Label>
                <div className="space-y-1.5">
                  {form.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-sans bg-secondary border border-border rounded-md px-3 py-1.5">{o}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeOption(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newOption}
                    onChange={e => setNewOption(e.target.value)}
                    placeholder="Nova opção..."
                    className="bg-secondary border-border"
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addOption())}
                  />
                  <Button variant="outline" size="sm" onClick={addOption}>Adicionar</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.label.trim()}>
              {saving ? "Salvando..." : editingField ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
