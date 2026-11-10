import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  APPEARANCE_EFFECTS,
  DASHBOARD_SECTIONS,
  DEFAULT_DASHBOARD_ORDER,
  appearanceEffectStyles,
  type AppearanceEffect,
  type ProfessionalAppearance,
} from "@/lib/professionalAppearance";

interface ProfessionalAppearanceEditorProps {
  value: ProfessionalAppearance;
  onChange: (next: ProfessionalAppearance) => void;
  disabled?: boolean;
}

const effectIds = Object.keys(APPEARANCE_EFFECTS) as AppearanceEffect[];

export default function ProfessionalAppearanceEditor({
  value,
  onChange,
  disabled = false,
}: ProfessionalAppearanceEditorProps) {
  const id = useId();
  const { dashboardOrder, effects } = value;
  const [previewMine, setPreviewMine] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const previewOrder = dashboardOrder.filter(section => previewMine
    ? !["indicators", "interested", "assessments", "cycleFeedback", "enrollmentQueue"].includes(section)
    : !["firstTraining", "enrollmentQueue"].includes(section));
  const shadows = effects.softShadows;
  const moveButton = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const button = moveButton.current;
    moveButton.current = null;
    // Reordering a keyed row can temporarily drop focus to the document.
    if (button?.isConnected && button.ownerDocument.activeElement === button.ownerDocument.body) {
      button.focus();
    }
  }, [dashboardOrder]);

  function moveSection(index: number, offset: -1 | 1, button: HTMLButtonElement) {
    const nextIndex = index + offset;
    if (disabled || nextIndex < 0 || nextIndex >= dashboardOrder.length) return;

    const nextOrder = [...dashboardOrder];
    const section = nextOrder[index];
    nextOrder[index] = nextOrder[nextIndex];
    nextOrder[nextIndex] = section;
    moveButton.current = button;
    onChange({ ...value, dashboardOrder: nextOrder });
    setOrderMessage(`${DASHBOARD_SECTIONS[section]} na posição ${nextIndex + 1} de ${nextOrder.length}.`);
  }

  function resetOrder() {
    onChange({ ...value, dashboardOrder: [...DEFAULT_DASHBOARD_ORDER] });
    setOrderMessage("Ordem padrão restaurada.");
  }

  function updateEffect(effect: AppearanceEffect, change: Partial<ProfessionalAppearance["effects"][AppearanceEffect]>) {
    onChange({ ...value, effects: { ...effects, [effect]: { ...effects[effect], ...change } } });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ordem dos cards do painel</CardTitle>
          <CardDescription>
            A ordem segue cada linha da esquerda para a direita. No celular, os cards ficam em uma coluna.
            Alguns cards só aparecem quando aplicáveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="grid gap-2 md:grid-cols-2">
            {dashboardOrder.map((section, index) => {
              const label = DASHBOARD_SECTIONS[section];
              return (
                <li key={section} className={`flex items-center justify-between gap-2 rounded-md border p-2 ${section === "indicators" || section === "enrollmentQueue" ? "md:col-span-2" : ""}`}>
                  <span className="min-w-0 break-words text-sm">{index + 1}. {label}</span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Subir ${label}`}
                      aria-disabled={index === 0 || undefined}
                      className="aria-disabled:opacity-50"
                      disabled={disabled}
                      onClick={(event) => moveSection(index, -1, event.currentTarget)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Descer ${label}`}
                      aria-disabled={index === dashboardOrder.length - 1 || undefined}
                      className="aria-disabled:opacity-50"
                      disabled={disabled}
                      onClick={(event) => moveSection(index, 1, event.currentTarget)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={resetOrder}>
            Restaurar ordem padrão
          </Button>
          <p role="status" className="sr-only">{orderMessage}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Efeitos visuais</CardTitle>
          <CardDescription>Ative os efeitos e ajuste a intensidade de cada um.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <section aria-labelledby={`${id}-preview`} className="space-y-2 lg:sticky lg:top-4 lg:self-start">
            <h3 id={`${id}-preview`} className="font-semibold">Prévia do painel</h3>
            <p className="text-sm text-muted-foreground">Exemplo da ordem e dos efeitos antes de salvar. A fila de matrículas aparece apenas quando disponível para a coordenação.</p>
            <div role="group" aria-label="Prévia por carteira" className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant={previewMine ? "outline" : "default"} aria-pressed={!previewMine}
                onClick={() => setPreviewMine(false)}>Todos os alunos</Button>
              <Button type="button" size="sm" variant={previewMine ? "default" : "outline"} aria-pressed={previewMine}
                onClick={() => setPreviewMine(true)}>Meus alunos</Button>
            </div>
            <div
              className="sett-linen sett-effects overflow-hidden rounded-xl border"
              style={appearanceEffectStyles(effects)}
              data-sett-soft-shadows={shadows.enabled && shadows.intensity > 0 ? "" : undefined}
            >
              <div className="sett-panel-header px-4 py-3 text-sm font-semibold">Painel profissional</div>
              <div className="sett-linen-content space-y-3 !p-4">
                <Button type="button" size="sm" disabled className="disabled:opacity-100">
                  Ação de exemplo
                </Button>
                <ol className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                  {previewOrder.map((section) => (
                    <li key={section} className={`sett-dashboard-card min-w-0 break-words rounded-lg border bg-card p-3 text-sm ${section === "indicators" ? "md:col-span-2" : ""}`}>
                      {DASHBOARD_SECTIONS[section]}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
          <div className="min-w-0 space-y-3 lg:order-first">
            {effectIds.map((effect) => {
              const { label, description } = APPEARANCE_EFFECTS[effect];
              const { enabled, intensity } = effects[effect];
              const toggleId = `${id}-${effect}-enabled`;
              const descriptionId = `${id}-${effect}-description`;
              const intensityId = `${id}-${effect}-intensity`;

              return (
                <div key={effect} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <label htmlFor={toggleId} className="text-sm font-medium">{label}</label>
                      <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>
                    </div>
                    <Switch
                      id={toggleId}
                      aria-describedby={descriptionId}
                      checked={enabled}
                      disabled={disabled}
                      onCheckedChange={(checked) => updateEffect(effect, { enabled: checked })}
                    />
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <label htmlFor={intensityId}>
                      Intensidade<span className="sr-only"> do efeito {label}</span>
                    </label>
                    <span aria-hidden="true">{intensity}%</span>
                  </div>
                  <input
                    id={intensityId}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={intensity}
                    aria-valuetext={`${intensity}%`}
                    disabled={disabled}
                    onChange={(event) => updateEffect(effect, { intensity: event.currentTarget.valueAsNumber })}
                    className="w-full accent-primary"
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
