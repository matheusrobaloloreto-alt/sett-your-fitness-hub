import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EditorialPageHeaderProps = {
  overline?: ReactNode;
  title: string;
  context?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  innerClassName?: string;
  titleClassName?: string;
};

export function EditorialPageHeader({
  overline,
  title,
  context,
  leading,
  meta,
  actions,
  className,
  innerClassName,
  titleClassName,
}: EditorialPageHeaderProps) {
  return (
    <header className={cn("border-b border-border bg-background", className)}>
      <div className={cn("flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between", innerClassName)}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {leading && <div className="shrink-0 pt-0.5">{leading}</div>}
          <div className="min-w-0 flex-1">
            {overline && (
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                {overline}
              </p>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1
                className={cn(
                  "max-w-full break-words font-display text-2xl leading-tight text-foreground sm:text-3xl",
                  titleClassName,
                )}
                title={title}
              >
                {title}
              </h1>
              {meta}
            </div>
            {context && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {context}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div
            role="region"
            aria-label="Ações da página"
            className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
