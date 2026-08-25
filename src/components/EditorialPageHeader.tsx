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
  compactMobile?: boolean;
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
  compactMobile = false,
}: EditorialPageHeaderProps) {
  return (
    <header
      data-mobile-layout={compactMobile ? "compact" : undefined}
      className={cn(
        "border-b border-border bg-background",
        compactMobile && "pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-0 sm:pt-0",
        className,
      )}
    >
      <div className={cn(
        compactMobile
          ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 py-2 sm:flex sm:items-start sm:justify-between sm:gap-4 sm:py-4"
          : "flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between",
        innerClassName,
      )}>
        <div className={cn("flex min-w-0 flex-1 items-start gap-3", compactMobile && "col-start-1 row-start-1")}>
          {leading && <div className="shrink-0 pt-0.5">{leading}</div>}
          <div className="min-w-0 flex-1">
            {overline && (
              <p className={cn("mb-1 text-xs font-medium uppercase text-muted-foreground", compactMobile && "sr-only sm:not-sr-only")}>
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
              <div className={cn(
                "mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground",
                compactMobile && "mt-1 break-words text-xs sm:mt-2 sm:text-sm",
              )}>
                {context}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div
            role="region"
            aria-label="Ações da página"
            className={cn(
              "flex min-w-0 shrink-0 flex-wrap items-center gap-2 sm:justify-end",
              compactMobile && "col-start-2 row-start-1 flex-nowrap self-start",
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
