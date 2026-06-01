import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pin, Megaphone, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Announcement {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  pinned: boolean;
  published_at: string;
}

interface Props {
  studentId: string;
  companyId: string;
}

export function AnnouncementsFeed({ studentId, companyId }: Props) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, [companyId, studentId]);

  const load = async () => {
    setLoading(true);
    const { data: ann } = await supabase
      .from("announcements")
      .select("*")
      .eq("company_id", companyId)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(50);
    setItems(ann || []);

    const { data: reads } = await supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("student_id", studentId);
    setReadIds(new Set((reads || []).map(r => r.announcement_id)));
    setLoading(false);
  };

  const markRead = async (id: string) => {
    if (readIds.has(id)) return;
    const newSet = new Set(readIds);
    newSet.add(id);
    setReadIds(newSet);
    await supabase.from("announcement_reads").upsert(
      { announcement_id: id, student_id: studentId },
      { onConflict: "announcement_id,student_id" }
    );
  };

  const handleToggle = (id: string, isOpen: boolean) => {
    const ns = new Set(openedIds);
    if (isOpen) {
      ns.add(id);
      markRead(id);
    } else {
      ns.delete(id);
    }
    setOpenedIds(ns);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  if (items.length === 0) {
    return (
      <Card className="bg-card border-border border-dashed">
        <CardContent className="p-8 text-center">
          <Megaphone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground font-sans">Sem avisos no momento.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map(a => {
        const unread = !readIds.has(a.id);
        return (
          <Collapsible
            key={a.id}
            open={openedIds.has(a.id)}
            onOpenChange={(o) => handleToggle(a.id, o)}
          >
            <Card className={`bg-card border-border transition-all ${unread ? "border-primary/40" : ""}`}>
              <CollapsibleTrigger asChild>
                <button className="w-full text-left">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {a.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                          <h4 className="text-sm font-bold text-foreground font-sans">{a.title}</h4>
                          {unread && (
                            <Badge className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0">Novo</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
                          {format(parseISO(a.published_at), "dd MMM yyyy · HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4 pt-0">
                  {a.image_url && (
                    <img src={a.image_url} alt={a.title} className="w-full rounded-md mb-3 max-h-80 object-cover" loading="lazy" />
                  )}
                  <p className="text-sm text-foreground font-sans whitespace-pre-wrap">{a.body}</p>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}

export async function getUnreadAnnouncementCount(studentId: string, companyId: string): Promise<number> {
  const { data: ann } = await supabase
    .from("announcements")
    .select("id")
    .eq("company_id", companyId);
  if (!ann || ann.length === 0) return 0;
  const { data: reads } = await supabase
    .from("announcement_reads")
    .select("announcement_id")
    .eq("student_id", studentId);
  const readSet = new Set((reads || []).map(r => r.announcement_id));
  return ann.filter(a => !readSet.has(a.id)).length;
}
