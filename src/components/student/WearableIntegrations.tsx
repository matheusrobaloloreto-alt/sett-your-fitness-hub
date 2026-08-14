import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Apple,
  Bike,
  CheckCircle2,
  CloudCog,
  Footprints,
  HeartPulse,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Watch,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ProviderId = "oura" | "apple_health" | "garmin" | "strava" | "polar" | "whoop";

interface WearableDevice {
  id: string;
  provider: ProviderId;
  device_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_error: string | null;
}

interface WearableMetric {
  date: string;
  metric: string;
  value: number;
  unit: string | null;
  source: ProviderId;
}

interface WearableWorkout {
  started_at: string;
  activity_type: string | null;
  duration_min: number | null;
  distance_km: number | null;
  avg_heart_rate: number | null;
  source: ProviderId;
}

interface WearableStatus {
  devices: WearableDevice[];
  metrics: WearableMetric[];
  workouts: WearableWorkout[];
}

const PROVIDERS: Array<{
  id: ProviderId;
  name: string;
  detail: string;
  icon: typeof Watch;
}> = [
  { id: "oura", name: "Oura Ring", detail: "Sono, prontidão e atividade", icon: HeartPulse },
  { id: "apple_health", name: "Apple Saúde", detail: "Saúde e treinos do Apple Watch", icon: Apple },
  { id: "garmin", name: "Garmin", detail: "Treinos, sono e recuperação", icon: Watch },
  { id: "strava", name: "Strava", detail: "Corrida, ciclismo e atividades", icon: Activity },
  { id: "polar", name: "Polar", detail: "Treinos e frequência cardíaca", icon: Waves },
  { id: "whoop", name: "WHOOP", detail: "Recuperação, esforço e sono", icon: ShieldCheck },
];

const METRIC_LABELS: Record<string, string> = {
  sleep_score: "Sono",
  readiness_score: "Prontidão",
  activity_score: "Atividade",
  recovery_score: "Recuperação",
  sleep_performance: "Sono",
  strain: "Esforço",
};

function formatDate(value: string | null) {
  if (!value) return "Ainda não sincronizado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function WearableIntegrations() {
  const { toast } = useToast();
  const [status, setStatus] = useState<WearableStatus>({ devices: [], metrics: [], workouts: [] });
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("wearable-connect", {
      body: { action: "status" },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Não foi possível carregar as integrações", description: error.message, variant: "destructive" });
      return;
    }
    setStatus({
      devices: Array.isArray(data?.devices) ? data.devices : [],
      metrics: Array.isArray(data?.metrics) ? data.metrics : [],
      workouts: Array.isArray(data?.workouts) ? data.workouts : [],
    });
  }, [toast]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("wearable");
    if (result === "connected") toast({ title: "Integração conectada", description: "Agora sincronize para trazer seus dados mais recentes." });
    if (result === "error" || result === "expired") toast({
      title: "A conexão não foi concluída",
      description: result === "expired" ? "A autorização expirou. Tente conectar novamente." : "O provedor recusou ou interrompeu a autorização.",
      variant: "destructive",
    });
    if (result) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("wearable");
      cleanUrl.searchParams.delete("provider");
      window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
    void loadStatus();
  }, [loadStatus, toast]);

  const connectedByProvider = useMemo(
    () => new Map(status.devices.filter((device) => device.is_active).map((device) => [device.provider, device])),
    [status.devices],
  );

  const latestMetrics = useMemo(() => {
    const seen = new Set<string>();
    return status.metrics.filter((metric) => {
      if (seen.has(metric.metric)) return false;
      seen.add(metric.metric);
      return true;
    }).slice(0, 6);
  }, [status.metrics]);

  const connect = async (provider: ProviderId) => {
    setBusyProvider(provider);
    const { data, error } = await supabase.functions.invoke("wearable-connect", {
      body: { action: "authorize", provider },
    });
    setBusyProvider(null);
    if (error) {
      toast({ title: "Falha ao iniciar a conexão", description: error.message, variant: "destructive" });
      return;
    }
    if (data?.status === "ready" && data.authorize_url) {
      window.location.assign(data.authorize_url);
      return;
    }
    toast({
      title: data?.status === "requires_native_app" ? "Requer o app para iPhone" : data?.status === "approval_required" ? "Integração em credenciamento" : "Configuração pendente",
      description: data?.message || "Essa integração ainda não está disponível.",
    });
  };

  const sync = async (provider: ProviderId) => {
    setBusyProvider(provider);
    const { data, error } = await supabase.functions.invoke("wearable-connect", {
      body: { action: "sync", provider },
    });
    setBusyProvider(null);
    if (error || data?.error) {
      toast({ title: "Falha na sincronização", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Dados atualizados", description: `${Number(data?.imported || 0)} registros sincronizados.` });
    await loadStatus();
  };

  const disconnect = async (provider: ProviderId) => {
    setBusyProvider(provider);
    const { error } = await supabase.functions.invoke("wearable-connect", {
      body: { action: "disconnect", provider },
    });
    setBusyProvider(null);
    if (error) {
      toast({ title: "Não foi possível desconectar", description: error.message, variant: "destructive" });
      return;
    }
    await loadStatus();
  };

  if (loading) {
    return <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-7">
      <section>
        <p className="text-eyebrow">Seus dados</p>
        <h2 className="mt-1 font-display text-3xl text-foreground">Relógios e aplicativos</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Sono, recuperação e atividades ficam reunidos aqui e ajudam o BNITO a orientar sua rotina com mais contexto.
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        {PROVIDERS.map((provider, index) => {
          const device = connectedByProvider.get(provider.id);
          const Icon = provider.icon;
          const busy = busyProvider === provider.id;
          return (
            <div
              key={provider.id}
              className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", index > 0 && "border-t border-border")}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{provider.name}</h3>
                    {device && <Badge variant="outline" className="border-emerald-300 text-emerald-700">Conectado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{device ? `Última sincronização: ${formatDate(device.last_sync_at)}` : provider.detail}</p>
                  {device?.last_error && <p className="mt-1 text-xs text-destructive">{device.last_error}</p>}
                </div>
              </div>
              <div className="flex gap-2 sm:justify-end">
                {device ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => void sync(provider.id)} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      <span className="ml-2">Sincronizar</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void disconnect(provider.id)} disabled={busy} title="Desconectar" aria-label={`Desconectar ${provider.name}`}>
                      <Unplug className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => void connect(provider.id)} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudCog className="h-4 w-4" />}
                    <span className="ml-2">Conectar</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {latestMetrics.length > 0 && (
        <section>
          <p className="text-eyebrow mb-3">Sinais recentes</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {latestMetrics.map((metric) => (
              <div key={`${metric.source}-${metric.metric}`} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{METRIC_LABELS[metric.metric] || metric.metric.replaceAll("_", " ")}</p>
                <p className="mt-1 font-mono-data text-2xl text-primary">{Math.round(metric.value)}<span className="ml-1 text-xs text-muted-foreground">{metric.unit === "score" ? "/100" : metric.unit}</span></p>
                <p className="mt-1 text-[11px] uppercase text-muted-foreground">{metric.source} · {metric.date}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {status.workouts.length > 0 && (
        <section>
          <p className="text-eyebrow mb-3">Atividades importadas</p>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {status.workouts.slice(0, 8).map((workout, index) => {
              const Icon = String(workout.activity_type || "").toLowerCase().includes("ride") ? Bike : Footprints;
              return (
                <div key={`${workout.source}-${workout.started_at}-${index}`} className={cn("flex items-center gap-3 p-4", index > 0 && "border-t border-border")}>
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{workout.activity_type || "Atividade"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(workout.started_at)} · {workout.source}</p>
                  </div>
                  <div className="text-right font-mono-data text-xs text-muted-foreground">
                    {workout.distance_km != null && <p>{workout.distance_km.toFixed(1)} km</p>}
                    {workout.duration_min != null && <p>{workout.duration_min} min</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {status.devices.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Seus dados permanecem vinculados ao seu perfil e à sua equipe.
        </p>
      )}
    </div>
  );
}
