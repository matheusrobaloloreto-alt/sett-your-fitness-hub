import { useState } from "react";
import { CalendarDays, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateBnContentCalendar, type BnStudioCalendar } from "@/lib/bnContentStudio";
import { downloadBnContentBlob } from "@/lib/bnContentRenderer";

const labels: Record<string, string> = { weeks: "Semanas", week: "Semana", posts: "Posts", items: "Publicações", bucket: "Categoria", objetivo: "Objetivo", format_key: "Formato", format_name: "Formato", aesthetic: "Estilo", layout_id: "Layout", hook: "Gancho", days: "Dias", date: "Data", day: "Dia", title: "Título", topic: "Tema", format: "Formato", pillar: "Pilar", objective: "Objetivo", caption: "Legenda", focus: "Foco", notes: "Observações", content: "Conteúdo", calendar: "Calendário" };
function CalendarValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return <ol className="space-y-3">{value.map((item, index) => <li key={index} className="border-l-2 border-primary/30 pl-3"><CalendarValue value={item} /></li>)}</ol>;
  if (typeof value === "object") return <dl className="space-y-2">{Object.entries(value).map(([key, item]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{labels[key] || key.replaceAll("_", " ")}</dt><dd className="min-w-0 break-words text-sm"><CalendarValue value={item} /></dd></div>)}</dl>;
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}

export function BnContentStudioCalendar({ calendars, available, onCreated }: { calendars: BnStudioCalendar[]; available: boolean; onCreated: (calendar: BnStudioCalendar) => void }) {
  const [weeks, setWeeks] = useState(4);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [focus, setFocus] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = calendars.find(calendar => calendar.id === selectedId) || calendars[0];
  return <section aria-label="Calendário editorial" className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
    <div className="min-w-0 space-y-4">
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try {
          const calendar = await generateBnContentCalendar({ weeks, posts_per_week: postsPerWeek, focus });
          onCreated(calendar); setSelectedId(calendar.id);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o calendário."); }
        finally { setBusy(false); }
      }}>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs">Semanas<Input type="number" min={1} max={6} required value={weeks} disabled={busy} onChange={e => setWeeks(Number(e.target.value))} /></label>
          <label className="space-y-1 text-xs">Posts por semana<Input type="number" min={1} max={7} required value={postsPerWeek} disabled={busy} onChange={e => setPostsPerWeek(Number(e.target.value))} /></label>
        </div>
        <label className="block space-y-1 text-xs">Foco<Input maxLength={4000} value={focus} disabled={busy} onChange={e => setFocus(e.target.value)} /></label>
        <Button type="submit" disabled={!available || busy || !Number.isInteger(weeks) || weeks < 1 || weeks > 6 || !Number.isInteger(postsPerWeek) || postsPerWeek < 1 || postsPerWeek > 7} className="w-full"><CalendarDays />{busy ? "Gerando…" : "Gerar calendário"}</Button>
        {!available && <p className="text-xs text-muted-foreground">Geração indisponível.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      <div className="space-y-1 border-t pt-3">{calendars.map(calendar => <Button key={calendar.id} variant={selected?.id === calendar.id ? "secondary" : "ghost"} className="w-full justify-start" onClick={() => setSelectedId(calendar.id)}><CalendarDays />{new Date(calendar.created_at).toLocaleDateString("pt-BR")}</Button>)}</div>
    </div>
    <div className="min-w-0 space-y-4 lg:border-l lg:pl-5">{selected ? <>
      <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">Calendário editorial</h2><Button size="icon" variant="outline" aria-label="Baixar calendário" title="Baixar calendário" onClick={() => downloadBnContentBlob(new Blob([JSON.stringify(selected.calendar, null, 2)], { type: "application/json" }), `bn-calendario-${selected.id}.json`)}><Download /></Button></div>
      <CalendarValue value={selected.calendar} />
    </> : <p className="py-10 text-sm text-muted-foreground">Nenhum calendário salvo.</p>}</div>
  </section>;
}
