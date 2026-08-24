import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type EditorialTab = {
  value: string;
  label: string;
};

type EditorialTabStripProps = {
  tabs: readonly EditorialTab[];
  ariaLabel: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

export function EditorialTabStrip({
  tabs,
  ariaLabel,
  onValueChange,
  className,
}: EditorialTabStripProps) {
  return (
    <TabsList
      aria-label={ariaLabel}
      className={cn(
        "mb-4 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 pb-2 pr-20 scroll-px-4 scroll-pr-20 snap-x sm:pr-0 sm:scroll-pr-4",
        "[-webkit-overflow-scrolling:touch]",
        className,
      )}
    >
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.value}
          value={tab.value}
          onClick={() => onValueChange?.(tab.value)}
          className={cn(
            "min-h-11 shrink-0 snap-start rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-muted-foreground shadow-none",
            "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          )}
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
