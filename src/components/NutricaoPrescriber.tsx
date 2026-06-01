// ============================================================================
// NutricaoPrescriber.tsx — BN Performance Training
// Cole em: src/components/NutricaoPrescriber.tsx
// Chama a edge function: ai-nutrition-plan
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
import { Loader2, Apple } from "lucide-react";

interface Student { id: string; name: string; }

export default function NutricaoPrescriber() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    student_id: "",
    age: "",
    gender: "M",
    weight_kg: "",
    height_cm: "",
    body_fat_percent: "",
    objective: "performance",
    activity_level: "moderado",
    is_endurance_athlete: "false",
    training_hours_per_day: "1",
    training_modality: "",
    meals_per_day: "5",
    food_restrictions: "",
    stress_score: "",
    sleep_quality: "",
    budget: "moderado",
    has_microwave: "true",
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
    if (!form.weight_kg || !form.height_cm || !form.age) {
      setError("Preencha idade, peso e altura."); return;
    }
    setLoading(true); setError(null); setPlan(null);

    const student = students.find((s) => s.id === form.student_id);

    // Puxa o plano de corrida ativo para sincronizar o gasto energético
    let running_plan_context = null;
    const { data: rp } = await supabase
      .from("running_plans")
      .select("sport, model, duration_weeks, weeks")
      .eq("student_id", form.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rp) running_plan_context = rp;

    const { data, error: fnError } = await supabase.functions.invoke(
      "ai-nutrition-plan",
      {
        body: {
          student_id: form.student_id,
          student_name: student?.name,
          company_id: companyId,
          age: Number(form.age),
          gender: form.gender,
          weight_kg: Number(form.weight_kg),
          height_cm: Number(form.height_cm),
          body_fat_percent: form.body_fat_percent ? Number(form.body_fat_percent) : null,
          objective: form.objective,
          activity_level: form.activity_level,
          is_endurance_athlete: form.is_endurance_athlete === "true",
          training_hours_per_day: Number(form.training_hours_per_day),
          training_modality: form.training_modality,
          meals_per_day: Number(form.meals_per_day),
          food_restrictions: form.food_restrictions,
          stress_score: form.stress_score ? Number(form.stress_score) : null,
          sleep_quality: form.sleep_quality ? Number(form.sleep_quality) : null,
          budget: form.budget,
          has_microwave: form.has_microwave === "true",
          running_plan_context,
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
            <Apple className="h-5 w-5" /> Prescrição Nutricional — Metodologia BN Nutri
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
            <Label>Idade</Label>
            <Input type="number" value={form.age} onChange={(e) => set("age", e.target.value)} />
          </div>
          <div>
            <Label>Sexo</Label>
            <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Feminino</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Peso (kg)</Label>
            <Input type="number" step="0.1" value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} />
          </div>
          <div>
            <Label>Altura (cm)</Label>
            <Input type="number" value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
          </div>
          <div>
            <Label>% Gordura <span className="text-xs text-muted-foreground">opcional (usa Katch-McArdle)</span></Label>
            <Input type="number" step="0.1" value={form.body_fat_percent}
              onChange={(e) => set("body_fat_percent", e.target.value)} />
          </div>

          <div>
            <Label>Objetivo</Label>
            <Select value={form.objective} onValueChange={(v) => set("objective", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                <SelectItem value="hipertrofia">Hipertrofia</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Nível de atividade</Label>
            <Select value={form.activity_level} onValueChange={(v) => set("activity_level", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentario">Sedentário</SelectItem>
                <SelectItem value="leve">Levemente ativo</SelectItem>
                <SelectItem value="moderado">Moderadamente ativo</SelectItem>
                <SelectItem value="muito_ativo">Muito ativo</SelectItem>
                <SelectItem value="extremo">Extremamente ativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Atleta de endurance?</Label>
            <Select value={form.is_endurance_athlete} onValueChange={(v) => set("is_endurance_athlete", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Não</SelectItem>
                <SelectItem value="true">Sim</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Horas de treino/dia</Label>
            <Input type="number" step="0.5" value={form.training_hours_per_day}
              onChange={(e) => set("training_hours_per_day", e.target.value)} />
          </div>

          <div>
            <Label>Modalidade principal</Label>
            <Input value={form.training_modality} placeholder="Ex: corrida + musculação"
              onChange={(e) => set("training_modality", e.target.value)} />
          </div>

          <div>
            <Label>Refeições por dia</Label>
            <Select value={form.meals_per_day} onValueChange={(v) => set("meals_per_day", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="6">6</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Estresse (0-10) <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" min="0" max="10" value={form.stress_score}
              onChange={(e) => set("stress_score", e.target.value)} />
          </div>
          <div>
            <Label>Sono (0-10) <span className="text-xs text-muted-foreground">opcional</span></Label>
            <Input type="number" min="0" max="10" value={form.sleep_quality}
              onChange={(e) => set("sleep_quality", e.target.value)} />
          </div>

          <div>
            <Label>Orçamento</Label>
            <Select value={form.budget} onValueChange={(v) => set("budget", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="economico">Econômico</SelectItem>
                <SelectItem value="moderado">Moderado</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tem cozinha/micro-ondas?</Label>
            <Select value={form.has_microwave} onValueChange={(v) => set("has_microwave", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>Restrições alimentares</Label>
            <Textarea value={form.food_restrictions} placeholder="Ex: intolerância à lactose, vegetariano"
              onChange={(e) => set("food_restrictions", e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando plano…</> : "Gerar Plano Nutricional"}
            </Button>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
        </CardContent>
      </Card>

      {plan && <NutritionView plan={plan} />}
    </div>
  );
}

function NutritionView({ plan }: { plan: any }) {
  const e = plan.energy_summary;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.plan_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resumo energético */}
        {e && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Metas energéticas</strong>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              <Metric label="TMB" value={`${e.tmb_kcal} kcal`} />
              <Metric label="GET" value={`${e.get_kcal} kcal`} />
              <Metric label="Meta" value={`${e.target_kcal} kcal`} />
              <Metric label="Água" value={`${e.hydration_ml} ml`} />
              <Metric label="Proteína" value={`${e.protein_total_g}g (${e.protein_g_per_kg}/kg)`} />
              <Metric label="Carbo" value={`${e.carbs_total_g}g (${e.carbs_g_per_kg}/kg)`} />
              <Metric label="Gordura" value={`${e.fat_total_g}g (${e.fat_g_per_kg}/kg)`} />
              <Metric label="Fórmula" value={e.formula_used} />
            </div>
            {e.calculation_notes && (
              <p className="text-xs text-muted-foreground mt-2">{e.calculation_notes}</p>
            )}
          </div>
        )}

        {/* Carb cycling */}
        {plan.carb_cycling && (
          <div className="rounded-lg border p-4 text-sm">
            <strong>Carb cycling</strong>
            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
              <div className="border rounded p-2">
                <div className="font-medium">Dia alto</div>
                <div className="text-xs">{plan.carb_cycling.high_day_carbs_g}g CHO</div>
                <div className="text-xs text-muted-foreground">{plan.carb_cycling.high_day_kcal} kcal</div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium">Dia moderado</div>
                <div className="text-xs">{plan.carb_cycling.moderate_day_carbs_g}g CHO</div>
                <div className="text-xs text-muted-foreground">{plan.carb_cycling.moderate_day_kcal} kcal</div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium">Descanso</div>
                <div className="text-xs">{plan.carb_cycling.rest_day_carbs_g}g CHO</div>
                <div className="text-xs text-muted-foreground">{plan.carb_cycling.rest_day_kcal} kcal</div>
              </div>
            </div>
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

        {/* Refeições */}
        {plan.daily_meals?.map((meal: any, i: number) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <h3 className="font-semibold">{meal.meal_name} <span className="text-sm text-muted-foreground">{meal.time}</span></h3>
              <span className="text-xs text-muted-foreground">
                {meal.calories} kcal • P{meal.protein_g} C{meal.carbs_g} G{meal.fat_g}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {meal.foods?.map((food: any, j: number) => (
                <div key={j} className="text-sm flex justify-between border-l-2 border-primary/40 pl-3 py-0.5">
                  <span>{food.name} <span className="text-muted-foreground">— {food.quantity}</span></span>
                  <span className="text-xs text-muted-foreground">P{food.protein_g} C{food.carbs_g} G{food.fat_g}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Suplementação */}
        {plan.supplementation?.length > 0 && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Suplementação</strong>
            <div className="mt-2 space-y-1">
              {plan.supplementation.map((s: any, i: number) => (
                <div key={i} className="border-l-2 border-primary/40 pl-3 py-0.5">
                  <span className="font-medium">{s.supplement}</span> — {s.dose} • {s.timing}
                  <div className="text-xs text-muted-foreground">{s.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Substituições */}
        {plan.substitutions?.length > 0 && (
          <div className="rounded-lg border p-4 text-sm">
            <strong>Substituições</strong>
            <div className="mt-2 space-y-1">
              {plan.substitutions.map((s: any, i: number) => (
                <div key={i}><span className="font-medium">{s.original}:</span> {s.alternatives?.join(", ")}</div>
              ))}
            </div>
          </div>
        )}

        {plan.pre_race_gi_protocol && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Protocolo GI pré-prova:</strong> {plan.pre_race_gi_protocol}
          </div>
        )}
        {plan.intra_workout_protocol && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Intra-treino:</strong> {plan.intra_workout_protocol}
          </div>
        )}
        {plan.rest_day_adjustments && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <strong>Dias de descanso:</strong> {plan.rest_day_adjustments}
          </div>
        )}
        {plan.general_notes && (
          <div className="text-sm text-muted-foreground whitespace-pre-line">{plan.general_notes}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

