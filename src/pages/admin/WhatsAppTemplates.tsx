import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Plus, Trash2, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";

type Template = {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
};

export default function WhatsAppTemplates() {
  const { user, role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();

  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [tplTitle, setTplTitle] = useState("");
  const [tplContent, setTplContent] = useState("");
  const [tplShortcut, setTplShortcut] = useState("");

  const loadTemplates = useCallback(async () => {
    let query = supabase.from("message_templates").select("*");
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    const { data } = await query.order("title");
    if (data) setTemplates(data as Template[]);
  }, [effectiveCompanyId]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const openNew = () => {
    setEditingTemplate(null);
    setTplTitle("");
    setTplContent("");
    setTplShortcut("");
    setDialogOpen(true);
  };

  const openEdit = (tpl: Template) => {
    setEditingTemplate(tpl);
    setTplTitle(tpl.title);
    setTplContent(tpl.content);
    setTplShortcut(tpl.shortcut || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tplTitle.trim() || !tplContent.trim()) return;
    if (!effectiveCompanyId) {
      toast.error("Selecione uma empresa para gerenciar templates");
      return;
    }

    if (editingTemplate) {
      let query = supabase.from("message_templates").update({
        title: tplTitle.trim(),
        content: tplContent.trim(),
        shortcut: tplShortcut.trim() || null,
      } as any).eq("id", editingTemplate.id);
      query = query.eq("company_id", effectiveCompanyId);
      await query;
      toast.success("Template atualizado");
    } else {
      await supabase.from("message_templates").insert({
        company_id: effectiveCompanyId,
        title: tplTitle.trim(),
        content: tplContent.trim(),
        shortcut: tplShortcut.trim() || null,
        created_by: user?.id,
      } as any);
      toast.success("Template criado");
    }
    setDialogOpen(false);
    loadTemplates();
  };

  const handleDelete = async (id: string) => {
    let query = supabase.from("message_templates").delete().eq("id", id);
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    await query;
    loadTemplates();
    toast.success("Template removido");
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-wide">Templates de Mensagem</h1>
            <p className="text-muted-foreground font-sans text-xs sm:text-sm">Use o comando <code className="bg-muted px-1 rounded text-xs">/</code> nas conversas para inserir</p>
          </div>
          <Button size="sm" className="gap-1 shrink-0" onClick={openNew}>
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo Template</span><span className="sm:hidden">Novo</span>
          </Button>
        </div>

        <div className="flex-1 border border-border rounded-lg overflow-hidden bg-card">
          <ScrollArea className="h-full p-3 sm:p-4">
            <div className="space-y-3 max-w-2xl mx-auto">
              {templates.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhum template criado.</p>
                  <p className="text-xs mt-1">Crie templates para usar com o comando <code className="bg-muted px-1 rounded">/</code> nas conversas.</p>
                </div>
              ) : (
                templates.map(tpl => (
                  <div key={tpl.id} className="border border-border rounded-lg p-3 sm:p-4 space-y-2 bg-muted/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium text-foreground">{tpl.title}</span>
                        {tpl.shortcut && <Badge variant="secondary" className="text-[10px]">/{tpl.shortcut}</Badge>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tpl)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(tpl.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{tpl.content}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={tplTitle} onChange={e => setTplTitle(e.target.value)} placeholder="Ex: Boas-vindas" />
              </div>
              <div className="space-y-2">
                <Label>Atalho (usado com /)</Label>
                <Input value={tplShortcut} onChange={e => setTplShortcut(e.target.value)} placeholder="Ex: boasvindas" />
              </div>
              <div className="space-y-2">
                <Label>Conteúdo</Label>
                <Textarea
                  value={tplContent}
                  onChange={e => setTplContent(e.target.value)}
                  placeholder="Olá {{nome}}, seja bem-vindo(a)!"
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">Use {"{{nome}}"} para inserir o nome do aluno automaticamente.</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!tplTitle.trim() || !tplContent.trim()} className="w-full sm:w-auto">
                {editingTemplate ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
