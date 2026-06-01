import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pin, Pencil, Trash2, Megaphone, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnnouncementEditor } from "@/components/admin/AnnouncementEditor";
import { useToast } from "@/hooks/use-toast";
import { useMaster } from "@/contexts/MasterContext";


interface Announcement {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  pinned: boolean;
  published_at: string;
  author_id: string | null;
}

export default function Announcements() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { viewingCompany } = useMaster();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  useEffect(() => {
    (async () => {
      if (viewingCompany?.id) {
        setCompanyId(viewingCompany.id);
        return;
      }
      const { data } = await supabase.from("company_members").select("company_id").eq("user_id", user!.id).maybeSingle();
      setCompanyId(data?.company_id || null);
    })();
  }, [user, viewingCompany]);


  useEffect(() => {
    if (companyId) load();
  }, [companyId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("announcements")
      .select("*")
      .eq("company_id", companyId!)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apagar este aviso?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Aviso removido" });
    load();
  };

  const togglePinned = async (a: Announcement) => {
    await supabase.from("announcements").update({ pinned: !a.pinned }).eq("id", a.id);
    load();
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Mural de avisos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Publique avisos, conteúdo educativo e mensagens para todos os alunos da empresa.
            </p>
          </div>
          <Button onClick={() => { setEditing(null); setEditorOpen(true); }} disabled={!companyId}>
            <Plus className="h-4 w-4 mr-2" />
            Novo aviso
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Megaphone className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum aviso publicado ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em "Novo aviso" para começar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map(a => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {a.pinned && (
                          <Badge variant="outline" className="text-[10px] border-primary text-primary">
                            <Pin className="h-2.5 w-2.5 mr-1" />Fixado
                          </Badge>
                        )}
                        <h3 className="text-base font-semibold text-foreground">{a.title}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mb-2">
                        {format(parseISO(a.published_at), "dd MMM yyyy · HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{a.body}</p>
                      {a.image_url && (
                        <img src={a.image_url} alt="" className="mt-3 h-20 w-auto rounded-md object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="icon" onClick={() => togglePinned(a)} title={a.pinned ? "Desafixar" : "Fixar"}>
                        <Pin className={`h-4 w-4 ${a.pinned ? "text-primary fill-primary" : ""}`} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(a); setEditorOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {companyId && user && (
          <AnnouncementEditor
            open={editorOpen}
            onClose={() => setEditorOpen(false)}
            companyId={companyId}
            authorId={user.id}
            existing={editing}
            onSaved={load}
          />
        )}
      </div>
    </AppLayout>
  );
}
