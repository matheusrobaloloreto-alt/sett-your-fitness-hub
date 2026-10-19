import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare, Wifi, WifiOff, QrCode, Phone, Bot, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { z } from "zod";
import type { WhatsAppProviderIssue } from "../../../supabase/functions/_shared/whatsappProviderState";

type ConnectionState = "disconnected" | "waiting_qr" | "connected" | "loading" | "not_configured" | "unknown";
type BotStatus = { loading: boolean; enabled: boolean | null; source: string; details?: string };
class WhatsAppRequestError extends Error {}

const providerMessages: Record<WhatsAppProviderIssue | "whatsapp_not_configured", string> = {
  whatsapp_instance_not_connected: "O provedor informou que a sessão não está conectada.",
  whatsapp_instance_missing: "Instância não encontrada no endereço consultado. Verifique o diagnóstico do provedor.",
  whatsapp_provider_unauthorized: "Falha de autorização no provedor WhatsApp.",
  whatsapp_provider_busy: "Provedor ocupado ou limite de consultas atingido.",
  whatsapp_recipient_rejected: "O provedor recusou o destinatário.",
  whatsapp_provider_invalid_payload: "O provedor não aceitou a solicitação.",
  whatsapp_provider_failure: "Falha na consulta ao provedor WhatsApp.",
  whatsapp_not_configured: "Integração WhatsApp não configurada no servidor.",
};

function safeProviderMessage(payload: unknown) {
  const code = payload && typeof payload === "object" && "code" in payload ? payload.code : null;
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(providerMessages, code)) {
    return `${providerMessages[code as keyof typeof providerMessages]} (${code})`;
  }
  return "Não foi possível verificar a integração. O estado da conexão é desconhecido.";
}

const probeClassification = z.enum([
  "ok", "unauthorized", "not_found", "rate_limited", "provider_unavailable",
  "network_error", "unexpected_response", "not_configured",
]);
const probeSchema = z.object({ status: z.number().int().min(100).max(599).nullable(), classification: probeClassification });
const diagnosticsSchema = z.object({
  evolution: z.object({
    configured: z.boolean(),
    host: z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i).nullable().optional().catch(null),
    configuredBaseHasPath: z.boolean().optional(),
    candidates: z.array(z.object({
      candidate: z.enum(["configured", "origin"]),
      fetchInstances: probeSchema,
      connectionState: probeSchema,
    })).max(2),
  }),
  zapi: z.object({ configured: z.boolean(), classification: probeClassification }).optional(),
});

function summarizeDiagnostics(payload: unknown) {
  const result = diagnosticsSchema.safeParse(payload);
  if (!result.success) return "Diagnóstico indisponível: resposta não reconhecida.";
  const { evolution, zapi } = result.data;
  const lines = [
    `Evolution: ${evolution.configured ? "configurado" : "não configurado"}`,
    `Host: ${evolution.host || "não informado"}`,
  ];
  if (typeof evolution.configuredBaseHasPath === "boolean") {
    lines.push(`Base com caminho: ${evolution.configuredBaseHasPath ? "sim" : "não"}`);
  }
  for (const candidate of evolution.candidates) {
    const label = candidate.candidate === "configured" ? "Base configurada" : "Origem";
    for (const endpoint of ["fetchInstances", "connectionState"] as const) {
      const probe = candidate[endpoint];
      lines.push(`${label} · ${endpoint}: HTTP ${probe.status ?? "sem resposta"} (${probe.classification})`);
    }
  }
  if (zapi) lines.push(`Z-API: ${zapi.configured ? zapi.classification : "não configurado"}`);
  return lines.join("\n");
}

export default function WhatsAppSettings() {
  const [state, setState] = useState<ConnectionState>("loading");
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [integrationError, setIntegrationError] = useState("");
  const [botStatus, setBotStatus] = useState<BotStatus>({ loading: true, enabled: null, source: "none" });
  const [diagnostics, setDiagnostics] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);
  const diagnosticsEpochRef = useRef(0);
  const [disablingBot, setDisablingBot] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrIssuedAtRef = useRef<number | null>(null);

  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const invoke = useCallback(async (action: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new WhatsAppRequestError("Sessão expirada. Entre novamente para continuar.");

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-manager`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action, companyId: effectiveCompanyId }),
      }
    );

    const data = await res.json();
    const knownDisconnectedInstance = action === "check-status" && data?.status === "disconnected" &&
      ["whatsapp_instance_missing", "whatsapp_instance_not_connected"].includes(data?.code);
    if (!res.ok || data?.error || (data?.code && !knownDisconnectedInstance)) {
      throw new WhatsAppRequestError(safeProviderMessage(data));
    }
    return data;
  }, [effectiveCompanyId]);

  const refreshQr = useCallback(async () => {
    const data = await invoke("refresh-qr");
    if (!data || !["connected", "disconnected", "waiting_qr", "not_configured"].includes(data.status)) {
      throw new WhatsAppRequestError(safeProviderMessage(data));
    }
    setIntegrationError("");
    setState(data.status as ConnectionState);
    setQrcode(data.status === "waiting_qr" ? data.qrcode || null : null);
    qrIssuedAtRef.current = data.status === "waiting_qr" ? Date.now() : null;
    if (data.status !== "waiting_qr") {
      setPhone(data.status === "connected" ? data.phone || null : null);
      stopPolling();
    }
  }, [invoke, stopPolling]);

  const checkStatus = useCallback(async () => {
    try {
      const data = await invoke("check-status");
      if (!data || !["connected", "disconnected", "waiting_qr", "not_configured"].includes(data.status)) {
        throw new Error(safeProviderMessage(data));
      }
      setIntegrationError(data.code ? safeProviderMessage(data) : "");
      setState(data.status as ConnectionState);
      if (data.status === "not_configured") {
        setBotStatus({ loading: false, enabled: null, source: "none" });
        stopPolling();
        return;
      }
      setPhone(data.phone || null);
      if (data.status === "disconnected") {
        setPhone(null);
        setQrcode(null);
        qrIssuedAtRef.current = null;
        stopPolling();
        return;
      }
      if (data.status === "connected") {
        setQrcode(null);
        qrIssuedAtRef.current = null;
        stopPolling();
        return;
      }
      // Pace safe QR refreshes even when the provider has not issued a QR yet.
      if (data.status === "waiting_qr" && qrIssuedAtRef.current !== null && Date.now() - qrIssuedAtRef.current >= 25000) {
        await refreshQr();
      }
    } catch (error) {
      setState("unknown");
      setPhone(null);
      setQrcode(null);
      stopPolling();
      // Request errors may contain URLs, identifiers or credentials; use only our safe messages.
      setIntegrationError(error instanceof WhatsAppRequestError ? error.message : safeProviderMessage(null));
    }
  }, [invoke, refreshQr, stopPolling]);

  const checkBotSettings = useCallback(async () => {
    setBotStatus({ loading: true, enabled: null, source: "none" });
    try {
      const data = await invoke("fetch-bot-settings");
      if (!data || typeof data.enabled !== "boolean" || !["typebot", "settings"].includes(data.source)) {
        throw new Error("Bot settings unavailable");
      }
      const details = data.source === "typebot" ? "Typebot" : data.source === "settings" ? "Configurações da instância" : "";
      setBotStatus({ loading: false, enabled: data.enabled, source: data.source, details });
    } catch {
      setBotStatus({ loading: false, enabled: null, source: "none" });
    }
  }, [invoke]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(checkStatus, 5000);
  }, [checkStatus, stopPolling]);

  useEffect(() => {
    if (state !== "waiting_qr") return;
    qrIssuedAtRef.current ??= Date.now();
    startPolling();
    return stopPolling;
  }, [state, startPolling, stopPolling]);

  // Initial load
  useEffect(() => {
    if (effectiveCompanyId) {
      checkStatus();
      checkBotSettings();
    } else {
      setState("unknown");
      setBotStatus({ loading: false, enabled: null, source: "none" });
    }
    return () => stopPolling();
  }, [effectiveCompanyId, checkStatus, checkBotSettings, stopPolling]);

  useEffect(() => {
    diagnosticsEpochRef.current += 1;
    setDiagnostics("");
    setDiagnosing(false);
    return () => { diagnosticsEpochRef.current += 1; };
  }, [effectiveCompanyId, role]);

  const handleDiagnostics = async () => {
    if (!effectiveCompanyId || (role !== "admin" && role !== "master")) return;
    const epoch = ++diagnosticsEpochRef.current;
    setDiagnosing(true);
    setDiagnostics("");
    try {
      const data = await invoke("provider-diagnostics");
      if (epoch === diagnosticsEpochRef.current) setDiagnostics(summarizeDiagnostics(data));
    } catch {
      if (epoch === diagnosticsEpochRef.current) setDiagnostics("Não foi possível consultar o diagnóstico do provedor.");
    } finally {
      if (epoch === diagnosticsEpochRef.current) setDiagnosing(false);
    }
  };

  const handleConnect = async () => {
    if (!effectiveCompanyId) {
      toast.error("Selecione uma empresa primeiro");
      return;
    }
    setBusy(true);
    try {
      const data = await invoke("init-connection");
      if (!data) return;
      setState(data.status as ConnectionState);
      if (data.status === "waiting_qr") {
        setQrcode(data.qrcode || null);
        qrIssuedAtRef.current = Date.now();
      }
      if (data.status === "connected") {
        toast.success("WhatsApp já conectado!");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao conectar");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await invoke("disconnect");
      setState("disconnected");
      setQrcode(null);
      qrIssuedAtRef.current = null;
      setPhone(null);
      stopPolling();
      toast.success("WhatsApp desconectado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao desconectar");
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshQr = async () => {
    setBusy(true);
    try {
      await refreshQr();
    } catch (error) {
      setState("unknown");
      setQrcode(null);
      qrIssuedAtRef.current = null;
      stopPolling();
      setIntegrationError(error instanceof WhatsAppRequestError ? error.message : safeProviderMessage(null));
    } finally {
      setBusy(false);
    }
  };

  const handleDisableBot = async () => {
    setDisablingBot(true);
    try {
      await invoke("disable-external-bot");
      setBotStatus(prev => ({ ...prev, enabled: false }));
      toast.success("Automação externa desativada com sucesso");
    } catch (err: any) {
      toast.error(err.message || "Erro ao desativar automação externa");
    } finally {
      setDisablingBot(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-wide">WhatsApp</h1>
          <p className="text-muted-foreground font-sans text-sm">
            Gerencie a conexão do WhatsApp Business
          </p>
        </div>

        {role === "master" && !effectiveCompanyId && (
          <Card className="max-w-lg">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Selecione uma empresa no menu lateral para gerenciar a conexão WhatsApp.</p>
            </CardContent>
          </Card>
        )}

        {/* Connection Card */}
        {effectiveCompanyId && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              Conexão WhatsApp
            </CardTitle>
            <CardDescription>
              Conecte seu número de WhatsApp para receber e enviar mensagens pela plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground font-sans">Status:</span>
              {state === "loading" && (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Verificando…
                </Badge>
              )}
              {state === "disconnected" && (
                <Badge variant="destructive" className="gap-1">
                  <WifiOff className="h-3 w-3" /> Desconectado
                </Badge>
              )}
              {state === "unknown" && (
                <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                  <ShieldAlert className="h-3 w-3" /> Estado desconhecido
                </Badge>
              )}
              {state === "waiting_qr" && (
                <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 border-amber-300">
                  <QrCode className="h-3 w-3" /> Aguardando leitura
                </Badge>
              )}
              {state === "connected" && (
                <Badge className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-300">
                  <Wifi className="h-3 w-3" /> Conectado
                </Badge>
              )}
              {state === "not_configured" && (
                <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                  <ShieldAlert className="h-3 w-3" /> Provedor não configurado
                </Badge>
              )}
            </div>

            {(state === "not_configured" || integrationError) && (
              <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 break-words">
                {integrationError || "A conexão está preparada no app, mas as credenciais do provedor WhatsApp ainda não foram configuradas no servidor."}
              </div>
            )}

            {/* Connected phone */}
            {state === "connected" && phone && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-sans">{phone}</span>
              </div>
            )}

            {/* QR Code */}
            {state === "waiting_qr" && qrcode && (
              <div className="flex flex-col items-center gap-3">
                <div className="border rounded-lg p-3 bg-white">
                  <img
                    src={qrcode.startsWith("data:") ? qrcode : `data:image/png;base64,${qrcode}`}
                    alt="QR Code WhatsApp"
                    className="w-64 h-64 object-contain"
                  />
                </div>
                <p className="text-xs text-muted-foreground font-sans text-center">
                  Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Escanear QR Code
                </p>
              </div>
            )}

            {state === "waiting_qr" && !qrcode && (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              {state === "unknown" && (
                <Button variant="outline" onClick={checkStatus} disabled={busy}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Verificar conexão
                </Button>
              )}
              {(state === "disconnected" || state === "loading") && (
                <Button onClick={handleConnect} disabled={busy || state === "loading"}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Conectar WhatsApp
                </Button>
              )}
              {state === "waiting_qr" && (
                <>
                  <Button variant="outline" onClick={handleRefreshQr} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Atualizar QR Code
                  </Button>
                  <Button variant="ghost" onClick={handleDisconnect} disabled={busy}>
                    Cancelar
                  </Button>
                </>
              )}
              {state === "connected" && (
                <Button variant="destructive" onClick={handleDisconnect} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Desconectar
                </Button>
              )}
            </div>
            {(role === "admin" || role === "master") && (
              <div className="space-y-3">
                <Button variant="outline" size="sm" onClick={handleDiagnostics} disabled={diagnosing}>
                  {diagnosing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                  Diagnóstico do provedor
                </Button>
                {diagnostics && <div role="status" className="rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-line break-words">{diagnostics}</div>}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* External Bot Card */}
        {effectiveCompanyId && state !== "not_configured" && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              Automação externa da instância
            </CardTitle>
            <CardDescription>
              Verifica se existe alguma automação configurada diretamente no provedor WhatsApp (fora da plataforma).
              Automações externas podem enviar mensagens mesmo com os fluxos da plataforma desativados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {botStatus.loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Verificando…</span>
              </div>
            ) : botStatus.enabled === null ? (
              <div className="flex items-center gap-3 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Automação externa não verificada</p>
                  <p className="text-xs mt-0.5">Não foi possível confirmar as configurações no provedor.</p>
                </div>
              </div>
            ) : botStatus.enabled ? (
              <>
                <div className="flex items-center gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                  <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Automação externa detectada</p>
                    {botStatus.details && (
                      <p className="text-xs text-muted-foreground mt-0.5">Fonte: {botStatus.details}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Esta automação pode estar enviando mensagens automaticamente sem controle da plataforma.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleDisableBot}
                  disabled={disablingBot}
                >
                  {disablingBot ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Desativar automação externa
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <Wifi className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Nenhuma automação externa detectada</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nenhuma automação foi encontrada nas configurações consultadas.
                  </p>
                </div>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={checkBotSettings} disabled={botStatus.loading}>
              Verificar novamente
            </Button>
          </CardContent>
        </Card>
        )}
      </div>
    </>
  );
}
