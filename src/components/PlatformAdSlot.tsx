import { useEffect, useState } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Audience = "professional" | "student";
type Placement = "dashboard_banner" | "footer";

interface PlatformAd {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  placement: Placement;
}

interface PlatformAdSlotProps {
  audience: Audience;
  placement: Placement;
  companyId?: string | null;
  className?: string;
}

export function PlatformAdSlot({ audience, placement, companyId, className }: PlatformAdSlotProps) {
  const [ad, setAd] = useState<PlatformAd | null>(null);

  useEffect(() => {
    let current = true;
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_active_platform_ads", {
        _audience: audience,
        _placement: placement,
        _company_id_hint: companyId || null,
      });
      if (!current || error) return;
      setAd((data?.[0] as PlatformAd | undefined) ?? null);
    })();
    return () => { current = false; };
  }, [audience, placement, companyId]);

  if (!ad) return null;

  const content = (
    <div
      className={cn(
        "overflow-hidden border border-primary/15 bg-card text-foreground shadow-sm",
        placement === "dashboard_banner"
          ? "grid min-h-[120px] grid-cols-1 rounded-xl sm:grid-cols-[minmax(0,1fr)_minmax(180px,32%)]"
          : "flex min-h-16 items-center gap-4 rounded-xl px-4 py-3",
        className,
      )}
    >
      <div className={cn("min-w-0", placement === "dashboard_banner" ? "p-5 sm:p-6" : "flex-1")}> 
        <p className="text-eyebrow flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5" /> Em destaque
        </p>
        <h3 className={cn("font-display text-foreground", placement === "dashboard_banner" ? "mt-2 text-2xl" : "text-lg")}> 
          {ad.title}
        </h3>
        {ad.body && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ad.body}</p>}
        {ad.cta_url && (
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            {ad.cta_label || "Saiba mais"}<ExternalLink className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      {placement === "dashboard_banner" && ad.image_url && (
        <img src={ad.image_url} alt="" className="h-full min-h-[120px] w-full object-cover" loading="lazy" />
      )}
    </div>
  );

  return ad.cta_url ? (
    <a href={ad.cta_url} target="_blank" rel="noreferrer" aria-label={`${ad.title}: ${ad.cta_label || "Saiba mais"}`}>
      {content}
    </a>
  ) : content;
}
