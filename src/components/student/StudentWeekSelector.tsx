import { CalendarDays } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { studentWeekBlockOptions } from "@/lib/weeklyStrengthPeriodization";

export function StudentWeekSelector({
  currentWeek,
  durationWeeks,
  selectedStartWeek,
  hasWeeklyPrescriptions,
  onChange,
  onBlocked,
  className,
}: {
  currentWeek: number;
  durationWeeks?: number | null;
  selectedStartWeek: number;
  hasWeeklyPrescriptions: boolean;
  onChange: (startWeek: number) => void;
  onBlocked?: (label: string) => void;
  className?: string;
}) {
  const options = studentWeekBlockOptions({ currentWeek, durationWeeks, hasWeeklyPrescriptions, selectedStartWeek });
  const current = options.find((option) => option.startWeek === selectedStartWeek) || options[0];
  if (!current) return null;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="shrink-0 text-xs font-medium text-muted-foreground">Semanas</span>
      <Select value={String(current.startWeek)} onValueChange={(value) => {
        const option = options.find((item) => item.startWeek === Number(value));
        if (!option) return;
        if (!option.available) {
          onBlocked?.(`${option.label} estão disponíveis após a conclusão da sua semana atual`);
          return;
        }
        onChange(option.startWeek);
      }}>
        <SelectTrigger className="h-9 min-w-0 flex-1 bg-card text-xs sm:w-[170px] sm:flex-none">
          <SelectValue aria-label={current.label}>{current.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.startWeek} value={String(option.startWeek)}>
              <span className="flex items-center gap-2">
                <span>{option.label}</span>
                {option.hasNewContent && option.available && <span className="h-2 w-2 rounded-full bg-blue-500" aria-label="Semana nova disponível" />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current.hasNewContent && current.available && selectedStartWeek !== 1 && (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" title="Há semanas novas disponíveis" aria-label="Há semanas novas disponíveis" />
      )}
    </div>
  );
}
