import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, FileText } from "lucide-react";
import { useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";

interface WorkoutHeaderProps {
  cycleNumber: number;
  cycleStartDate: string;
  cycleEndDate: string;
  workoutTitle: string;
  workoutDescription?: string | null;
}

export function WorkoutHeader({
  cycleNumber,
  cycleStartDate,
  cycleEndDate,
  workoutTitle,
  workoutDescription,
}: WorkoutHeaderProps) {
  const [open, setOpen] = useState(false);

  const start = parseISO(cycleStartDate);
  const end = parseISO(cycleEndDate);
  const today = new Date();
  const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const elapsedDays = Math.max(0, differenceInCalendarDays(today, start));
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const currentWeek = Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1);

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="border-primary/40 text-primary font-mono text-[10px] uppercase tracking-wider">
              Ciclo {cycleNumber}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
              Semana {currentWeek} de {totalWeeks}
            </Badge>
          </div>
        </div>
        <p className="text-sm font-sans text-foreground font-medium">{workoutTitle}</p>

        {workoutDescription && workoutDescription.trim() && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-sans">
              <FileText className="h-3 w-3" />
              Orientações do dia
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <p className="text-xs text-muted-foreground font-sans whitespace-pre-wrap border-l-2 border-primary/30 pl-3">
                {workoutDescription}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
