import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Timer } from "lucide-react";
import { format, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";

interface PanelData {
  expiringContracts: any[];
  cycleCountdowns: any[];
  trainerMap: Record<string, string>;
}

async function fetchRenewalsAndCycles(effectiveCompanyId: string | null | undefined): Promise<PanelData> {
  await supabase.rpc("advance_training_cycles");
  const thirtyDaysFromNow = format(addDays(new Date(), 30), "yyyy-MM-dd");

  let expiringQuery = supabase
    .from("enrollments")
    .select("*, trainer_id, students(full_name, status), plans(name)")
    .eq("status", "active")
    .lte("end_date", thirtyDaysFromNow)
    .order("end_date", { ascending: true });

  let cycleEnrollQuery = supabase
    .from("enrollments")
    .select("id, student_id, training_start_date, trainer_id, students(full_name, assigned_trainer_id)")
    .in("status", ["active", "awaiting_training"]) as any;

  if (effectiveCompanyId) {
    expiringQuery = expiringQuery.eq("company_id", effectiveCompanyId);
    cycleEnrollQuery = cycleEnrollQuery.eq("company_id", effectiveCompanyId);
  }

  const [expiringRes, activeEnrollsRes] = await Promise.all([expiringQuery, cycleEnrollQuery]);

  const expiringContracts = (expiringRes.data || []).filter((e: any) => {
    const s = e.students?.status;
    return s === "active" || s === "pending";
  });

  const activeEnrolls = (activeEnrollsRes as any)?.data || [];
  const countdowns: any[] = [];
  const enrollsWithDate = activeEnrolls.filter((e: any) => e.training_start_date);
  if (enrollsWithDate.length > 0) {
    const enrollIds = enrollsWithDate.map((e: any) => e.id);
    const enrollInfoMap: Record<string, { name: string; trainer_id: string | null; student_id: string }> = {};
    enrollsWithDate.forEach((e: any) => {
      enrollInfoMap[e.id] = {
        name: e.students?.full_name || "—",
        trainer_id: e.students?.assigned_trainer_id || e.trainer_id,
        student_id: e.student_id,
      };
    });
    const { data: activeCycles } = await supabase
      .from("training_cycles")
      .select("*")
      .in("enrollment_id", enrollIds)
      .eq("status", "active");
    (activeCycles || []).forEach((c: any) => {
      const info = enrollInfoMap[c.enrollment_id];
      const daysLeft = Math.ceil((new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      countdowns.push({
        student_name: info?.name || "—",
        student_id: info?.student_id,
        cycle_number: c.cycle_number,
        end_date: c.end_date,
        days_left: daysLeft,
        trainer_id: info?.trainer_id,
      });
    });
  }
  countdowns.sort((a, b) => a.days_left - b.days_left);

  const allTrainerIds = new Set<string>();
  expiringContracts.forEach((e: any) => { if (e.trainer_id) allTrainerIds.add(e.trainer_id); });
  countdowns.forEach((m: any) => { if (m.trainer_id) allTrainerIds.add(m.trainer_id); });
  const trainerMap: Record<string, string> = {};
  if (allTrainerIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", Array.from(allTrainerIds));
    (profiles || []).forEach((p: any) => { trainerMap[p.user_id] = p.full_name || ""; });
  }

  return { expiringContracts, cycleCountdowns: countdowns, trainerMap };
}

interface Props {
  effectiveCompanyId: string | null | undefined;
  routePrefix: string;
  /** When true, only the RENOVAÇÃO card is rendered (intended to sit beside another card in a 2-col grid). */
  renewalsOnly?: boolean;
  /** When true, only the TROCA DE TREINO card is rendered. */
  cyclesOnly?: boolean;
}

export function RenewalsAndCyclesPanel({ effectiveCompanyId, routePrefix, renewalsOnly, cyclesOnly }: Props) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["renewals-cycles", effectiveCompanyId ?? "all"],
    queryFn: () => fetchRenewalsAndCycles(effectiveCompanyId),
    staleTime: 60_000,
  });

  const expiringContracts = data?.expiringContracts || [];
  const cycleCountdowns = data?.cycleCountdowns || [];
  const trainerMap = data?.trainerMap || {};

  const renewalsCard = (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-primary text-xl flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />RENOVAÇÃO
        </CardTitle>
      </CardHeader>
      <CardContent>
        {expiringContracts.length > 0 ? (
          <div className="space-y-3 max-h-[250px] overflow-auto">
            {expiringContracts.map((contract: any) => {
              const daysLeft = Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <div key={contract.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border cursor-pointer hover:brightness-110 transition-all" onClick={() => navigate(`/${routePrefix}/students/${contract.student_id}`)}>
                  <div>
                    <p className="text-foreground font-sans font-medium text-sm">{contract.students?.full_name}</p>
                    <p className="text-muted-foreground text-xs font-sans">{contract.plans?.name}</p>
                    {contract.trainer_id && trainerMap[contract.trainer_id] && (
                      <p className="text-muted-foreground/70 text-[11px] font-sans">Treinador: {trainerMap[contract.trainer_id]}</p>
                    )}
                  </div>
                  <span className={`text-xs font-sans font-medium px-2 py-1 rounded ${
                    daysLeft <= 7 ? "bg-destructive/20 text-destructive" :
                    daysLeft <= 15 ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"
                  }`}>
                    {daysLeft}d restantes
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground font-sans text-center py-8">Nenhuma renovação pendente</p>
        )}
      </CardContent>
    </Card>
  );

  const cyclesCard = (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-primary text-xl flex items-center gap-2">
          <Timer className="h-5 w-5" />TROCA DE TREINO
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cycleCountdowns.length > 0 ? (
          <div className="space-y-3 max-h-[300px] overflow-auto">
            {cycleCountdowns.map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border cursor-pointer hover:brightness-110 transition-all" onClick={() => m.student_id && navigate(`/${routePrefix}/students/${m.student_id}`)}>
                <div>
                  <p className="text-foreground font-sans font-medium text-sm">{m.student_name}</p>
                  <p className="text-muted-foreground text-xs font-sans">Ciclo {m.cycle_number} · vence {format(new Date(m.end_date), "dd/MM")}</p>
                  {m.trainer_id && trainerMap[m.trainer_id] && (
                    <p className="text-muted-foreground/70 text-[11px] font-sans">Treinador: {trainerMap[m.trainer_id]}</p>
                  )}
                </div>
                <span className={`text-xs font-sans font-medium px-2 py-1 rounded ${
                  m.days_left <= 0 ? "bg-destructive/20 text-destructive" :
                  m.days_left <= 7 ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"
                }`}>
                  {m.days_left <= 0 ? "Vencido!" : `${m.days_left}d para troca`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground font-sans text-center py-8">Nenhum ciclo ativo no momento</p>
        )}
      </CardContent>
    </Card>
  );

  if (renewalsOnly) return renewalsCard;
  if (cyclesOnly) return cyclesCard;

  return (
    <>
      {renewalsCard}
      {cyclesCard}
    </>
  );
}
