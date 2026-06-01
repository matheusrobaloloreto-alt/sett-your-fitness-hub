import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X } from "lucide-react";

interface Existing {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  pinned: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  authorId: string;
  existing?: Existing | null;
  onSaved?: () => void;
}

export function AnnouncementEditor({ open, onClose, companyId, authorId, existing, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setBody(existing.body);
      setImageUrl(existing.image_url);
      setPinned(existing.pinned);
    } else {
      setTitle("");
      setBody("");
      setImageUrl(null);
      setPinned(false);
    }
  }, [existing, open]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `announcements/${companyId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("platform-assets").upload(path, file, { upsert: false });
    if (error) {
      toast({ title: "Erro ao enviar imagem", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("platform-assets").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Preencha título e conteúdo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      company_id: companyId,
      author_id: authorId,
      title: title.trim(),
      body: body.trim(),
      image_url: imageUrl,
      pinned,
    };
    const { error } = existing
      ? await supabase.from("announcements").update(payload).eq("id", existing.id)
      : await supabase.from("announcements").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: existing ? "Aviso atualizado" : "Aviso publicado" });
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Editar aviso" : "Novo aviso"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Título</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Horário de funcionamento no feriado" maxLength={140} />
          </div>

          <div>
            <Label htmlFor="body">Conteúdo</Label>
            <Textarea id="body" value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder="Escreva sua mensagem para os alunos..." />
          </div>

          <div>
            <Label>Imagem (opcional)</Label>
            {imageUrl ? (
              <div className="relative mt-2">
                <img src={imageUrl} alt="Preview" className="w-full max-h-48 object-cover rounded-md" />
                <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => setImageUrl(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="mt-2 flex items-center justify-center gap-2 border border-dashed border-border rounded-md p-4 cursor-pointer hover:bg-accent/30">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm text-muted-foreground">{uploading ? "Enviando..." : "Clique para enviar imagem"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
                />
              </label>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="pinned" className="cursor-pointer">Fixar no topo</Label>
              <p className="text-xs text-muted-foreground">Avisos fixados aparecem antes dos demais</p>
            </div>
            <Switch id="pinned" checked={pinned} onCheckedChange={setPinned} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {existing ? "Atualizar" : "Publicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
