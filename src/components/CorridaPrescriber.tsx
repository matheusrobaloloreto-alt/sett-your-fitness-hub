// ============================================================================
// CorridaPrescriber.tsx — BN Performance Training
// Cole em: src/components/CorridaPrescriber.tsx
// Chama a edge function: ai-running-plan
// Cobre: corrida, ciclismo, natação, triathlon
// ============================================================================
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Activity } from "lucide-react";

interface Student { id: string; name: string; }

export default function CorridaPrescriber() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    student_id: "",
    sport: "corrida",
    goal: "",
    duration_weeks: "8",
    days_per_week: "4",
    session_duration: "60",
    current_volume: "",
    fcmax: "",
    fcrep: "",
    experience_months: "",
    tsb: "",
    eva_joelho: "0",
    eva_tornozelo: "0",
    eva_quadril: "0",
    eva_lombar: "0",
    injuries: "",
    equipment: "",
    diet_type: "performance",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!member) return;
      setCompanyId(member.company_id);
      const { data: list } = await supabase
        .from("students")
        .select("id, name")
        .eq("company_id", member.company_id)
        .order("name");
      setStudents(list || []);
    })();
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.student_id) { setError("Selecione um aluno."); return; }
    if (!form.goal) { setError("Informe o objetivo/prova."); return; }
    setLoading(true); setError(null); setPlan(null);

    const student = students.find((s) => s.id === form.student_id);

    // Avaliação funcional (opcional) para ajustar exercícios complementares
    let assessment_context = null;
    const { data: assessment } = await supabase
      .from("functional_assessments")
      .select("assessment_json")
      .eq("student_id", form.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assessment?.assessment_json) assessment_context = assessment.assessment_json;

    const eva = {
      joelho: Number(form.eva_joelho),
      tornozelo: Number(form.eva_tornozelo),
      quadril: Number(form.eva_quadril),
      lombar: Number(form.eva_lombar),
    };

    const { data, error: fnError } = await supabase.functions.invoke(
      "ai-running-plan",
      {
        body: {
          student_id: form.student_id,
          student_name: student?.name,
          company_id: companyId,
          sport: form.sport,
          goal: form.goal,
          duration_weeks: Number(form.duration_weeks),
          days_per_week: Number(form.days_per_week),
          session_duration: Number(form.session_duration),
          current_volume: form.current_volume ? Number(form.current_volume) : null,
          fcmax: form.fcmax ? Number(form.fcmax) : null,
          fcrep: form.fcrep ? Number(form.fcrep) : null,
          experience_months: form.experience_months ? Number(form.experience_months) : null,
          tsb: form.tsb ? Number(form.tsb) : null,
          eva,
          injuries: form.injuries,
          equipment: form.equipment,
          diet_type: form.diet_type,
          assessment_context,
        },
      }
    );

    setLoading(false);
    if (fnError) { setError(fnError.message); return; }
    if (data?.error) { setError(data.error); return; }
    setPlan(data?.plan);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Prescrição de Performance Cíclica — Metodologia BN
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Aluno</Label>
            <Select value={form.student_id} onValueChange={(v) => set("student_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Modalidade</Label>
            <Select value={form.sport} onValueChange={(v) => set("sport", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrida">Corrida</SelectItem>
                <SelectItem value="ciclismo">Ciclismo</SelectItem>
                <SelectItem value="natacao">Natação</SelectItem>
                <SelectItem value="triathlon">Triathlon</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Objetivo / Prova</Label>
            <Input value={form.goal} placeholder="Ex: Maratona em 12 semanas"
              onChange={(e) => set("goal", e.target.value)} />
          </div>

          <div>
            <Label>Duração do plano (semanas)</Label>
            <Input type="number" min="1" max="24" value={form.duration_weeks}
              onChange={(e) => set("duration_weeks", e.target.value)} />
          </div>

          <div>
            <Label>Dias por semana</Label>
            <Input type="number" min="1" max="7" value={form.days_per_week}
              onChange={(e) => set("days_per_week", e.target.value)} />
          </div>

          <div>
            <Label>Minutos por sessão</Label>
            <Input type="number" min="20" max="240" value={form.session_duration}
              onChange={(e) => set("session_duration", e.target.value)} />
          </div>

          <div>
            <Label>Volume atual (km ou h/semana)</Label>
            <Input type="number" value={form.current_volume} placeholder="Ex: 40"
              onChange={(e) => set("current_volume", e.target.value)} />
          </div>

          <div>
            <Label>FC máxima (bpm) <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" value={form.fcmax} placeholder="Estima 220-idade se vazio"
              onChange={(e) => set("fcmax", e.target.value)} />
          </div>

          <div>
            <Label>FC repouso (bpm) <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" value={form.fcrep} placeholder="Padrão 65 se vazio"
              onChange={(e) => set("fcrep", e.target.value)} />
          </div>

          <div>
            <Label>Experiência (meses)</Label>
            <Input type="number" value={form.experience_months} placeholder="Ex: 18"
              onChange={(e) => set("experience_months", e.target.value)} />
          </div>

          <div>
            <Label>TSB atual <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" value={form.tsb} placeholder="Ex: -12"
              onChange={(e) => set("tsb", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>EVA por articulação (0 = sem dor, 10 = dor máxima)</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {["tornozelo", "joelho", "quadril", "lombar"].map((j) => (
                <div key={j}>
                  <span className="text-xs capitalize">{j}</span>
                  <Input type="number" min="0" max="10"
                    value={(form as any)[`eva_${j}`]}
                    onChange={(e) => set(`eva_${j}`, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Tipo de dieta</Label>
            <Select value={form.diet_type} onValueChange={(v) => set("diet_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                <SelectItem value="hipertrofia">Hipertrofia</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Equipamento</Label>
            <Input value={form.equipment} placeholder="Ex: rua + esteira"
              onChange={(e) => set("equipment", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>Lesões / histórico</Label>
            <Textarea value={form.injuries} placeholder="Ex: tendinopatia de Aquiles D"
              onChange={(e) => set("injuries", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando plano…</> : "Gerar Plano de Treino"}
            </Button>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
        </CardContent>
      </Card>

      {plan && <RunPlanView plan={plan} />}
    </div>
  );
}

function RunPlanView({ plan }: { plan: any }) {
  const z = plan.fc_zones;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.plan_name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {plan.sport} • modelo {plan.model} • {plan.duration_weeks} semanas
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Zonas de FC */}
        {z && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Zonas de FC (Karvonen)</strong>
            {z.estimated && <span className="text-amber-600 text-xs ml-2">⚠️ valores estimados</span>}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
              {["z1", "z2", "z3", "z4", "z5"].map((zk) => (
                z[zk] && (
                  <div key={zk} className="text-center border rounded p-2">
                    <div className="font-medium uppercase">{zk}</div>
                    <div className="text-xs text-muted-foreground">{z[zk].min}–{z[zk].max} bpm</div>
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {/* Safety check */}
        {plan.safety_check && (
          <div className="rounded-lg border p-4 text-sm space-y-1">
            <div>TSB: <Badge status={plan.safety_check.tsb_status} /></div>
            <div>EVA: <Badge status={plan.safety_check.eva_status} /></div>
            {plan.safety_check.restrictions?.length > 0 && (
              <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                {plan.safety_check.restrictions.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        )}

        {plan.warnings?.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <strong className="text-destructive">Alertas:</strong>
            <ul className="list-disc pl-5 mt-1">
              {plan.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Semanas */}
        {plan.weeks?.map((week: any, i: number) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <h3 className="font-semibold">Semana {week.week_number} — {week.type}</h3>
              <span className="text-xs text-muted-foreground">
                {week.volume_km ? `${week.volume_km} km` : ""} • TSS ~{week.tss_total_estimado}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{week.focus}</p>
            <div className="space-y-1">
              {week.sessions?.map((s: any, j: number) => (
                <div key={j} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                  <span className="font-medium">{s.day}: {s.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">{s.zone} • {s.total_min}min</span>
                  {s.fc_target && <div className="text-xs">{s.fc_target}</div>}
                  {s.intervals && s.intervals !== "null" && <div className="text-xs">⏱ {s.intervals}</div>}
                  {s.notes && <div className="text-xs italic text-muted-foreground">{s.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {plan.complementary_strength?.length > 0 && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Força complementar:</strong>
            <ul className="list-disc pl-5 mt-1">
              {plan.complementary_strength.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {plan.nutrition_alert && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Nutrição:</strong> {plan.nutrition_alert}
          </div>
        )}

        {plan.general_tips && (
          <div className="text-sm text-muted-foreground whitespace-pre-line">{plan.general_tips}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    atencao: "bg-amber-100 text-amber-800",
    linha_vermelha: "bg-red-100 text-red-800",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${map[status] || ""}`}>{status}</span>;
}

