import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Activity, Clock, MapPin, Pencil, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalActivityForm, ACTIVITY_TYPES } from "./ExternalActivityForm";
import { useToast } from "@/hooks/use-toast";

interface Activity {
  id: string;
  activity_type: string;
  activity_date: string;
  duration_minutes: number | null;
  distance_km: number | null;
  intensity: number | null;
  notes: string | null;
}

interface Props {
  studentId: string;
  companyId: string;
}

export function ExternalActivitiesList({ studentId, companyId }: Props) {
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("external_activities")
      .select("*")
      .eq("student_id", studentId)
      .order("activity_date", { ascending: false })
      .limit(30);
    setActivities(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [studentId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Apagar esta atividade?")) return;
    const { error } = await supabase.from("external_activities").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Atividade apagada" });
    load();
  };

  const getLabel = (type: string) => ACTIVITY_TYPES.find(t => t.value === type)?.label || type;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground font-sans flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Atividades externas
        </h3>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Registrar
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground font-sans">Carregando...</p>
      ) : activities.length === 0 ? (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground font-sans">
              Nenhuma atividade externa registrada. Use para corrida, natação, bike e outras modalidades fora da musculação.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activities.map(a => (
            <Card key={a.id} className="bg-card border-border">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                        {getLabel(a.activity_type)}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-sans">
                        {format(parseISO(a.activity_date), "dd MMM", { locale: ptBR })}
                      </span>
                      {a.intensity && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          int {a.intensity}/5
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-foreground font-sans">
                      {a.duration_minutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {a.duration_minutes}min
                        </span>
                      )}
                      {a.distance_km && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {a.distance_km}km
                        </span>
                      )}
                    </div>
                    {a.notes && (
                      <p className="text-xs text-muted-foreground font-sans mt-1.5 line-clamp-2">{a.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(a); setFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExternalActivityForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        studentId={studentId}
        companyId={companyId}
        existing={editing}
        onSaved={load}
      />
    </div>
  );
}
