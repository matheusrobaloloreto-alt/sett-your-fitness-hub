import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Apple, Utensils, Droplets, Flame, Beef, Wheat, Leaf, Loader2, Coffee, Dumbbell, Moon, Check, ClipboardList, Save, FileText, FileUp, Info, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { businessDateYmd } from "@/lib/businessDate";
import { extractDietPdfText } from "@/lib/dietPdf";
import { prepareImportedNutritionPlan, type ImportedNutritionItem } from "@/lib/nutritionPlanDisplay";

// Espelha o schema VIVO de nutrition_plans (Supabase zshrcgbyhzxpnlccssyz): macros em target_*,
// objetivo em goal, restrições em context_dietary_restrictions, e o PLANO DE REFEIÇÕES prático em
// `meals` (jsonb, preenchido pela edge ai-nutrition-plan). O ai_rationale é técnico → NÃO é exibido ao aluno.
interface MealItem {
  meal?: string | null;
  time?: string | null;
  focus?: string | null;
  eat?: string[] | null;
  go_easy?: string[] | null;
  note?: string | null;
}
interface NutritionRow {
  name?: string | null;
  plan_name?: string | null;
  goal?: string | null;
  status?: string | null;
  target_calories?: number | null;
  target_protein_g?: number | null;
  target_carbs_g?: number | null;
  target_fat_g?: number | null;
  target_fiber_g?: number | null;
  target_water_ml?: number | null;
  total_calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  context_dietary_restrictions?: string | null;
  meals?: MealItem[] | null;
  start_date?: string | null;
  end_date?: string | null;
}
interface StudentNutritionContext {
  wants_nutrition?: boolean | null;
  has_nutritionist?: boolean | null;
  nutrition_context?: string | null;
  meals_per_day?: number | null;
}

const GOAL_LABEL: Record<string, string> = {
  manutencao: "Manutenção",
  emagrecimento: "Emagrecimento",
  hipertrofia: "Hipertrofia",
  perda_gordura: "Perda de gordura",
  performance: "Performance",
  ganho_massa: "Ganho de massa",
};

const GLASS_ML = 250;
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// Ícone por tipo de refeição (heurística simples pelo nome).
function mealIcon(name?: string | null) {
  const n = (name || "").toLowerCase();
  if (/(café|manh|desjejum)/.test(n)) return Coffee;
  if (/(pré|pre)[\s-]?treino/.test(n)) return Dumbbell;
  if (/(pós|pos)[\s-]?treino/.test(n)) return Dumbbell;
  if (/(ceia|noite|dormir)/.test(n)) return Moon;
  if (/(lanche|fruta)/.test(n)) return Apple;
  return Utensils;
}

function MacroCard({ icon: Icon, value, label, tint }: { icon: typeof Flame; value: string; label: string; tint?: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3 flex flex-col items-center text-center gap-1">
        <Icon className={cn("h-4 w-4", tint || "text-primary")} />
        <span className="font-mono-data text-lg leading-none text-primary">{value}</span>
        <span className="text-eyebrow text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}

function Chip({ children, variant }: { children: React.ReactNode; variant: "eat" | "easy" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-sans",
        variant === "eat" ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-800" : "border-amber-600/30 bg-amber-600/10 text-amber-800",
      )}
    >
      {variant === "eat" && <Check className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  );
}

function ImportedPlanItem({ item }: { item: ImportedNutritionItem }) {
  if (item.kind === "separator") {
    return (
      <div className="flex basis-full items-center gap-3 py-0.5" aria-label="ou">
        <span className="h-px flex-1 bg-border" />
        <span className="text-eyebrow text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  if (item.kind === "heading") {
    return <p className="basis-full pt-1 text-xs font-semibold text-primary">{item.text}</p>;
  }

  if (item.kind === "detail") {
    const [lead, ...rest] = item.text.split(":");
    return (
      <div className="flex basis-full gap-2.5 rounded-md border border-border/80 bg-background/65 px-3 py-2.5 text-sm leading-relaxed text-foreground">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p>
          {rest.length > 0 ? <><span className="font-medium">{lead}:</span> {rest.join(":")}</> : item.text}
        </p>
      </div>
    );
  }

  return <Chip variant="eat">{item.text}</Chip>;
}

export function NutritionPlanView({ studentId }: { studentId: string }) {
  const [row, setRow] = useState<NutritionRow | null>(null);
  const [anamnese, setAnamnese] = useState<StudentNutritionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingMeals, setGeneratingMeals] = useState(false);
  const [savingExternalPlan, setSavingExternalPlan] = useState(false);
  const [readingExternalPdf, setReadingExternalPdf] = useState(false);
  const [externalPlanText, setExternalPlanText] = useState("");
  const [externalPlanError, setExternalPlanError] = useState("");
  const [externalPlanFileName, setExternalPlanFileName] = useState("");
  const externalPdfInputRef = useRef<HTMLInputElement>(null);

  // Rastreador de hidratação (interativo) — persiste por aluno + dia no localStorage.
  const dayKey = useMemo(() => businessDateYmd(), []);
  const waterStoreKey = `nutri-water:${studentId}:${dayKey}`;
  const [glasses, setGlasses] = useState(0);
  useEffect(() => {
    try { setGlasses(Number(localStorage.getItem(waterStoreKey)) || 0); } catch { setGlasses(0); }
  }, [waterStoreKey]);
  const setGlassesPersist = (n: number) => {
    const v = Math.max(0, n);
    setGlasses(v);
    try { localStorage.setItem(waterStoreKey, String(v)); } catch { /* ignore */ }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const today = businessDateYmd();
        const [{ data }, { data: anamneseRow }] = await Promise.all([
          (supabase as any)
          .from("nutrition_plans")
          .select("*")
          .eq("student_id", studentId)
          .lte("start_date", today)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
          (supabase as any)
            .from("student_anamneses")
            .select("wants_nutrition, has_nutritionist, nutrition_context, meals_per_day")
            .eq("student_id", studentId)
            .maybeSingle(),
        ]);
        let visible = data;
        if (!visible) {
          const { data: legacy } = await (supabase as any).from("nutrition_plans").select("*")
            .eq("student_id", studentId).is("start_date", null)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          visible = legacy;
        }
        if (!active) return;
        setAnamnese((anamneseRow as StudentNutritionContext) ?? null);
        setRow((visible as NutritionRow) ?? null);
        setLoading(false);
        // Gera o plano de refeições sob demanda se ainda não existe (preenche nutrition_plans.meals).
        const existing = Array.isArray((visible as any)?.meals) ? (visible as any).meals : [];
        if (visible && existing.length === 0 && !(anamneseRow as any)?.has_nutritionist) {
          setGeneratingMeals(true);
          try {
            const { data: gen } = await supabase.functions.invoke("ai-nutrition-meals", { body: { student_id: studentId } });
            if (active && Array.isArray((gen as any)?.meals)) {
              setRow((prev) => (prev ? { ...prev, meals: (gen as any).meals } : prev));
            }
          } catch { /* mantém empty-state */ }
          finally { if (active) setGeneratingMeals(false); }
        }
      } catch {
        if (active) setRow(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [studentId]);

  const saveExternalPlan = async (rawTextOverride?: string) => {
    const rawText = (rawTextOverride ?? externalPlanText).trim();
    if (rawText.length < 10) {
      setExternalPlanError("Cole o cardápio do seu nutricionista antes de salvar.");
      return false;
    }
    setSavingExternalPlan(true);
    setExternalPlanError("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-nutrition-meals", {
        body: { action: "save_external_plan", student_id: studentId, raw_text: rawText },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error || "Não foi possível salvar o cardápio.");
      const meals = Array.isArray((data as any)?.meals) ? (data as any).meals : [];
      const savedPlan = (data as any)?.plan as NutritionRow | undefined;
      setRow(savedPlan ?? {
        name: "Cardápio do nutricionista",
        plan_name: "Cardápio do nutricionista",
        goal: "acompanhamento_nutricionista",
        meals,
      });
      setExternalPlanText("");
      return true;
    } catch (error) {
      setExternalPlanError(error instanceof Error ? error.message : "Não foi possível salvar o cardápio.");
      return false;
    } finally {
      setSavingExternalPlan(false);
    }
  };

  const handleExternalPdf = async (file: File | null) => {
    if (!file) return;
    setReadingExternalPdf(true);
    setExternalPlanError("");
    setExternalPlanFileName(file.name);
    try {
      const text = await extractDietPdfText(file);
      setExternalPlanText(text);
      await saveExternalPlan(text);
    } catch (error) {
      setExternalPlanError(error instanceof Error ? error.message : "Não foi possível ler o PDF.");
    } finally {
      setReadingExternalPdf(false);
      if (externalPdfInputRef.current) externalPdfInputRef.current.value = "";
    }
  };

  const externalPlanCard = (
    <Card className="bg-card border-border border-dashed">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <ClipboardList className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h3 className="font-display text-xl text-foreground leading-tight">Cardápio do seu nutricionista</h3>
            <p className="text-sm text-muted-foreground font-sans">
              Envie o PDF que você já recebeu. O app lê e organiza as refeições no mesmo formato das dicas nutricionais, sem alterar a conduta do profissional.
            </p>
          </div>
        </div>
        <input
          ref={externalPdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => void handleExternalPdf(event.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => externalPdfInputRef.current?.click()}
          disabled={readingExternalPdf || savingExternalPlan}
          className="w-full min-h-12 border-primary/25"
        >
          {readingExternalPdf || savingExternalPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
          {readingExternalPdf ? "Lendo PDF..." : savingExternalPlan ? "Organizando refeições..." : "Enviar PDF do cardápio"}
        </Button>
        {externalPlanFileName && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{externalPlanFileName}</span>
          </p>
        )}
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-eyebrow text-muted-foreground">ou cole o conteúdo</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Textarea
          value={externalPlanText}
          onChange={(event) => setExternalPlanText(event.target.value)}
          placeholder="Ex: Café da manhã 07:00 - ovos, pão e fruta&#10;Almoço 12:30 - arroz, feijão, frango e salada&#10;Jantar 20:30 - peixe, legumes e batata"
          className="min-h-[180px]"
        />
        {externalPlanError && <p className="text-xs text-destructive">{externalPlanError}</p>}
        <Button type="button" onClick={() => void saveExternalPlan()} disabled={savingExternalPlan || readingExternalPdf} className="w-full">
          {savingExternalPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Organizar texto colado
        </Button>
        <p className="text-[11px] text-muted-foreground">
          O app não altera a conduta do seu nutricionista; apenas transforma o material em uma visualização mais fácil de acompanhar.
        </p>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!row) {
    if (anamnese?.has_nutritionist) return externalPlanCard;
    return (
      <Card className="bg-card border-border border-dashed">
        <CardContent className="p-6 text-center">
          <Apple className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground font-sans">Nenhuma dica nutricional ainda.</p>
        </CardContent>
      </Card>
    );
  }

  const kcal = row.target_calories ?? row.total_calories;
  const protein = row.target_protein_g ?? row.protein_g ?? 0;
  const carbs = row.target_carbs_g ?? row.carbs_g ?? 0;
  const fat = row.target_fat_g ?? row.fat_g ?? 0;
  // Título limpo: remove o sufixo técnico "— objetivo | nome" que vem da geração automática.
  const rawTitle = row.plan_name || row.name || "";
  const title = rawTitle.split(/\s*[—|]\s*/)[0].trim() || "Plano nutricional";
  const goal = row.goal ? GOAL_LABEL[row.goal] || row.goal : null;
  const meals = asArray<MealItem>(row.meals).filter((m) => m && (m.meal || (m.eat && m.eat.length)));
  const isExternalPlan = row.goal === "acompanhamento_nutricionista";
  const importedDisplay = isExternalPlan ? prepareImportedNutritionPlan(meals) : null;

  // Divisão dos macros por contribuição calórica (P/C = 4 kcal/g, G = 9 kcal/g).
  const pK = protein * 4, cK = carbs * 4, fK = fat * 9;
  const totK = pK + cK + fK;
  const pct = (x: number) => (totK > 0 ? Math.round((x / totK) * 100) : 0);
  const macroSplit = [
    { label: "Proteína", pct: pct(pK), cls: "bg-rose-500" },
    { label: "Carbo", pct: pct(cK), cls: "bg-amber-500" },
    { label: "Gordura", pct: pct(fK), cls: "bg-yellow-600" },
  ];

  const waterMl = row.target_water_ml ?? 0;
  const totalGlasses = waterMl > 0 ? Math.max(1, Math.round(waterMl / GLASS_ML)) : 0;
  const waterPctDone = totalGlasses > 0 ? Math.round((Math.min(glasses, totalGlasses) / totalGlasses) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-2">
        <Utensils className="h-5 w-5 text-primary shrink-0 mt-1" />
        <div>
          <h2 className="font-display text-2xl text-foreground leading-tight">{title}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {goal && <Badge variant="outline" className="text-primary border-primary/30">{goal}</Badge>}
            {row.context_dietary_restrictions && (
              <Badge variant="outline" className="border-emerald-600/30 bg-emerald-600/10 text-emerald-800 capitalize">
                {row.context_dietary_restrictions}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {isExternalPlan && (
        <Card className="bg-primary/[0.035] border-primary/15">
          <CardContent className="p-4 flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Prescrição do seu nutricionista</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                O app organizou o material enviado para facilitar sua consulta. Alimentos, quantidades e substituições permanecem exatamente como foram prescritos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isExternalPlan && importedDisplay && importedDisplay.overview.length > 0 && (
        <Card className="bg-card border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2.5">
              <ListChecks className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">Orientações gerais</span>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {importedDisplay.overview.map((item) => (
                <div key={item} className="flex items-start gap-2.5 rounded-md border border-border/80 bg-background/65 px-3 py-2.5 text-sm leading-relaxed">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidratação (interativo) — no topo */}
      {totalGlasses > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-eyebrow text-muted-foreground">Hidratação de hoje</p>
              <span className="font-mono-data text-xs text-sky-600">
                {Math.min(glasses, totalGlasses)}/{totalGlasses} copos · {((Math.min(glasses, totalGlasses) * GLASS_ML) / 1000).toFixed(1)} L de {(waterMl / 1000).toFixed(1)} L
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: totalGlasses }).map((_, i) => {
                const filled = i < glasses;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Copo ${i + 1}`}
                    onClick={() => setGlassesPersist(glasses === i + 1 ? i : i + 1)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                      filled ? "border-sky-500 bg-sky-500/15 text-sky-600" : "border-border bg-background text-muted-foreground hover:border-sky-400",
                    )}
                  >
                    <Droplets className={cn("h-4 w-4", filled && "fill-sky-500/30")} />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${waterPctDone}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Macros do dia */}
      <div>
        <p className="text-eyebrow text-muted-foreground mb-2">Metas do dia</p>
        <div className="grid grid-cols-3 gap-2">
          {kcal != null && <MacroCard icon={Flame} value={`${kcal}`} label="kcal/dia" tint="text-orange-500" />}
          {protein > 0 && <MacroCard icon={Beef} value={`${protein} g`} label="Proteína" tint="text-rose-500" />}
          {carbs > 0 && <MacroCard icon={Wheat} value={`${carbs} g`} label="Carboidrato" tint="text-amber-500" />}
          {fat > 0 && <MacroCard icon={Apple} value={`${fat} g`} label="Gordura" tint="text-yellow-600" />}
          {row.target_fiber_g != null && <MacroCard icon={Leaf} value={`${row.target_fiber_g} g`} label="Fibra" tint="text-emerald-600" />}
          {waterMl > 0 && <MacroCard icon={Droplets} value={`${(waterMl / 1000).toFixed(1)} L`} label="Água" tint="text-sky-500" />}
        </div>
      </div>

      {/* Divisão de macros (barra visual) */}
      {totK > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-eyebrow text-muted-foreground mb-2">Divisão das calorias</p>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {macroSplit.map((m) => (
                <div key={m.label} className={m.cls} style={{ width: `${m.pct}%` }} title={`${m.label} ${m.pct}%`} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {macroSplit.map((m) => (
                <span key={m.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("h-2.5 w-2.5 rounded-full", m.cls)} /> {m.label}
                  <span className="font-mono-data text-foreground">{m.pct}%</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PLANO DE REFEIÇÕES (prático, individualizado pela anamnese) */}
      <div>
        <p className="text-eyebrow text-muted-foreground mb-2">Plano de refeições</p>
        {(isExternalPlan ? importedDisplay?.meals.length : meals.length) ? (
          <div className="space-y-2.5">
            {isExternalPlan && importedDisplay ? importedDisplay.meals.map((m, i) => {
              const Icon = mealIcon(m.meal);
              return (
                <Card key={`${m.meal}-${i}`} className="bg-card border-border overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between gap-2 bg-primary/5 px-4 py-2.5 border-b border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-foreground truncate">{m.meal}</span>
                      </div>
                      {m.time && <Badge variant="outline" className="font-mono-data text-primary border-primary/30 shrink-0">{m.time}</Badge>}
                    </div>
                    <div className="p-4 space-y-3">
                      {m.focus && <p className="text-sm font-medium text-primary/90">{m.focus}</p>}
                      {m.items.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Conforme o cardápio</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {m.items.map((item, itemIndex) => <ImportedPlanItem key={`${item.kind}-${item.text}-${itemIndex}`} item={item} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            }) : meals.map((m, i) => {
              const Icon = mealIcon(m.meal);
              const eat = asArray<string>(m.eat).filter(Boolean);
              const easy = asArray<string>(m.go_easy).filter(Boolean);
              return (
                <Card key={i} className="bg-card border-border overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between gap-2 bg-primary/5 px-4 py-2.5 border-b border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-foreground truncate">{m.meal || `Refeição ${i + 1}`}</span>
                      </div>
                      {m.time && <Badge variant="outline" className="font-mono-data text-primary border-primary/30 shrink-0">{m.time}</Badge>}
                    </div>
                    <div className="p-4 space-y-2.5">
                      {m.focus && <p className="text-sm font-medium text-primary/90">{m.focus}</p>}
                      {eat.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Comer</p>
                          <div className="flex flex-wrap gap-1.5">{eat.map((f, k) => <Chip key={k} variant="eat">{f}</Chip>)}</div>
                        </div>
                      )}
                      {easy.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Pegar leve</p>
                          <div className="flex flex-wrap gap-1.5">{easy.map((f, k) => <Chip key={k} variant="easy">{f}</Chip>)}</div>
                        </div>
                      )}
                      {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : anamnese?.has_nutritionist ? (
          externalPlanCard
        ) : (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="p-5 text-center">
              {generatingMeals ? (
                <>
                  <Loader2 className="h-5 w-5 text-primary mx-auto mb-2 animate-spin" />
                  <p className="text-sm text-muted-foreground font-sans">Montando seu plano de refeições…</p>
                </>
              ) : (
                <>
                  <Utensils className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-sans">Seu plano de refeições está sendo preparado pelo seu treinador.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center px-4">
        {isExternalPlan
          ? "Visualização organizada do cardápio enviado pelo seu nutricionista. Em caso de dúvida, siga a orientação do profissional responsável."
          : "Sugestões nutricionais educativas do seu treinador — não substituem o acompanhamento de um nutricionista."}
      </p>
    </div>
  );
}
