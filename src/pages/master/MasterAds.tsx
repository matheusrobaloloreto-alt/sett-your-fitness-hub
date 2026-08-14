import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ImagePlus, Megaphone, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Audience = "professional" | "student";
type Placement = "dashboard_banner" | "footer";
type Scope = "all" | "company" | "student";

interface Company { id: string; name: string }
interface Student { id: string; full_name: string; company_id: string | null }
interface PlatformAd {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  audience: Audience;
  placement: Placement;
  scope: Scope;
  company_id: string | null;
  student_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  priority: number;
}

const emptyForm = {
  title: "",
  body: "",
  image_url: "",
  cta_label: "Saiba mais",
  cta_url: "",
  audience: "professional" as Audience,
  placement: "dashboard_banner" as Placement,
  scope: "all" as Scope,
  company_id: "",
  student_id: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
  priority: "0",
};

const toLocalInput = (value: string | null) => value ? value.slice(0, 16) : "";

export default function MasterAds() {
  const [ads, setAds] = useState<PlatformAd[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const filteredStudents = useMemo(
    () => students.filter((student) => !form.company_id || student.company_id === form.company_id),
    [students, form.company_id],
  );

  const load = async () => {
    setLoading(true);
    const [adsResult, companiesResult, studentsResult] = await Promise.all([
      (supabase as any).from("platform_ads").select("*").order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("students").select("id, full_name, company_id").order("full_name").limit(5000),
    ]);
    if (adsResult.error) toast.error(`Erro ao carregar anúncios: ${adsResult.error.message}`);
    setAds((adsResult.data || []) as PlatformAd[]);
    setCompanies((companiesResult.data || []) as Company[]);
    setStudents((studentsResult.data || []) as Student[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const edit = (ad: PlatformAd) => {
    setEditingId(ad.id);
    setForm({
      title: ad.title,
      body: ad.body || "",
      image_url: ad.image_url || "",
      cta_label: ad.cta_label || "Saiba mais",
      cta_url: ad.cta_url || "",
      audience: ad.audience,
      placement: ad.placement,
      scope: ad.scope,
      company_id: ad.company_id || "",
      student_id: ad.student_id || "",
      starts_at: toLocalInput(ad.starts_at),
      ends_at: toLocalInput(ad.ends_at),
      is_active: ad.is_active,
      priority: String(ad.priority),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida.");
      return;
    }
    setUploading(true);
    const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("platform-ads").upload(path, file, { upsert: false });
    if (error) {
      toast.error(`Falha no upload: ${error.message}`);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("platform-ads").getPublicUrl(path);
    setForm((current) => ({ ...current, image_url: data.publicUrl }));
    setUploading(false);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Informe o título do anúncio.");
    if (form.scope !== "all" && !form.company_id) return toast.error("Selecione uma empresa.");
    if (form.scope === "student" && !form.student_id) return toast.error("Selecione um aluno.");

    const payload = {
      title: form.title.trim(),
      body: form.body.trim() || null,
      image_url: form.image_url || null,
      cta_label: form.cta_url ? (form.cta_label.trim() || "Saiba mais") : null,
      cta_url: form.cta_url.trim() || null,
      audience: form.audience,
      placement: form.placement,
      scope: form.scope,
      company_id: form.scope === "all" ? null : form.company_id,
      student_id: form.scope === "student" ? form.student_id : null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_active: form.is_active,
      priority: Number(form.priority) || 0,
    };
    setSaving(true);
    const query = editingId
      ? (supabase as any).from("platform_ads").update(payload).eq("id", editingId)
      : (supabase as any).from("platform_ads").insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) return toast.error(`Erro ao salvar: ${error.message}`);
    toast.success(editingId ? "Anúncio atualizado." : "Anúncio criado.");
    reset();
    void load();
  };

  const remove = async (ad: PlatformAd) => {
    if (!window.confirm(`Excluir o anúncio “${ad.title}”?`)) return;
    const { error } = await (supabase as any).from("platform_ads").delete().eq("id", ad.id);
    if (error) return toast.error(`Erro ao excluir: ${error.message}`);
    setAds((current) => current.filter((item) => item.id !== ad.id));
    toast.success("Anúncio excluído.");
  };

  const companyName = (id: string | null) => companies.find((company) => company.id === id)?.name || "Todas as empresas";
  const studentName = (id: string | null) => students.find((student) => student.id === id)?.full_name || "Todos";

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Monetização e comunicação</p>
          <h1 className="font-display text-4xl text-foreground">Anúncios da plataforma</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Publique campanhas sem alterar a interface. Quando não há anúncio ativo, nenhum espaço aparece.</p>
        </div>
        {editingId && <Button variant="outline" onClick={reset}><X className="mr-2 h-4 w-4" />Cancelar edição</Button>}
      </div>

      <section className="grid gap-6 rounded-xl border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Título</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex: Curso de avaliação funcional" /></div>
          <div className="sm:col-span-2"><Label>Texto</Label><Textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Benefício principal e contexto da oferta" /></div>
          <div><Label>Público</Label><Select value={form.audience} onValueChange={(value: Audience) => setForm({ ...form, audience: value, scope: value === "professional" && form.scope === "student" ? "company" : form.scope, student_id: value === "professional" ? "" : form.student_id })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="professional">App profissional</SelectItem><SelectItem value="student">App do aluno</SelectItem></SelectContent></Select></div>
          <div><Label>Posição</Label><Select value={form.placement} onValueChange={(value: Placement) => setForm({ ...form, placement: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dashboard_banner">Banner no painel</SelectItem><SelectItem value="footer">Rodapé discreto</SelectItem></SelectContent></Select></div>
          <div><Label>Alcance</Label><Select value={form.scope} onValueChange={(value: Scope) => setForm({ ...form, scope: value, company_id: value === "all" ? "" : form.company_id, student_id: value === "student" ? form.student_id : "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="company">Empresa específica</SelectItem>{form.audience === "student" && <SelectItem value="student">Aluno específico</SelectItem>}</SelectContent></Select></div>
          {form.scope !== "all" && <div><Label>Empresa</Label><Select value={form.company_id} onValueChange={(value) => setForm({ ...form, company_id: value, student_id: "" })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}</SelectContent></Select></div>}
          {form.scope === "student" && <div><Label>Aluno</Label><Select value={form.student_id} onValueChange={(value) => setForm({ ...form, student_id: value })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{filteredStudents.map((student) => <SelectItem key={student.id} value={student.id}>{student.full_name}</SelectItem>)}</SelectContent></Select></div>}
          <div><Label>Texto do botão</Label><Input value={form.cta_label} onChange={(event) => setForm({ ...form, cta_label: event.target.value })} placeholder="Saiba mais" /></div>
          <div><Label>Link do botão</Label><Input value={form.cta_url} onChange={(event) => setForm({ ...form, cta_url: event.target.value })} placeholder="https://..." /></div>
          <div><Label>Início (opcional)</Label><Input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} /></div>
          <div><Label>Fim (opcional)</Label><Input type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} /></div>
          <div><Label>Prioridade</Label><Input type="number" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} /></div>
          <div className="flex items-end gap-3 pb-2"><Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} /><Label>Campanha ativa</Label></div>
        </div>

        <div className="space-y-4">
          <Label>Imagem do banner</Label>
          <label className="flex min-h-48 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/30 bg-muted/30 text-center">
            {form.image_url ? <img src={form.image_url} alt="Prévia" className="h-full min-h-48 w-full object-cover" /> : <span className="p-6 text-sm text-muted-foreground"><ImagePlus className="mx-auto mb-2 h-8 w-8" />{uploading ? "Enviando..." : "Clique para enviar JPG, PNG, WebP ou GIF"}</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => void uploadImage(event.target.files?.[0])} disabled={uploading} />
          </label>
          {form.image_url && <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, image_url: "" })}><Trash2 className="mr-2 h-4 w-4" />Remover imagem</Button>}
          <Button className="w-full" onClick={() => void save()} disabled={saving || uploading}>{editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar anúncio"}</Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /><h2 className="font-display text-2xl">Campanhas</h2></div>
        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : ads.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum anúncio criado.</div> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {ads.map((ad) => (
              <article key={ad.id} className="overflow-hidden rounded-xl border border-border bg-card">
                {ad.image_url && <img src={ad.image_url} alt="" className="h-36 w-full object-cover" />}
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-xl">{ad.title}</h3><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ad.body || "Sem texto adicional"}</p></div><Badge variant={ad.is_active ? "default" : "secondary"}>{ad.is_active ? "Ativo" : "Pausado"}</Badge></div>
                  <div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">{ad.audience === "professional" ? "Profissional" : "Aluno"}</Badge><Badge variant="outline">{ad.placement === "dashboard_banner" ? "Banner" : "Rodapé"}</Badge><Badge variant="outline">{ad.scope === "all" ? "Todos" : ad.scope === "company" ? companyName(ad.company_id) : `${studentName(ad.student_id)} · ${companyName(ad.company_id)}`}</Badge></div>
                  <div className="flex items-center justify-end gap-2">{ad.cta_url && <Button variant="ghost" size="icon" asChild><a href={ad.cta_url} target="_blank" rel="noreferrer" title="Abrir destino"><ExternalLink className="h-4 w-4" /></a></Button>}<Button variant="outline" size="sm" onClick={() => edit(ad)}><Pencil className="mr-2 h-4 w-4" />Editar</Button><Button variant="ghost" size="icon" onClick={() => void remove(ad)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
