// ============================================================================
// MusculacaoPrescriber.tsx — BN Performance Training
// Cole em: src/components/MusculacaoPrescriber.tsx
// Chama a edge function: ai-prescribe-workout
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
import { Loader2, Dumbbell } from "lucide-react";

interface Student {
  id: string;
  name: string;
}

const PHASE_LABELS: Record<string, string> = {
  mobilidade: "1. Mobilidade",
  ativacao_core: "2. Ativação Core",
  ativacao_especifica: "3. Ativação Específica",
  controle_motor: "4. Controle Motor",
  pliometria: "5. Pliometria",
  forca_global: "6. Força Global",
  forca_especifica: "7. Força Específica",
};

export default function MusculacaoPrescriber() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    student_id: "",
    objective: "hipertrofia",
    fitness_level: "intermediario",
    days_per_week: "3",
    duration_weeks: "6",
    equipment: "academia_completa",
    block_number: "1",
    is_endurance_athlete: "false",
    restrictions: "",
    notes: "",
  });

  // Busca company_id e alunos
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
      const { data: studentList } = await supabase
        .from("students")
        .select("id, name")
        .eq("company_id", member.company_id)
        .order("name");
      setStudents(studentList || []);
    })();
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.student_id) { setError("Selecione um aluno."); return; }
    setLoading(true); setError(null); setPlan(null);

    const student = students.find((s) => s.id === form.student_id);

    // Busca avaliação funcional mais recente (alimenta a biomecânica)
    let assessment_context = null;
    const { data: assessment } = await supabase
      .from("functional_assessments")
      .select("assessment_json")
      .eq("student_id", form.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assessment?.assessment_json) assessment_context = assessment.assessment_json;

    const { data, error: fnError } = await supabase.functions.invoke(
      "ai-prescribe-workout",
      {
        body: {
          student_id: form.student_id,
          student_name: student?.name,
          company_id: companyId,
          objective: form.objective,
          fitness_level: form.fitness_level,
          days_per_week: Number(form.days_per_week),
          duration_weeks: Number(form.duration_weeks),
          equipment: form.equipment,
          block_number: Number(form.block_number),
          is_endurance_athlete: form.is_endurance_athlete === "true",
          restrictions: form.restrictions,
          notes: form.notes,
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
            <Dumbbell className="h-5 w-5" /> Prescrição de Musculação — Metodologia BN
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Aluno</Label>
            <Select value={form.student_id} onValueChange={(v) => set("student_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Objetivo</Label>
            <Select value={form.objective} onValueChange={(v) => set("objective", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hipertrofia">Hipertrofia</SelectItem>
                <SelectItem value="forca">Força máxima</SelectItem>
                <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Nível</Label>
            <Select value={form.fitness_level} onValueChange={(v) => set("fitness_level", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="iniciante">Iniciante</SelectItem>
                <SelectItem value="intermediario">Intermediário</SelectItem>
                <SelectItem value="avancado">Avançado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Dias por semana</Label>
            <Input type="number" min="1" max="6" value={form.days_per_week}
              onChange={(e) => set("days_per_week", e.target.value)} />
          </div>

          <div>
            <Label>Duração (semanas)</Label>
            <Input type="number" min="1" max="16" value={form.duration_weeks}
              onChange={(e) => set("duration_weeks", e.target.value)} />
          </div>

          <div>
            <Label>Bloco</Label>
            <Select value={form.block_number} onValueChange={(v) => set("block_number", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Bloco 1 (sem pliometria)</SelectItem>
                <SelectItem value="2">Bloco 2 (pliometria liberada)</SelectItem>
                <SelectItem value="3">Bloco 3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Equipamento</Label>
            <Select value={form.equipment} onValueChange={(v) => set("equipment", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="academia_completa">Academia completa</SelectItem>
                <SelectItem value="casa_halteres">Casa (halteres)</SelectItem>
                <SelectItem value="funcional">Funcional / peso corporal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>Atleta de endurance? (corrida/triathlon)</Label>
            <Select value={form.is_endurance_athlete} onValueChange={(v) => set("is_endurance_athlete", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Não</SelectItem>
                <SelectItem value="true">Sim (aplicar anti-interferência)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>Restrições / Lesões</Label>
            <Textarea value={form.restrictions} placeholder="Ex: dor lombar EVA 2, ombro direito sensível"
              onChange={(e) => set("restrictions", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>Observações adicionais</Label>
            <Textarea value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando plano…</> : "Gerar Plano de Treino"}
            </Button>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
        </CardContent>
      </Card>

      {plan && <PlanView plan={plan} />}
    </div>
  );
}

function PlanView({ plan }: { plan: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.cycle_name}</CardTitle>
        <p className="text-sm text-muted-foreground">{plan.objective} • {plan.duration_weeks} semanas • Bloco {plan.block}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {plan.biomechanical_notes && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Adaptações biomecânicas:</strong> {plan.biomechanical_notes}
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

        {plan.workouts?.map((w: any, i: number) => (
          <div key={i} className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg">{w.name}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {w.split_focus} • {w.duration_min} min
            </p>
            <div className="space-y-2">
              {w.exercises?.map((ex: any, j: number) => (
                <div key={j} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-medium">{ex.exercise_name}</span>
                    <span className="text-xs text-muted-foreground">{PHASE_LABELS[ex.phase] || ex.phase}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {ex.sets}x{ex.reps}
                    {ex.load_percent_1rm && ex.load_percent_1rm !== "null" ? ` • ${ex.load_percent_1rm}` : ""}
                    {ex.rir ? ` • RIR ${ex.rir}` : ""}
                    {ex.tempo ? ` • Tempo ${ex.tempo}` : ""}
                    {ex.rest_seconds ? ` • ${ex.rest_seconds}s descanso` : ""}
                  </div>
                  {ex.cues && <div className="text-xs italic mt-0.5">💡 {ex.cues}</div>}
                  {ex.biomechanical_note && <div className="text-xs text-blue-600 mt-0.5">🔧 {ex.biomechanical_note}</div>}
                </div>
              ))}
            </div>
            {w.notes && <p className="text-xs text-muted-foreground mt-3">{w.notes}</p>}
          </div>
        ))}

        {plan.progression_protocol && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Progressão:</strong> {plan.progression_protocol}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

