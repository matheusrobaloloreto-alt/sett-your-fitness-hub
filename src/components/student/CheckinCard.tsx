// Check-in diário de prontidão (3 toques): sono, estresse e dor.
// Alimenta o readiness do motor de prescrição (professor vê e o motor corta volume em "cautela").
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, HeartPulse } from "lucide-react";
import { businessDateYmd } from "@/lib/businessDate";

interface Props { studentId: string; companyId: string | null; }

const SLEEP = [["Péssimo", 1], ["Ruim", 2], ["Regular", 3], ["Bom", 4], ["Ótimo", 5]] as const;
const STRESS = [["Muito baixo", 1], ["Baixo", 2], ["Moderado", 3], ["Alto", 4], ["Muito alto", 5]] as const;
const PAIN = [0, 2, 4, 6, 8] as const;

export function CheckinCard({ studentId, companyId }: Props) {
  const todayStr = businessDateYmd();
  const [done, setDone] = useState<boolean | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (supabase as any).from("student_checkins").select("id").eq("student_id", studentId).eq("checkin_date", todayStr).maybeSingle()
      .then(({ data }: any) => { if (alive) setDone(!!data); });
    return () => { alive = false; };
  }, [studentId, todayStr]);

  const submit = async (pain: number) => {
    if (saving || sleep == null || stress == null) return;
    setSaving(true);
    const { error } = await (supabase as any).from("student_checkins").upsert({
      student_id: studentId, company_id: companyId, checkin_date: todayStr,
      sleep_quality: sleep, stress, pain,
    }, { onConflict: "student_id,checkin_date" });
    setSaving(false);
    if (!error) setDone(true);
  };

  if (done === null) return null;
  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Check-in de hoje feito — sua equipe consegue considerar como você está.
      </div>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3 space-y-2.5">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <HeartPulse className="h-4 w-4 text-primary" /> Como você está hoje?
          <span className="text-[10px] text-muted-foreground font-normal ml-auto">leva menos de 1 minuto</span>
        </p>
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">Como foi seu sono?</span>
          <div className="grid grid-cols-5 gap-1">
            {SLEEP.map(([label, value]) => (
              <button key={value} type="button" onClick={() => setSleep(value)} aria-pressed={sleep === value}
                className={`min-h-10 rounded-md px-1 text-[10px] font-medium leading-tight transition ${sleep === value ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1" : "bg-secondary/60 text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">Como está seu estresse?</span>
          <div className="grid grid-cols-5 gap-1">
            {STRESS.map(([label, value]) => (
              <button key={value} type="button" onClick={() => setStress(value)} aria-pressed={stress === value}
                className={`min-h-10 rounded-md px-1 text-[10px] font-medium leading-tight transition ${stress === value ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1" : "bg-secondary/60 text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
        </div>
        {sleep != null && stress != null && (
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Dor percebida agora (0 = nenhuma, 8 = intensa)</span>
            <div className="grid grid-cols-5 gap-1">
              {PAIN.map((v) => (
                <button key={v} type="button" disabled={saving} onClick={() => submit(v)} aria-label={`Dor ${v} de 10`}
                  className={`min-h-10 rounded-md text-xs font-bold transition ${v >= 6 ? "bg-red-500/10 text-red-500" : v >= 4 ? "bg-amber-500/10 text-amber-600" : "bg-green-500/10 text-green-600"} hover:ring-2 hover:ring-primary disabled:opacity-50`}>{v}</button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
