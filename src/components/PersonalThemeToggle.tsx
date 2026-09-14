import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import type { PersonalThemeMode } from "@/lib/personalTheme";

const OPTIONS: { mode: PersonalThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Claro", icon: Sun },
  { mode: "dark", label: "Escuro", icon: Moon },
];

type PersonalThemeControlProps = {
  themeMode: PersonalThemeMode;
  setThemeMode: (mode: PersonalThemeMode) => void;
  className?: string;
};

export function PersonalThemeIconToggleControl({ themeMode, setThemeMode, className }: PersonalThemeControlProps) {
  const nextMode: PersonalThemeMode = themeMode === "dark" ? "light" : "dark";
  const NextIcon = nextMode === "dark" ? Moon : Sun;
  const nextLabel = nextMode === "dark" ? "escuro" : "claro";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-11 w-11", className)}
          onClick={() => setThemeMode(nextMode)}
          aria-label={`Alternar para tema ${nextLabel}`}
          aria-pressed={themeMode === "dark"}
          title={`Alternar para tema ${nextLabel}`}
        >
          <NextIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Tema {themeMode === "dark" ? "escuro" : "claro"}</TooltipContent>
    </Tooltip>
  );
}

export function PersonalThemeIconToggle({ className }: { className?: string }) {
  const { themeMode, setThemeMode } = useTheme();
  return <PersonalThemeIconToggleControl themeMode={themeMode} setThemeMode={setThemeMode} className={className} />;
}

export function PersonalThemeSegmentedControlView({ themeMode, setThemeMode, className }: PersonalThemeControlProps) {
  return (
    <div
      role="group"
      aria-label="Tema pessoal"
      className={cn("inline-grid grid-cols-2 rounded-lg border border-border bg-background p-1", className)}
    >
      {OPTIONS.map(({ mode, label, icon: Icon }) => {
        const active = themeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => setThemeMode(mode)}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function PersonalThemeSegmentedControl({ className }: { className?: string }) {
  const { themeMode, setThemeMode } = useTheme();
  return <PersonalThemeSegmentedControlView themeMode={themeMode} setThemeMode={setThemeMode} className={className} />;
}
