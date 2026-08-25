import type { ReactNode } from "react";
import { ChevronDown, Layers3 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WORKOUT_METHODS, isGroupingMethod, type MethodId } from "@/lib/workoutMethods";

type StudentMethodGroupProps = {
  children: ReactNode;
  method?: string | null;
  blockName?: string;
  instruction?: string | null;
  summary?: string | null;
  footer?: ReactNode;
  defaultOpen?: boolean;
};

export function StudentMethodGroup({
  children,
  method,
  blockName = "Bloco",
  instruction,
  summary,
  footer,
  defaultOpen = false,
}: StudentMethodGroupProps) {
  if (!method || !isGroupingMethod(method)) return <>{children}</>;
  const meta = WORKOUT_METHODS[method as MethodId];
  const methodLabel = meta?.label || method;
  const visibleInstruction = instruction || meta?.hint || "Execute os exercícios deste bloco em sequência.";

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="overflow-hidden rounded-2xl border-2 border-primary/40 bg-primary/5 shadow-sm"
    >
      <CollapsibleTrigger
        className="group flex min-h-14 w-full items-center gap-3 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Layers3 className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{blockName}</span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
              {methodLabel}
            </span>
            {summary && <span className="text-[10px] font-medium text-primary">{summary}</span>}
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{visibleInstruction}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="data-[state=closed]:hidden">
        <div className="space-y-2 border-t border-primary/20 p-2">
          {children}
          {footer}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
