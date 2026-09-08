import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ManualPrescriptionCycle } from "@/lib/manualPrescriptionNavigation";
import { Edit, Plus } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";

function safeFormatDate(value: string | null | undefined, fmt: string): string {
  if (!value) return "—";
  try {
    const date = parseISO(value);
    if (!isValid(date)) return "—";
    return format(date, fmt);
  } catch {
    return "—";
  }
}

interface ManualPrescriptionPanelProps {
  cycles: ManualPrescriptionCycle[];
  selectedCycle: ManualPrescriptionCycle | null;
  onCycleChange: (cycleId: string) => void;
  onOpenCycle: (cycle: ManualPrescriptionCycle | null) => void;
}

export function ManualPrescriptionPanel({
  cycles,
  selectedCycle,
  onCycleChange,
  onOpenCycle,
}: ManualPrescriptionPanelProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-secondary/20 p-4">
      <div className="space-y-1">
        <h3 className="font-display text-lg text-foreground">Prescrição manual</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Monte o treino escolhendo exercícios, séries e repetições. As alterações só são salvas em Salvar Tudo.
        </p>
      </div>

      {cycles.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="manual-prescription-cycle">Ciclo para editar ou criar treino manual</Label>
            <Select value={selectedCycle?.id || ""} onValueChange={onCycleChange}>
              <SelectTrigger id="manual-prescription-cycle" className="bg-background">
                <SelectValue placeholder="Selecione um ciclo existente" />
              </SelectTrigger>
              <SelectContent>
                {cycles.map((cycle) => (
                  <SelectItem key={cycle.id} value={cycle.id}>
                    Ciclo {cycle.cycle_number} · {safeFormatDate(cycle.start_date, "dd/MM")} a {safeFormatDate(cycle.end_date, "dd/MM/yy")}
                    {cycle.has_workout ? " · editar treino existente" : " · começar treino vazio"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenCycle(selectedCycle)}
            disabled={!selectedCycle}
          >
            {selectedCycle?.has_workout ? (
              <><Edit className="mr-2 h-4 w-4" />Editar treino</>
            ) : (
              <><Plus className="mr-2 h-4 w-4" />Criar treino manual</>
            )}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
          Nenhum ciclo existente foi encontrado para esta matrícula. Ajuste a matrícula primeiro; abrir esta aba não cria ciclos automaticamente.
        </div>
      )}

      {selectedCycle && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className={selectedCycle.has_workout ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"}>
            {selectedCycle.has_workout ? "Treino existente" : "Treino manual vazio"}
          </Badge>
          <span>Ciclo {selectedCycle.cycle_number}</span>
          <span>{safeFormatDate(selectedCycle.start_date, "dd/MM/yyyy")} → {safeFormatDate(selectedCycle.end_date, "dd/MM/yyyy")}</span>
        </div>
      )}
    </div>
  );
}
