import { supabase } from "@/integrations/supabase/client";
import { selectCurrentNutritionPlan, type NutritionPlanCandidate } from "@/lib/nutritionPlanDisplay";
import { readPages } from "@/lib/pagedRead";

export async function readStudentNutritionPlan(studentId: string, today: string, details = false) {
  const rows = await readPages<NutritionPlanCandidate>((from, to) => {
    const table = supabase.from("nutrition_plans");
    const query = details ? table.select("*") : table.select("id, status, start_date, end_date, created_at");
    return query.eq("student_id", studentId)
      .or(`start_date.is.null,start_date.lte.${today}`)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("id").range(from, to);
  });
  return selectCurrentNutritionPlan(rows, today);
}

const CARDIO_ALIASES = {
  corrida: ["corrida", "triathlon", "running"],
  natacao: ["natacao", "natação", "swimming"],
  ciclismo: ["ciclismo", "bike", "cycling"],
} as const;
export type StudentCardioSport = keyof typeof CARDIO_ALIASES;

function studentCardioQuery(studentId: string, today: string, columns: "*" | "sport") {
  return supabase.from("running_plans").select(columns).eq("student_id", studentId)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .or("status.is.null,status.in.(active,scheduled)");
}

export async function readStudentCardioSports(studentId: string, today: string) {
  const rows = await readPages((from, to) => studentCardioQuery(studentId, today, "sport")
    .or(`start_date.is.null,start_date.lte.${today}`).order("id").range(from, to));
  const available = new Set(rows.map(row => row.sport?.toLowerCase()));
  const sports = Object.keys(CARDIO_ALIASES) as StudentCardioSport[];
  return new Set(sports.filter(sport => CARDIO_ALIASES[sport].some(alias => available.has(alias))));
}

export async function readStudentCardioPlan(studentId: string, sport: StudentCardioSport, today: string) {
  const readSport = async (aliases: readonly string[]) => {
    const query = () => studentCardioQuery(studentId, today, "*")
      .or(aliases.map(alias => `sport.ilike.${alias}`).join(","))
      .order("created_at", { ascending: false }).order("id").limit(1);
    const current = await query().lte("start_date", today).maybeSingle();
    if (current.error) throw current.error;
    if (current.data) return current.data;
    const legacy = await query().is("start_date", null).maybeSingle();
    if (legacy.error) throw legacy.error;
    return legacy.data;
  };
  // Keep a dedicated plan ahead of an alias such as a combined triathlon plan.
  return await readSport([sport]) ?? await readSport(CARDIO_ALIASES[sport].slice(1));
}
