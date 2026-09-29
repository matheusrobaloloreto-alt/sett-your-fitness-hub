import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { TEMPLATE_VARIABLES } from "@/lib/templateVars";
import {
  createMessageTemplateAttachmentPath,
  parseMessageTemplateAttachments,
  type MediaMessageTemplate,
  type MessageTemplateAttachment,
} from "@/lib/messageTemplateMedia";
import { resumableWhatsAppUpload, selectWhatsAppUploadMode, uploadWhatsAppMediaWith } from "@/lib/whatsappMediaUpload";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, FileText, Pencil, Paperclip, Loader2, Image, Film, Music, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  const Icon = mimeType.startsWith("image/") ? Image
    : mimeType.startsWith("video/") ? Film : mimeType.startsWith("audio/") ? Music : FileText;
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function AttachmentPreview({ attachment }: { attachment: MessageTemplateAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const canPreview = /^(image|video|audio)\//.test(attachment.mimeType);

  useEffect(() => {
    if (!canPreview) return;
    let active = true;
    const sign = async () => {
      try {
        const { data, error } = await supabase.storage.from("whatsapp-media").createSignedUrl(attachment.path, 600);
        if (error || !data?.signedUrl) throw new Error("Prévia indisponível");
        if (active) { setUrl(data.signedUrl); setFailed(false); }
      } catch {
        if (active) { setUrl(null); setFailed(true); }
      }
    };
    void sign();
    const interval = window.setInterval(() => { void sign(); }, 480_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [attachment.path, canPreview]);

  if (!canPreview) return null;
  if (failed) return <p className="text-xs text-muted-foreground">Prévia indisponível</p>;
  if (!url) return <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando prévia" />;
  if (attachment.mimeType.startsWith("image/")) {
    return <img src={url} alt={attachment.name} className="max-h-48 w-full object-contain rounded" onError={() => setFailed(true)} />;
  }
  if (attachment.mimeType.startsWith("video/")) {
    return <video src={url} controls preload="metadata" className="max-h-48 w-full rounded" onError={() => setFailed(true)} />;
  }
  return <audio src={url} controls preload="metadata" className="w-full min-w-0" onError={() => setFailed(true)} />;
}

export default function WhatsAppTemplates() {
  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();

  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const [templates, setTemplates] = useState<MediaMessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MediaMessageTemplate | null>(null);
  const [tplTitle, setTplTitle] = useState("");
  const [tplContent, setTplContent] = useState("");
  const [tplShortcut, setTplShortcut] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [editorCompanyId, setEditorCompanyId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MessageTemplateAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; percentage: number; index: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaMessageTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftUploads = useRef<string[]>([]);
  const uncertainSave = useRef<{ companyId: string; templateId: string } | null>(null);
  const editorVersion = useRef(0);
  const requestVersion = useRef(0);
  const busy = useRef(false);

  const invalidatePendingWork = useCallback(() => {
    editorVersion.current++;
    requestVersion.current++;
  }, []);

  const removeDraftFiles = useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    try {
      const { error } = await supabase.storage.from("whatsapp-media").remove(paths);
      if (error) throw new Error(error.message);
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível limpar os arquivos não salvos"));
    }
  }, []);

  const discardDraftUploads = useCallback(() => {
    const paths = draftUploads.current;
    draftUploads.current = [];
    void removeDraftFiles(paths);
  }, [removeDraftFiles]);

  const loadTemplates = useCallback(async () => {
    const version = ++requestVersion.current;
    setTemplates([]);
    setLoadError(false);
    if (!effectiveCompanyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from("message_templates").select("*")
        .eq("company_id", effectiveCompanyId).order("title");
      if (error) throw new Error(error.message);
      if (version === requestVersion.current) {
        setTemplates((data || []).map((row) => ({ ...row, title: row.title || row.name })));
      }
    } catch (error) {
      if (version === requestVersion.current) {
        setLoadError(true);
        toast.error(errorMessage(error, "Não foi possível carregar os templates"));
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [effectiveCompanyId]);

  useEffect(() => {
    editorVersion.current++;
    busy.current = false;
    setDialogOpen(false);
    setDeleteTarget(null);
    setUploading(false);
    setSaving(false);
    setDeleting(false);
    setAttachments([]);
    discardDraftUploads();
    void loadTemplates();
    return () => {
      invalidatePendingWork();
      discardDraftUploads();
    };
  }, [loadTemplates, discardDraftUploads, invalidatePendingWork]);

  const openNew = () => {
    if (!effectiveCompanyId || busy.current) return;
    editorVersion.current++;
    uncertainSave.current = null;
    setEditingTemplate(null);
    setTemplateId(crypto.randomUUID());
    setEditorCompanyId(effectiveCompanyId);
    setAttachments([]);
    setTplTitle("");
    setTplContent("");
    setTplShortcut("");
    setDialogOpen(true);
  };

  const openEdit = (tpl: MediaMessageTemplate) => {
    if (!effectiveCompanyId || busy.current) return;
    const parsed = parseMessageTemplateAttachments(tpl.attachments);
    if ((tpl.attachments != null && (!Array.isArray(tpl.attachments) || parsed.length !== tpl.attachments.length)) ||
      parsed.some((item) => !item.path.startsWith(`${effectiveCompanyId}/templates/${tpl.id}/`))) {
      toast.error("Este template contém anexos inválidos. Corrija os dados antes de editar.");
      return;
    }
    editorVersion.current++;
    uncertainSave.current = null;
    setEditingTemplate(tpl);
    setTemplateId(tpl.id);
    setEditorCompanyId(effectiveCompanyId);
    setAttachments(parsed);
    setTplTitle(tpl.title);
    setTplContent(tpl.content);
    setTplShortcut(tpl.shortcut || "");
    setDialogOpen(true);
  };

  const closeEditor = (open: boolean) => {
    if (busy.current) return;
    if (!open) {
      editorVersion.current++;
      discardDraftUploads();
      setAttachments([]);
    }
    setDialogOpen(open);
  };

  const handleUpload = async (files: File[]) => {
    if (!files.length || busy.current || !effectiveCompanyId || editorCompanyId !== effectiveCompanyId) return;
    const version = editorVersion.current;
    const uploadCompanyId = effectiveCompanyId;
    busy.current = true;
    setUploading(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) throw new Error("Sessão expirada. Entre novamente para anexar arquivos.");
      for (const [index, file] of files.entries()) {
        if (version !== editorVersion.current) break;
        let path: string | null = null;
        try {
          selectWhatsAppUploadMode(file.size);
          path = createMessageTemplateAttachmentPath(uploadCompanyId, templateId, file.name);
          setUploadProgress({ name: file.name, percentage: 0, index: index + 1, total: files.length });
          await uploadWhatsAppMediaWith({
            file,
            path,
            standardUpload: async (uploadFile, uploadPath, onProgress) => {
              const { error } = await supabase.storage.from("whatsapp-media").upload(uploadPath, uploadFile, {
                contentType: uploadFile.type || "application/octet-stream",
                upsert: false,
              });
              if (error) throw new Error(error.message);
              onProgress?.(100);
            },
            resumableUpload: (uploadFile, uploadPath, onProgress) => resumableWhatsAppUpload({
              file: uploadFile, path: uploadPath, projectUrl: import.meta.env.VITE_SUPABASE_URL,
              accessToken: session.access_token, onProgress,
            }),
            onProgress: (percentage) => {
              if (version === editorVersion.current) setUploadProgress({ name: file.name, percentage, index: index + 1, total: files.length });
            },
          });
          if (version !== editorVersion.current) { await removeDraftFiles([path]); break; }
          draftUploads.current.push(path);
          const uploadedPath = path;
          setAttachments((previous) => [...previous, {
            path: uploadedPath, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size,
          }]);
        } catch (error) {
          if (path) await removeDraftFiles([path]);
          if (version === editorVersion.current) toast.error(`${file.name}: ${errorMessage(error, "Falha no upload")}`);
        }
      }
    } catch (error) {
      if (version === editorVersion.current) toast.error(errorMessage(error, "Não foi possível anexar os arquivos"));
    } finally {
      if (version === editorVersion.current) {
        busy.current = false;
        setUploading(false);
        setUploadProgress(null);
      }
    }
  };

  const removeAttachment = (attachment: MessageTemplateAttachment) => {
    if (busy.current) return;
    setAttachments((previous) => previous.filter((item) => item.path !== attachment.path));
    if (draftUploads.current.includes(attachment.path)) {
      draftUploads.current = draftUploads.current.filter((path) => path !== attachment.path);
      void removeDraftFiles([attachment.path]);
    }
  };

  const handleSave = async () => {
    if (busy.current || !tplTitle.trim() || (!tplContent.trim() && !attachments.length)) return;
    if (!effectiveCompanyId || editorCompanyId !== effectiveCompanyId) {
      toast.error("Selecione uma empresa para gerenciar templates");
      return;
    }

    const version = editorVersion.current;
    busy.current = true;
    setSaving(true);
    let submitted = false;
    const payload = {
      name: tplTitle.trim(), title: tplTitle.trim(), content: tplContent.trim(),
      shortcut: tplShortcut.trim() || null, attachments: parseMessageTemplateAttachments(attachments),
    };
    const finishSave = () => {
      if (version !== editorVersion.current) return;
      uncertainSave.current = null;
      draftUploads.current = [];
      setDialogOpen(false);
      toast.success(editingTemplate ? "Template atualizado" : "Template criado");
      void loadTemplates();
    };
    const reconcile = async () => {
      const { data, error } = await supabase.from("message_templates").select("*")
        .eq("id", templateId).eq("company_id", effectiveCompanyId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return "missing";
      const saved = data as MediaMessageTemplate & { name: string; company_id: string };
      const savedAttachments = parseMessageTemplateAttachments(saved.attachments);
      return saved.id === templateId && saved.company_id === effectiveCompanyId && saved.name === payload.name && saved.title === payload.title
        && saved.content === payload.content && saved.shortcut === payload.shortcut
        && Array.isArray(saved.attachments) && savedAttachments.length === saved.attachments.length
        && JSON.stringify(savedAttachments) === JSON.stringify(payload.attachments) ? "saved" : "different";
    };
    try {
      if (payload.attachments.length !== attachments.length || payload.attachments.some((item) => !item.path.startsWith(`${effectiveCompanyId}/templates/${templateId}/`))) {
        throw new Error("Os anexos não pertencem a este template");
      }
      if (uncertainSave.current?.companyId === effectiveCompanyId && uncertainSave.current.templateId === templateId) {
        const status = await reconcile();
        if (version !== editorVersion.current) return;
        if (status === "saved") { finishSave(); return; }
        if (status === "different") throw new Error("O template salvo mudou. Reabra os templates antes de tentar novamente.");
      }
      // Submitted files may already be referenced even when the response is lost.
      // Never return them to the disposable draft list after a transport error.
      submitted = true;
      uncertainSave.current = { companyId: effectiveCompanyId, templateId };
      draftUploads.current = [];
      const query = editingTemplate
        ? supabase.from("message_templates").update(payload).eq("id", templateId).eq("company_id", effectiveCompanyId)
        : supabase.from("message_templates").insert({ ...payload, id: templateId, company_id: effectiveCompanyId });
      const { data, error } = await query.select("id").single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("O template não foi salvo");
      finishSave();
    } catch (error) {
      if (version === editorVersion.current) {
        if (submitted) {
          try {
            if (await reconcile() === "saved") { finishSave(); return; }
          } catch { /* An unreadable outcome cannot authorize deletion of submitted files. */ }
        }
        if (version !== editorVersion.current) return;
        toast.error(errorMessage(error, "Não foi possível salvar o template"));
      }
    } finally {
      if (version === editorVersion.current) { busy.current = false; setSaving(false); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!effectiveCompanyId || busy.current) return;
    const version = editorVersion.current;
    busy.current = true;
    setDeleting(true);
    try {
      const { data, error } = await supabase.from("message_templates").delete().eq("id", id)
        .eq("company_id", effectiveCompanyId).select("id").single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("O template não foi removido");
      if (version === editorVersion.current) {
        setDeleteTarget(null);
        toast.success("Template removido");
        void loadTemplates();
      }
    } catch (error) {
      if (version === editorVersion.current) toast.error(errorMessage(error, "Não foi possível remover o template"));
    } finally {
      if (version === editorVersion.current) { busy.current = false; setDeleting(false); }
    }
  };

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-primary">Templates de Mensagem</h1>
          </div>
          <Button size="sm" className="gap-1 shrink-0" onClick={openNew} disabled={!effectiveCompanyId || deleting}>
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo Template</span><span className="sm:hidden">Novo</span>
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full p-3 sm:p-4">
            <div className="space-y-3 max-w-2xl mx-auto">
              {!effectiveCompanyId ? (
                <p className="p-6 text-center text-muted-foreground text-sm">Selecione uma empresa.</p>
              ) : loading ? (
                <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando templates" /></div>
              ) : loadError ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-sm text-destructive">Não foi possível carregar os templates.</p>
                  <Button variant="outline" size="sm" onClick={() => { void loadTemplates(); }}>Tentar novamente</Button>
                </div>
              ) : templates.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhum template criado.</p>
                </div>
              ) : (
                templates.map(tpl => (
                  <div key={tpl.id} className="border border-border rounded-lg p-3 sm:p-4 space-y-2 bg-muted/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium text-foreground break-words min-w-0">{tpl.title}</span>
                        {tpl.shortcut && <Badge variant="secondary" className="text-[10px] max-w-full break-all">/{tpl.shortcut}</Badge>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tpl)} disabled={deleting} title="Editar template" aria-label={`Editar ${tpl.title}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(tpl)} disabled={deleting} title="Excluir template" aria-label={`Excluir ${tpl.title}`}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {tpl.content && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{tpl.content}</p>}
                    {parseMessageTemplateAttachments(tpl.attachments).map((attachment) => (
                      <div key={attachment.path} className="flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
                        <AttachmentIcon mimeType={attachment.mimeType} />
                        <span className="min-w-0 break-all">{attachment.name}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <Dialog open={dialogOpen} onOpenChange={closeEditor}>
          <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-title">Título</Label>
                <Input id="template-title" value={tplTitle} onChange={e => setTplTitle(e.target.value)} placeholder="Ex: Boas-vindas" disabled={saving || uploading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-shortcut">Atalho (usado com /)</Label>
                <Input id="template-shortcut" value={tplShortcut} onChange={e => setTplShortcut(e.target.value)} placeholder="Ex: boasvindas" disabled={saving || uploading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-content">Conteúdo{attachments.length > 0 ? " (opcional)" : ""}</Label>
                <Textarea
                  id="template-content"
                  value={tplContent}
                  onChange={e => setTplContent(e.target.value)}
                  placeholder="Olá {{nome}}, seja bem-vindo(a)!"
                  className="min-h-[120px]"
                  disabled={saving || uploading}
                />
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Variáveis</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map(v => (
                      <button
                        key={v.key}
                        type="button"
                        disabled={saving || uploading}
                        onClick={() => setTplContent(prev => `${prev}{{${v.key}}}`)}
                        className="font-mono-data text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                        title={v.label}
                      >
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Anexos{attachments.length ? ` (${attachments.length})` : ""}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading || saving} className="gap-2">
                    <Paperclip className="h-4 w-4" />Anexar
                  </Button>
                  <input ref={fileInput} type="file" multiple className="hidden" aria-label="Selecionar anexos" onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    event.target.value = "";
                    void handleUpload(files);
                  }} />
                </div>
                {uploadProgress && (
                  <div className="space-y-1" role="status" aria-live="polite">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="break-all min-w-0">{uploadProgress.index}/{uploadProgress.total}: {uploadProgress.name}</span>
                      <span className="shrink-0">{uploadProgress.percentage}%</span>
                    </div>
                    <Progress value={uploadProgress.percentage} aria-label="Progresso do upload" />
                  </div>
                )}
                {attachments.map((attachment) => (
                  <div key={attachment.path} className="border rounded-lg p-3 space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <AttachmentIcon mimeType={attachment.mimeType} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm break-all">{attachment.name}</p>
                        <p className="text-xs text-muted-foreground">{(attachment.size / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={uploading || saving} onClick={() => removeAttachment(attachment)} title="Remover anexo" aria-label={`Remover ${attachment.name}`}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <AttachmentPreview attachment={attachment} />
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => closeEditor(false)} disabled={saving || uploading}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || uploading || !tplTitle.trim() || (!tplContent.trim() && !attachments.length)} className="w-full sm:w-auto gap-2">
                {(saving || uploading) && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingTemplate ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir template?</AlertDialogTitle>
              <AlertDialogDescription className="break-words">{deleteTarget?.title}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={deleting} onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void handleDelete(deleteTarget.id);
              }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
