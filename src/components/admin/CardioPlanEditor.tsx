import { Plus, Save, Trash2 } from "lucide-react";
import { Button, Input } from "@/lib/studioUi";

type CardioSessionDraft = {
  day?: string;
  type?: string;
  title?: string;
  sport?: string;
  warmup_min?: number | string;
  main_min?: number | string;
  cooldown_min?: number | string;
  total_min?: number | string;
  distance_km?: number | string | null;
  zone?: string;
  fc_target?: string;
  intervals?: string | null;
  notes?: string;
  [key: string]: unknown;
};

type CardioWeekDraft = {
  week_number?: number;
  type?: string;
  microcycle?: string;
  volume_km?: number | string | null;
  volume_hours?: number | string;
  focus?: string;
  sessions?: CardioSessionDraft[];
  [key: string]: unknown;
};

export type CardioPlanDraft = {
  plan_name?: string;
  sport?: string;
  goal?: string;
  model?: string;
  duration_weeks?: number;
  weeks?: CardioWeekDraft[];
  general_tips?: string;
  warnings?: string[];
  [key: string]: unknown;
};

type CardioPlanEditorProps = {
  modality: "corrida" | "natacao" | "ciclismo";
  plan: CardioPlanDraft;
  onChange: (plan: CardioPlanDraft) => void;
  onSave: (plan: CardioPlanDraft) => void;
  saving?: boolean;
  saved?: boolean;
};

const LABELS = { corrida: "corrida", natacao: "natação", ciclismo: "ciclismo" } as const;

function clonePlan(plan: CardioPlanDraft): CardioPlanDraft {
  return JSON.parse(JSON.stringify(plan));
}

function numericValue(value: string, emptyValue: number | null) {
  return value === "" ? emptyValue : Number(value);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function recalculateWeekVolume(week: CardioWeekDraft, modality: CardioPlanEditorProps["modality"]) {
  const sessions = Array.isArray(week.sessions) ? week.sessions : [];
  week.volume_hours = round1(sessions.reduce((total, session) => total + (Number(session.total_min) || 0), 0) / 60);
  if (modality === "natacao") {
    week.volume_km = null;
    return;
  }
  const distances = sessions
    .map((session) => session.distance_km)
    .filter((distance) => distance !== null && distance !== undefined && distance !== "")
    .map(Number)
    .filter(Number.isFinite);
  week.volume_km = distances.length ? round1(distances.reduce((total, distance) => total + distance, 0)) : null;
}

export function CardioPlanEditor({ modality, plan, onChange, onSave, saving = false, saved = false }: CardioPlanEditorProps) {
  const label = LABELS[modality];
  const weeks = Array.isArray(plan.weeks) ? plan.weeks : [];

  const updatePlan = (field: string, value: unknown) => onChange({ ...plan, [field]: value });
  const updateWeek = (weekIndex: number, field: string, value: unknown) => {
    const next = clonePlan(plan);
    const week = next.weeks?.[weekIndex];
    if (!week) return;
    week[field] = value;
    onChange(next);
  };
  const updateSession = (weekIndex: number, sessionIndex: number, field: string, value: unknown) => {
    const next = clonePlan(plan);
    const session = next.weeks?.[weekIndex]?.sessions?.[sessionIndex];
    if (!session) return;
    session[field] = value;
    if (["warmup_min", "main_min", "cooldown_min"].includes(field)) {
      session.total_min = [session.warmup_min, session.main_min, session.cooldown_min]
        .reduce<number>((total, minutes) => total + (Number(minutes) || 0), 0);
    }
    recalculateWeekVolume(next.weeks![weekIndex], modality);
    onChange(next);
  };
  const addSession = (weekIndex: number) => {
    const next = clonePlan(plan);
    const week = next.weeks?.[weekIndex];
    if (!week) return;
    week.sessions = week.sessions || [];
    week.sessions.push({
      day: "",
      type: "base_z2",
      title: "Nova sessão",
      sport: modality,
      warmup_min: 10,
      main_min: 30,
      cooldown_min: 5,
      total_min: 45,
      distance_km: null,
      zone: "Z2",
      fc_target: "",
      intervals: null,
      notes: "",
    });
    recalculateWeekVolume(week, modality);
    onChange(next);
  };
  const removeSession = (weekIndex: number, sessionIndex: number) => {
    const next = clonePlan(plan);
    const week = next.weeks?.[weekIndex];
    if (!week?.sessions || week.sessions.length <= 1) return;
    week.sessions.splice(sessionIndex, 1);
    recalculateWeekVolume(week, modality);
    onChange(next);
  };

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3" aria-label={`Editor de ${label}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#1B2B4A]">Revisar e editar {label}</h3>
          <p className="text-xs text-slate-500">A versão salva substitui este plano no app do aluno.</p>
        </div>
        {saved && <span className="text-xs font-medium text-emerald-700">Alterações salvas</span>}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">
          Nome do plano
          <Input className="mt-1 h-9" value={plan.plan_name || ""} onChange={(event) => updatePlan("plan_name", event.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Objetivo
          <Input className="mt-1 h-9" value={plan.goal || ""} onChange={(event) => updatePlan("goal", event.target.value)} />
        </label>
      </div>

      <div className="mt-3 space-y-2">
        {weeks.map((week, weekIndex) => (
          <details key={week.week_number ?? weekIndex} className="rounded-lg border border-slate-200 bg-white" open={weekIndex === 0}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[#1B2B4A]">
              Semana {week.week_number ?? weekIndex + 1} · {week.focus || "Sem foco definido"}
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-3">
              <label className="block text-xs font-medium text-slate-600">
                Foco da semana {week.week_number ?? weekIndex + 1}
                <Input className="mt-1 h-9" value={week.focus || ""} onChange={(event) => updateWeek(weekIndex, "focus", event.target.value)} />
              </label>

              {(week.sessions || []).map((session, sessionIndex) => {
                const weekNumber = week.week_number ?? weekIndex + 1;
                const sessionNumber = sessionIndex + 1;
                return (
                  <div key={sessionIndex} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#8B7355]">Sessão {sessionNumber}</p>
                      <button
                        type="button"
                        aria-label={`Remover sessão ${sessionNumber} da semana ${weekNumber}`}
                        disabled={(week.sessions || []).length <= 1}
                        onClick={() => removeSession(weekIndex, sessionIndex)}
                        className="inline-flex items-center gap-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate-600">
                        Dia
                        <Input className="mt-1 h-8" value={session.day || ""} onChange={(event) => updateSession(weekIndex, sessionIndex, "day", event.target.value)} />
                      </label>
                      <label className="text-xs text-slate-600">
                        Título
                        <Input
                          aria-label={`Título da sessão ${sessionNumber} da semana ${weekNumber}`}
                          className="mt-1 h-8"
                          value={session.title || ""}
                          onChange={(event) => updateSession(weekIndex, sessionIndex, "title", event.target.value)}
                        />
                      </label>
                      <label className="text-xs text-slate-600">
                        Tipo
                        <Input className="mt-1 h-8" value={session.type || ""} onChange={(event) => updateSession(weekIndex, sessionIndex, "type", event.target.value)} />
                      </label>
                      <label className="text-xs text-slate-600">
                        Zona / alvo de FC
                        <div className="mt-1 grid grid-cols-[5rem_1fr] gap-1">
                          <Input className="h-8" value={session.zone || ""} onChange={(event) => updateSession(weekIndex, sessionIndex, "zone", event.target.value)} />
                          <Input className="h-8" value={session.fc_target || ""} onChange={(event) => updateSession(weekIndex, sessionIndex, "fc_target", event.target.value)} />
                        </div>
                      </label>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1">
                      {(["warmup_min", "main_min", "cooldown_min", "distance_km"] as const).map((field) => (
                        <label key={field} className="text-[10px] uppercase text-slate-500">
                          {field === "warmup_min" ? "Aquec." : field === "main_min" ? "Principal" : field === "cooldown_min" ? "Volta" : "Dist. km"}
                          <Input
                            type="number"
                            min="0"
                            step={field === "distance_km" ? "0.1" : "1"}
                            className="mt-1 h-8 px-1 text-xs"
                            value={session[field] ?? ""}
                            onChange={(event) => updateSession(
                              weekIndex,
                              sessionIndex,
                              field,
                              numericValue(event.target.value, field === "distance_km" ? null : 0),
                            )}
                          />
                        </label>
                      ))}
                    </div>
                    <label className="mt-2 block text-xs text-slate-600">
                      Intervalos
                      <Input className="mt-1 h-8" value={session.intervals || ""} onChange={(event) => updateSession(weekIndex, sessionIndex, "intervals", event.target.value || null)} />
                    </label>
                    <label className="mt-2 block text-xs text-slate-600">
                      Observações
                      <textarea className="mt-1 min-h-16 w-full rounded-md border border-input bg-white px-3 py-2 text-xs" value={session.notes || ""} onChange={(event) => updateSession(weekIndex, sessionIndex, "notes", event.target.value)} />
                    </label>
                  </div>
                );
              })}

              <button type="button" onClick={() => addSession(weekIndex)} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B2B4A] underline">
                <Plus className="h-3.5 w-3.5" /> Adicionar sessão
              </button>
            </div>
          </details>
        ))}
      </div>

      <label className="mt-3 block text-xs font-medium text-slate-600">
        Orientações gerais
        <textarea className="mt-1 min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-xs" value={plan.general_tips || ""} onChange={(event) => updatePlan("general_tips", event.target.value)} />
      </label>

      <Button
        type="button"
        variant="outline"
        disabled={saving}
        onClick={() => onSave(plan)}
        aria-label={`Salvar alterações de ${label}`}
        className="mt-3 w-full border-[#1B2B4A] text-[#1B2B4A] hover:bg-[#1B2B4A]/5"
      >
        <Save className="mr-2 h-4 w-4" /> {saving ? "Salvando…" : `Salvar alterações de ${label}`}
      </Button>
    </section>
  );
}
