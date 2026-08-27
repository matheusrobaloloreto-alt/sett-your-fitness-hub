import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getUnreadAnnouncementCount } from "@/lib/studentAnnouncements";

const AnnouncementsFeed = lazy(() => import("./AnnouncementsFeed").then((module) => ({ default: module.AnnouncementsFeed })));

/**
 * Sino de avisos no topo: ícone discreto com bolinha vermelha quando há avisos não lidos.
 * Ao tocar, abre os avisos num menu suspenso (em vez de ocupar uma aba inteira).
 */
export function AnnouncementsBell({ studentId, companyId }: { studentId: string; companyId: string }) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getUnreadAnnouncementCount(studentId, companyId)
      .then((n) => { if (alive) setUnread(n); })
      .catch(() => {});
    return () => { alive = false; };
  }, [studentId, companyId]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setUnread(0); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-11 w-11" aria-label="Avisos" title="Avisos">
          <Megaphone className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-[min(92vw,380px)] overflow-y-auto p-3">
        <p className="mb-2 font-mono-data text-xs font-semibold uppercase tracking-wide text-primary">Avisos</p>
        {open && (
          <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}>
            <AnnouncementsFeed studentId={studentId} companyId={companyId} />
          </Suspense>
        )}
      </PopoverContent>
    </Popover>
  );
}
