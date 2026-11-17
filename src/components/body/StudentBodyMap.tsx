// Boneco do PERFIL do aluno — por enquanto SÓ o sistema MUSCULAR (o de qualidade, via lib).
// Esqueleto/órgãos/nervos foram removidos até termos ilustrações profissionais de base (lib ou
// imagem-arquivo) — desenhar à mão dava resultado ruim. O modelo de dados (student_body_limitations)
// já suporta os 4 tipos, então voltar a expor os outros sistemas depois é simples.
// Sempre visível, preenchível MANUALMENTE; cor por origem: AZUL = manual, VERMELHO = avaliação.
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash2, X, Pencil } from "lucide-react";
import { BodyMap } from "./BodyMap";
import { assessmentToBodyRegions } from "@/lib/assessmentBodyMap";
import { BODY_REGION_LABELS, normalizeGender, type BodyRegionId, type LimitationType } from "@/lib/bodyMap";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<LimitationType, string> = { muscular: "Muscular", articular: "Articular", neural: "Neural" };
const TYPES: LimitationType[] = ["muscular", "articular", "neural"];
const SEVERITIES = ["leve", "moderada", "severa"] as const;
// Cor da região no boneco = por ORIGEM (azul manual / vermelho avaliação).
const SOURCE_COLOR: Record<"manual" | "assessment", string> = { manual: "#3b82f6", assessment: "#ef4444" };

interface Merged {
  region: BodyRegionId;
  type: LimitationType;
  severity?: string | null;
  note?: string | null;
  source: "manual" | "assessment";
}
interface Draft { type: LimitationType; severity: string; note: string }

export function StudentBodyMap({ studentId, headingAction }: { studentId: string; headingAction?: ReactNode }) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [manual, setManual] = useState<Record<string, Merged>>({});
  const [assess, setAssess] = useState<Merged[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BodyRegionId | null>(null);
  const [draft, setDraft] = useState<Draft>({ type: "muscular", severity: "", note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: st } = await supabase.from("students").select("company_id, gender").eq("id", studentId).maybeSingle();
    setCompanyId((st as any)?.company_id ?? null);
    setGender(normalizeGender((st as any)?.gender) ?? "male");

    const { data: lims } = await (supabase as any)
      .from("student_body_limitations").select("region, type, severity, note").eq("student_id", studentId);
    const m: Record<string, Merged> = {};
    (lims ?? []).forEach((l: any) => {
      // Só mostra limitações em regiões musculares válidas (o resto é de outros sistemas, ocultos por ora).
      if (l.region in BODY_REGION_LABELS) m[l.region] = { region: l.region, type: l.type, severity: l.severity, note: l.note, source: "manual" };
    });
    setManual(m);

    const { data: a } = await supabase
      .from("functional_assessments").select("assessment_json")
      .eq("student_id", studentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    let regs: Merged[] = [];
    try {
      regs = ((a as any)?.assessment_json ? assessmentToBodyRegions((a as any).assessment_json) : [])
        .map((r) => ({ region: r.region, type: r.type, severity: r.severity, note: r.note, source: "assessment" as const }));
    } catch { regs = []; }
    setAssess(regs);
    setLoading(false);
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  // Merge por região (manual sobrescreve avaliação).
  const byRegion = new Map<BodyRegionId, Merged>();
  for (const r of assess) if (!byRegion.has(r.region)) byRegion.set(r.region, r);
  for (const region of Object.keys(manual)) byRegion.set(region as BodyRegionId, manual[region]);
  const items = Array.from(byRegion.values());

  const getRegionFill = (id: BodyRegionId) => {
    if (id === editing) return SOURCE_COLOR.manual;
    const m = byRegion.get(id);
    return m ? SOURCE_COLOR[m.source] : undefined;
  };
  const activeRegions = [...Array.from(byRegion.keys()), ...(editing && !byRegion.has(editing) ? [editing] : [])];

  const openEditor = (region: BodyRegionId) => {
    const cur = byRegion.get(region);
    setDraft({ type: cur?.type ?? "muscular", severity: cur?.severity ?? "", note: cur?.note ?? "" });
    setEditing(region);
  };
  const saveDraft = async () => {
    if (!editing || !companyId) return;
    setSaving(true);
    await (supabase as any).from("student_body_limitations").upsert({
      student_id: studentId, company_id: companyId, region: editing,
      type: draft.type, severity: draft.severity || null, note: draft.note.trim() || null,
      source: "manual", updated_at: new Date().toISOString(),
    }, { onConflict: "student_id,region" });
    setSaving(false); setEditing(null); await load();
  };
  const removeRegion = async (region: BodyRegionId) => {
    setSaving(true);
    await (supabase as any).from("student_body_limitations").delete().eq("student_id", studentId).eq("region", region);
    setSaving(false); setEditing(null); await load();
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const editingIsManual = editing ? manual[editing]?.source === "manual" : false;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-2">
            <h3 className="text-sm font-mono-data font-semibold text-muted-foreground uppercase tracking-wider">Mapa de limitações</h3>
            {headingAction}
          </div>
          <span className="text-[11px] text-muted-foreground">Clique numa região para marcar</span>
        </div>

        <div className="lg:flex lg:gap-4 lg:items-start">
          <div className="lg:flex-1 lg:min-w-0">
        <BodyMap
          gender={gender}
          getRegionFill={getRegionFill}
          activeRegions={activeRegions}
          onRegionClick={openEditor}
          footer={
            <div className="flex items-center justify-center gap-3 flex-wrap mt-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLOR.manual }} /> Marcado por você</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLOR.assessment }} /> Da avaliação</span>
            </div>
          }
        />
          </div>

        {editing && (
          <div className="mt-3 lg:mt-0 lg:w-72 lg:shrink-0 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{BODY_REGION_LABELS[editing]}</p>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Tipo</p>
              <div className="flex gap-1.5">
                {TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => setDraft((d) => ({ ...d, type: t }))}
                    className={cn("px-2.5 py-1 rounded-md text-xs border transition-colors",
                      draft.type === t ? "bg-primary text-primary-foreground border-transparent" : "text-muted-foreground border-border hover:bg-muted/50")}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Gravidade</p>
              <div className="flex gap-1.5">
                {SEVERITIES.map((s) => (
                  <button key={s} type="button" onClick={() => setDraft((d) => ({ ...d, severity: d.severity === s ? "" : s }))}
                    className={cn("px-2.5 py-1 rounded-md text-xs border capitalize transition-colors",
                      draft.severity === s ? "bg-primary text-primary-foreground border-transparent" : "text-muted-foreground border-border hover:bg-muted/50")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <Textarea value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Observação (opcional): ex. dor anterior do joelho ao agachar." className="min-h-[60px]" />
            <div className="flex items-center justify-between">
              {editingIsManual ? (
                <Button variant="ghost" size="sm" className="text-destructive" disabled={saving} onClick={() => removeRegion(editing)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                </Button>
              ) : <span />}
              <Button size="sm" disabled={saving} onClick={saveDraft}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null} Salvar
              </Button>
            </div>
          </div>
        )}
        </div>

        {items.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {items.map((l) => (
              <button key={l.region} onClick={() => openEditor(l.region)} className="w-full flex items-start gap-2 text-xs text-left hover:bg-muted/40 rounded px-1.5 py-1">
                <span className="h-2.5 w-2.5 rounded-full mt-1 shrink-0" style={{ background: SOURCE_COLOR[l.source] }} />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{BODY_REGION_LABELS[l.region]}</span>
                  <span className="text-muted-foreground"> · {TYPE_LABEL[l.type]}{l.severity ? ` (${l.severity})` : ""}</span>
                  <span className={cn("ml-1.5 text-[9px] uppercase tracking-wide rounded px-1",
                    l.source === "manual" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {l.source === "manual" ? "manual" : "avaliação"}
                  </span>
                  {l.note && <p className="text-[11px] text-muted-foreground">{l.note}</p>}
                </div>
                <Pencil className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Informação ainda não inserida — gere uma avaliação ou clique numa região para marcar manualmente.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
