import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type IntercycleForm = {
  prescription_evaluation: "" | "better" | "same" | "worse" | "not_completed";
  goals_continue: boolean;
  new_goals?: string;
  availability_changed: boolean;
  available_days: string[];
  session_duration_minutes?: string;
  training_location?: string;
  available_equipment?: string;
  pain_present: boolean;
  pain_location?: string;
  pain_eva?: string;
  pain_started_at?: string;
  pain_movement?: string;
  additional_information?: string;
  sensitive_consent: boolean;
};

export default function PublicIntercycleAnamnesis() {
  const { token = "" } = useParams<{ token: string }>();
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [done, setDone] = useState(false); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<IntercycleForm>({ prescription_evaluation: "", goals_continue: true, availability_changed: false, available_days: [], pain_present: false, sensitive_consent: false });
  useEffect(() => { void supabase.functions.invoke("intercycle-anamnesis", { body: { action: "context", token } }).then(({ data, error }) => { if (error) setError("Este link não está disponível."); else setName(data?.student?.full_name || ""); }); }, [token]);
  const set = <Key extends keyof IntercycleForm>(key: Key, value: IntercycleForm[Key]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(""); const { error } = await supabase.functions.invoke("intercycle-anamnesis", { body: { action: "submit", token, ...form } }); setSaving(false); if (error) setError("Não foi possível registrar a atualização. Revise os campos e tente novamente."); else setDone(true); };
  if (done) return <main className="mx-auto min-h-screen max-w-xl px-5 py-20"><h1 className="text-3xl font-display text-primary">Atualização registrada</h1><p className="mt-3 text-muted-foreground">Obrigado. A equipe usará estas informações para orientar a próxima prescrição.</p></main>;
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-10"><p className="text-xs font-semibold tracking-widest text-primary">SETT</p><h1 className="mt-2 text-3xl font-display text-primary">Anamnese interciclos</h1><p className="mt-2 text-sm text-muted-foreground">{name ? `${name.split(" ")[0]}, ` : ""}é uma atualização rápida para orientar a próxima prescrição. Não substitui avaliação profissional.</p>{error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <form onSubmit={submit} className="mt-7 space-y-6 rounded-2xl border border-border bg-card p-5">
      <div><Label>Avaliação da última prescrição *</Label><select required className="mt-2 w-full rounded-md border bg-background p-2" value={form.prescription_evaluation} onChange={e => set("prescription_evaluation", e.target.value)}><option value="">Selecione</option><option value="better">Ajudou e encaixou bem</option><option value="same">Ficou parecido com o esperado</option><option value="worse">Algo piorou ou não encaixou</option><option value="not_completed">Não consegui completar</option></select></div>
      <div><Label>Objetivos e metas continuam os mesmos? *</Label><div className="mt-2 flex gap-4"><label><input type="radio" checked={form.goals_continue} onChange={() => set("goals_continue", true)} /> Sim</label><label><input type="radio" checked={!form.goals_continue} onChange={() => set("goals_continue", false)} /> Não</label></div>{!form.goals_continue && <Textarea required className="mt-2" placeholder="Quais são as novas metas ou detalhes?" value={form.new_goals || ""} onChange={e => set("new_goals", e.target.value)} />}</div>
      <div><Label>Seu tempo, espaço ou equipamentos mudaram? *</Label><div className="mt-2 flex gap-4"><label><input type="radio" checked={!form.availability_changed} onChange={() => set("availability_changed", false)} /> Não</label><label><input type="radio" checked={form.availability_changed} onChange={() => set("availability_changed", true)} /> Sim</label></div>{form.availability_changed && <div className="mt-3 space-y-3"><div className="flex flex-wrap gap-2">{DAYS.map(day => <label key={day} className="rounded border px-2 py-1 text-sm"><input type="checkbox" checked={form.available_days.includes(day)} onChange={() => set("available_days", form.available_days.includes(day) ? form.available_days.filter((item: string) => item !== day) : [...form.available_days, day])} /> {day}</label>)}</div><Input type="number" min="5" max="360" placeholder="Duração por sessão (minutos)" value={form.session_duration_minutes || ""} onChange={e => set("session_duration_minutes", e.target.value)} /><Input placeholder="Local disponível" value={form.training_location || ""} onChange={e => set("training_location", e.target.value)} /><Textarea placeholder="Equipamentos disponíveis" value={form.available_equipment || ""} onChange={e => set("available_equipment", e.target.value)} /></div>}</div>
      <div><Label>Teve dor ou desconforto recente? *</Label><div className="mt-2 flex gap-4"><label><input type="radio" checked={!form.pain_present} onChange={() => set("pain_present", false)} /> Não</label><label><input type="radio" checked={form.pain_present} onChange={() => set("pain_present", true)} /> Sim</label></div>{form.pain_present && <div className="mt-3 space-y-3"><Input required placeholder="Local" value={form.pain_location || ""} onChange={e => set("pain_location", e.target.value)} /><Input required type="number" min="0" max="10" placeholder="EVA de 0 a 10" value={form.pain_eva ?? ""} onChange={e => set("pain_eva", e.target.value)} /><Input placeholder="Quando começou?" value={form.pain_started_at || ""} onChange={e => set("pain_started_at", e.target.value)} /><Textarea placeholder="Em qual movimento ou situação aparece?" value={form.pain_movement || ""} onChange={e => set("pain_movement", e.target.value)} /></div>}</div>
      <div><Label>Informação adicional antes da próxima prescrição</Label><Textarea className="mt-2" value={form.additional_information || ""} onChange={e => set("additional_information", e.target.value)} /></div>
      <label className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
        <input required type="checkbox" className="mt-0.5" checked={form.sensitive_consent} onChange={e => set("sensitive_consent", e.target.checked)} />
        <span>Autorizo a equipe SETT/BN a usar estas respostas, incluindo informações sensíveis de saúde, dor ou desconforto quando informadas, apenas para revisar meu treino e orientar a próxima prescrição. Entendo que isso não substitui avaliação médica ou fisioterapêutica.</span>
      </label>
      <Button className="w-full" disabled={saving}>{saving ? "Enviando..." : "Enviar atualização"}</Button>
    </form></main>;
}
