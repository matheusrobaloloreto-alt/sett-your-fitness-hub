import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, ImagePlus, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BnContentDraft, BnContentSpec, BnStudioBootstrap, BnStudioSettings } from "@/lib/bnContentStudio";
import { BnContentStudioPreview } from "./BnContentStudioPreview";

type Props = {
  draft: BnContentDraft; settings: BnStudioSettings; capabilities: BnStudioBootstrap["capabilities"];
  assets: Record<string, string>; busy: boolean; dirty: boolean;
  onChange: (draft: BnContentDraft) => void;
  onSave: (status: "draft" | "approved", copy?: boolean) => void;
  onGenerate: (options: { objective?: string; format_key?: string; pillar?: string }) => void;
  onRevise: (instruction: string) => void;
  onImage: (index: number) => void; onExport: () => void;
};
const selectClass = "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function BnContentStudioEditor({ draft, settings, capabilities, assets, busy, dirty, onChange, onSave, onGenerate, onRevise, onImage, onExport }: Props) {
  const [selected, setSelected] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [objective, setObjective] = useState("");
  const [pillar, setPillar] = useState("");
  const [formatKey, setFormatKey] = useState("");
  const spec = draft.spec;
  const effectiveFormatKey = settings.formats.find(item => item.key === formatKey && item.format_type === spec.format)?.key || settings.formats.find(item => item.format_type === spec.format)?.key || "";
  const index = Math.min(selected, spec.slides.length - 1);
  const slide = spec.slides[index];
  const valid = spec.slides.length > 0 && spec.slides.every(item => item.title.trim());
  const approvable = valid && Boolean(spec.caption.trim()) && spec.slides[0].role === "capa" && (spec.slides.length === 1 || spec.slides.at(-1)?.role === "cta");
  const updateSpec = (patch: Partial<BnContentSpec>) => onChange({ ...draft, spec: { ...spec, ...patch } });
  const updateSlide = (patch: Partial<BnContentSpec["slides"][number]>) => updateSpec({ slides: spec.slides.map((item, at) => at === index ? { ...item, ...patch } : item) });
  const move = (delta: number) => {
    const slides = [...spec.slides];
    [slides[index], slides[index + delta]] = [slides[index + delta], slides[index]];
    updateSpec({ slides }); setSelected(index + delta);
  };
  const aesthetics = settings.aesthetics.filter(item => !item.formats?.length || item.formats.includes(spec.format));
  return <section aria-label="Editor de conteúdo" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <p className="mr-auto text-xs text-muted-foreground">{dirty ? "Alterações não salvas" : draft.post ? `${draft.post.status === "approved" ? "Aprovado" : "Rascunho"} · v${draft.post.version}` : "Novo rascunho"}</p>
      <Button variant="outline" size="icon" title="Exportar ZIP com PNGs, legenda e JSON" aria-label="Exportar conteúdo" disabled={busy || !valid} onClick={onExport}><Download /></Button>
      <Button variant="outline" size="sm" disabled={busy || !approvable} onClick={() => onSave("approved")}><Check />Aprovar</Button>
      <Button size="sm" disabled={busy || !valid} onClick={() => onSave("draft")}><Save />Salvar</Button>
    </div>
    <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-70">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs">Tema<Input maxLength={300} value={spec.topic} onChange={e => updateSpec({ topic: e.target.value })} /></label>
        <label className="block space-y-1 text-xs">Público<Input maxLength={200} value={spec.audience} onChange={e => updateSpec({ audience: e.target.value })} /></label>
        <label className="block min-w-0 space-y-1 text-xs">Formato<select className={selectClass} value={effectiveFormatKey} onChange={e => {
          const format = settings.formats.find(item => item.key === e.target.value);
          if (format) {
            setFormatKey(format.key);
            const compatible = settings.aesthetics.filter(item => !item.formats?.length || item.formats.includes(format.format_type));
            updateSpec({ format: format.format_type, aesthetic: compatible.some(item => item.key === spec.aesthetic) ? spec.aesthetic : compatible[0]?.key || spec.aesthetic });
          }
        }}>
          {!settings.formats.length && <option value="">{spec.format}</option>}
          {settings.formats.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
        </select></label>
        <label className="block min-w-0 space-y-1 text-xs">Estilo<select className={selectClass} value={spec.aesthetic} onChange={e => updateSpec({ aesthetic: e.target.value as BnContentSpec["aesthetic"] })}>
          {!aesthetics.some(item => item.key === spec.aesthetic) && <option value={spec.aesthetic}>{spec.aesthetic}</option>}
          {aesthetics.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
      </div>
      <label className="block space-y-1 text-xs">Briefing<Textarea rows={3} maxLength={6000} value={draft.brief} onChange={e => onChange({ ...draft, brief: e.target.value })} /></label>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block min-w-0 space-y-1 text-xs">Objetivo<select className={selectClass} value={objective} onChange={e => setObjective(e.target.value)}><option value="">Selecionar</option>{settings.objectives.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label className="block min-w-0 space-y-1 text-xs">Pilar<select className={selectClass} value={pillar} onChange={e => setPillar(e.target.value)}><option value="">Selecionar</option>{settings.pillars.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <Button variant="outline" disabled={!capabilities.text || !draft.brief.trim()} onClick={() => onGenerate({ objective: objective || undefined, format_key: effectiveFormatKey || undefined, pillar: pillar || undefined })}><Sparkles />Gerar conteúdo</Button>
      </div>
      {!capabilities.text && <p className="text-xs text-muted-foreground">Geração de texto indisponível.</p>}
      <div className="min-w-0 border-t pt-4">
        <div className="mb-3 flex min-w-0 items-center gap-2">
          <div role="tablist" aria-label="Slides" className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1">{spec.slides.map((item, at) => <Button key={at} role="tab" aria-selected={at === index} aria-label={`Slide ${at + 1}`} size="sm" variant={at === index ? "secondary" : "ghost"} className="h-9 w-9 shrink-0 px-0" onClick={() => setSelected(at)}>{at + 1}</Button>)}</div>
          <Button size="icon" variant="outline" aria-label="Adicionar slide" title="Adicionar slide" disabled={spec.slides.length >= 20} onClick={() => {
            updateSpec({ slides: [...spec.slides, { role: "conteudo", title: "" }] }); setSelected(spec.slides.length);
          }}><Plus /></Button>
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.85fr)]">
          <div className="min-w-0 space-y-3">
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1 space-y-1 text-xs">Tipo de slide<select value={slide.role} className={selectClass} onChange={e => updateSlide({ role: e.target.value as typeof slide.role })}><option value="capa">Capa</option><option value="conteudo">Conteúdo</option><option value="cta">CTA</option></select></label>
              <Button size="icon" variant="ghost" title="Mover slide para cima" aria-label="Mover slide para cima" disabled={index === 0} onClick={() => move(-1)}><ArrowUp /></Button>
              <Button size="icon" variant="ghost" title="Mover slide para baixo" aria-label="Mover slide para baixo" disabled={index === spec.slides.length - 1} onClick={() => move(1)}><ArrowDown /></Button>
              <Button size="icon" variant="ghost" title="Remover slide" aria-label="Remover slide" disabled={spec.slides.length === 1} onClick={() => {
                if (!window.confirm("Remover este slide?")) return;
                updateSpec({ slides: spec.slides.filter((_, at) => at !== index) }); setSelected(Math.max(0, index - 1));
              }}><Trash2 /></Button>
            </div>
            <label className="block space-y-1 text-xs">Título do slide<Input required maxLength={240} value={slide.title} onChange={e => updateSlide({ title: e.target.value })} /></label>
            <label className="block space-y-1 text-xs">Subtítulo<Input maxLength={500} value={slide.subtitle || ""} onChange={e => updateSlide({ subtitle: e.target.value })} /></label>
            <label className="block space-y-1 text-xs">Texto<Textarea rows={3} maxLength={4000} value={slide.body || ""} onChange={e => updateSlide({ body: e.target.value })} /></label>
            <label className="block space-y-1 text-xs">Tópicos<Textarea rows={3} value={slide.bullets?.join("\n") || ""} onChange={e => updateSlide({ bullets: e.target.value.split("\n") })} /></label>
            <label className="block space-y-1 text-xs">Cena da imagem<Textarea rows={2} maxLength={2000} value={slide.image_scene || ""} onChange={e => updateSlide({ image_scene: e.target.value })} /></label>
            <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!capabilities.images || !slide.image_scene?.trim()} onClick={() => onImage(index)}><ImagePlus />Gerar imagem</Button>
              {slide.background_path && <Button size="icon" variant="ghost" title="Remover imagem" aria-label="Remover imagem" onClick={() => updateSlide({ background_path: undefined })}><X /></Button>}
            </div>
            {!capabilities.images && <p className="text-xs text-muted-foreground">Geração de imagens indisponível.</p>}
          </div>
          <BnContentStudioPreview spec={spec} index={index} assets={assets} />
        </div>
      </div>
      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <label className="block space-y-1 text-xs">Legenda<Textarea rows={5} maxLength={6000} value={spec.caption} onChange={e => updateSpec({ caption: e.target.value })} /></label>
        <label className="block space-y-1 text-xs">Hashtags<Textarea rows={5} value={spec.hashtags.join(" ")} onChange={e => updateSpec({ hashtags: e.target.value.split(/\s+/).filter(Boolean) })} /></label>
      </div>
      <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 space-y-1 text-xs">Revisão<Textarea rows={2} maxLength={4000} value={instruction} onChange={e => setInstruction(e.target.value)} /></label>
        <Button variant="outline" disabled={!capabilities.text || !instruction.trim() || !valid} onClick={() => onRevise(instruction)}><Sparkles />Revisar</Button>
      </div>
      {draft.post && !spec.slides.some(item => item.background_path) && <Button size="sm" variant="ghost" disabled={!valid} onClick={() => onSave("draft", true)}><Save />Salvar como novo rascunho</Button>}
    </fieldset>
  </section>;
}
