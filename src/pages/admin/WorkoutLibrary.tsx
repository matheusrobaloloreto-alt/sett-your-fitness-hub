import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, Plus, Sparkles, Pencil, Send, Copy, Trash2, Loader2, Library } from "lucide-react";
import { sendTemplateToStudent } from "@/lib/sendWorkoutTemplate";
import { buildPeriodizationPlan, MESOCYCLES } from "@/lib/periodization";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const OBJ_PRESETS: Record<string, { sets: string; reps: string; rest: string }> = {
  hipertrofia: { sets: "4", reps: "10", rest: "75s" },
  forca: { sets: "5", reps: "5", rest: "150s" },
  emagrecimento: { sets: "3", reps: "15", rest: "45s" },
  condicionamento: { sets: "3", reps: "12", rest: "60s" },
};
// Listas de músculos por sessão conforme a divisão escolhida.
const SPLITS: Record<string, { label: string; day: (i: number) => string[] }> = {
  full_body: { label: "Full Body", day: () => ["quadríceps", "posterior de coxa", "peitoral", "costas", "ombro", "abdômen"] },
  upper_lower: { label: "Upper / Lower", day: (i) => (i % 2 === 0 ? ["peitoral", "costas", "ombro", "bíceps", "tríceps"] : ["quadríceps", "posterior de coxa", "glúteo", "panturrilha", "abdômen"]) },
  ppl: { label: "Push / Pull / Legs", day: (i) => [["peitoral", "ombro", "tríceps"], ["costas", "bíceps", "trapézio"], ["quadríceps", "posterior de coxa", "glúteo", "panturrilha"]][i % 3] },
};

interface Template { id: string; name: string; description: string | null; level: string | null; focus: string | null; workouts: any[]; updated_at: string; }

export default function WorkoutLibrary() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefix = location.pathname.split("/").filter(Boolean)[0] || "admin";
  const { user, companyId: authCompanyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const { toast } = useToast();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : authCompanyId ?? null;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<{ id: string; full_name: string }[]>([]);
  const [sendFor, setSendFor] = useState<Template | null>(null);
  const [sendStudent, setSendStudent] = useState("");
  const [sending, setSending] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ name: "", objetivo: "hipertrofia", nivel: "intermediate", dias: "3", split: "full_body" });
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from("workout_templates").select("*").order("updated_at", { ascending: false });
    if (effectiveCompanyId) q = q.eq("company_id", effectiveCompanyId);
    const { data } = await q;
    setTemplates((data as Template[]) || []);
    setLoading(false);
  };
  // Recarrega ao trocar a empresa em foco (master alternando entre empresas).
  useEffect(() => { load(); }, [effectiveCompanyId]);
  useEffect(() => {
    if (!effectiveCompanyId) return;
    (supabase as any).from("students").select("id, full_name").eq("company_id", effectiveCompanyId).eq("status", "active").order("full_name")
      .then(({ data }: any) => setStudents(data || []));
  }, [effectiveCompanyId]);

  const exCount = (t: Template) => (t.workouts || []).reduce((s, w) => s + (Array.isArray(w?.exercises) ? w.exercises.length : 0), 0);

  const novoManual = async () => {
    const name = window.prompt("Nome do novo treino:");
    if (!name || !name.trim()) return;
    const { data, error } = await (supabase as any).from("workout_templates")
      .insert({ company_id: effectiveCompanyId, name: name.trim(), workouts: [{ title: "Treino A", description: "", exercises: [] }], created_by: user?.id || null })
      .select("id").single();
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    navigate(`/${prefix}/workout/template?tpl=${data.id}`);
  };

  const duplicate = async (t: Template) => {
    const { error } = await (supabase as any).from("workout_templates")
      .insert({ company_id: effectiveCompanyId, name: `${t.name} (cópia)`, description: t.description, level: t.level, focus: t.focus, workouts: t.workouts, created_by: user?.id || null });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Treino duplicado" }); load();
  };

  const remove = async (t: Template) => {
    if (!window.confirm(`Excluir "${t.name}" da biblioteca?`)) return;
    const { error } = await (supabase as any).from("workout_templates").delete().eq("id", t.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setTemplates((cur) => cur.filter((x) => x.id !== t.id));
  };

  const doSend = async () => {
    if (!sendFor || !sendStudent || !effectiveCompanyId) return;
    setSending(true);
    try {
      const r = await sendTemplateToStudent({ template: sendFor, studentId: sendStudent, companyId: effectiveCompanyId, createdBy: user?.id });
      toast({ title: "Treino enviado!", description: `${r.workoutsCreated} sessão(ões) no app do aluno.` });
      setSendFor(null); setSendStudent("");
    } catch (e: any) {
      toast({ title: "Falha ao enviar", description: e?.message || "Erro", variant: "destructive" });
    } finally { setSending(false); }
  };

  const generate = async () => {
    if (!gen.name.trim()) { toast({ title: "Dê um nome ao treino", variant: "destructive" }); return; }
    setGenerating(true);
    try {
      const dias = Math.max(1, Math.min(6, parseInt(gen.dias) || 3));
      const preset = OBJ_PRESETS[gen.objetivo] || OBJ_PRESETS.hipertrofia;
      // Carrega a biblioteca e indexa por muscle_group (antigos por músculo).
      const { data: libRaw } = await (supabase as any).from("exercise_library")
        .select("id, name, muscle_group, youtube_video_id, video_url, video_path").limit(2000);
      const byMuscle: Record<string, any[]> = {};
      (libRaw || []).forEach((e: any) => { const k = (e.muscle_group || "").toLowerCase(); (byMuscle[k] ||= []).push(e); });
      const pickCursor: Record<string, number> = {};
      const pick = (muscle: string) => {
        const pool = byMuscle[muscle] || [];
        if (!pool.length) return null;
        const i = (pickCursor[muscle] = (pickCursor[muscle] ?? -1) + 1) % pool.length;
        return pool[i];
      };
      const split = SPLITS[gen.split] || SPLITS.full_body;
      const workouts = Array.from({ length: dias }, (_, d) => {
        const muscles = split.day(d);
        const exercises = muscles.map((m) => {
          const ex = pick(m);
          return ex ? {
            exercise_id: ex.id, exercise_name: ex.name, muscle_group: ex.muscle_group || m,
            video_url: ex.video_url || null, video_path: ex.video_path || null, youtube_video_id: ex.youtube_video_id || null,
            sets: preset.sets, reps: preset.reps, rest: preset.rest, notes: "",
          } : null;
        }).filter(Boolean);
        return { title: `Treino ${LETTERS[d]}`, description: "", exercises };
      });
      // Periodização (metodologia SETT/BN): resumo das fases p/ o objetivo (6 semanas de referência).
      const plan = buildPeriodizationPlan(gen.objetivo, 6);
      const fases = [...new Set(plan.weeks.map((w) => MESOCYCLES[w.mesocycle].label))].join(" → ");
      const periodNote = `Periodizado (metodologia SETT/BN) · Objetivo: ${gen.objetivo} · Fases: ${fases}. As semanas (microciclos ordinário/choque/regenerativo) aparecem para o aluno conforme as datas do ciclo.`;
      const { data, error } = await (supabase as any).from("workout_templates")
        .insert({ company_id: effectiveCompanyId, name: gen.name.trim(), level: gen.nivel, focus: split.label, description: periodNote, workouts, created_by: user?.id || null })
        .select("id").single();
      if (error) throw error;
      toast({ title: "Treino gerado!", description: "Abrindo para você ajustar." });
      navigate(`/${prefix}/workout/template?tpl=${data.id}`);
    } catch (e: any) {
      toast({ title: "Erro ao gerar", description: e?.message || "Erro", variant: "destructive" });
    } finally { setGenerating(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl text-primary"><Library className="h-7 w-7" /> BIBLIOTECA DE TREINOS</h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground">Treinos prontos para reutilizar e enviar a qualquer aluno.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGenOpen(true)}><Sparkles className="mr-2 h-4 w-4" />Gerar treino</Button>
          <Button onClick={novoManual}><Plus className="mr-2 h-4 w-4" />Novo treino</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-16 text-center font-sans text-muted-foreground">
          Nenhum treino salvo ainda. Clique em <strong>Novo treino</strong> ou <strong>Gerar treino</strong>.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="group bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="truncate">{t.name}</span>
                </CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{(t.workouts || []).length} treino(s)</Badge>
                  <Badge variant="outline" className="text-[10px]">{exCount(t)} exercícios</Badge>
                  {t.focus && <Badge variant="outline" className="text-[10px]">{t.focus}</Badge>}
                  {t.level && <Badge variant="outline" className="text-[10px] capitalize">{t.level}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" onClick={() => { setSendFor(t); setSendStudent(""); }}>
                  <Send className="mr-2 h-4 w-4" />Enviar para aluno
                </Button>
                <div className="grid grid-cols-3 gap-1.5">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate(`/${prefix}/workout/template?tpl=${t.id}`)}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => duplicate(t)}><Copy className="mr-1 h-3.5 w-3.5" />Duplicar</Button>
                  <Button variant="outline" size="sm" className="text-xs text-destructive" onClick={() => remove(t)}><Trash2 className="mr-1 h-3.5 w-3.5" />Excluir</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Enviar para aluno */}
      <Dialog open={!!sendFor} onOpenChange={(o) => !o && setSendFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Enviar "{sendFor?.name}" para um aluno</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">O treino entra no ciclo vigente e aparece no app do aluno. Se o ciclo já tiver musculação, o envio será bloqueado para proteger o histórico.</p>
            <div className="space-y-1.5">
              <Label>Aluno</Label>
              <Select value={sendStudent} onValueChange={setSendStudent}>
                <SelectTrigger><SelectValue placeholder="Selecione o aluno…" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={doSend} disabled={!sendStudent || sending}>
              {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : <><Send className="mr-2 h-4 w-4" />Enviar treino</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gerar treino */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Gerar treino</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome</Label>
              <Input value={gen.name} onChange={(e) => setGen({ ...gen, name: e.target.value })} placeholder="Ex.: Hipertrofia Full Body 3x" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Objetivo</Label>
                <Select value={gen.objetivo} onValueChange={(v) => setGen({ ...gen, objetivo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hipertrofia">Hipertrofia</SelectItem>
                    <SelectItem value="forca">Força</SelectItem>
                    <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                    <SelectItem value="condicionamento">Condicionamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Dias/semana</Label>
                <Select value={gen.dias} onValueChange={(v) => setGen({ ...gen, dias: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["1","2","3","4","5","6"].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Divisão</Label>
              <Select value={gen.split} onValueChange={(v) => setGen({ ...gen, split: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_body">Full Body</SelectItem>
                  <SelectItem value="upper_lower">Upper / Lower</SelectItem>
                  <SelectItem value="ppl">Push / Pull / Legs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Monta um esqueleto com exercícios da sua biblioteca; você ajusta tudo depois no editor.</p>
            <Button className="w-full" onClick={generate} disabled={generating}>
              {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando…</> : <><Sparkles className="mr-2 h-4 w-4" />Gerar e abrir</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
