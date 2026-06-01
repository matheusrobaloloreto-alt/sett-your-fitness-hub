import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare, Wifi, WifiOff, QrCode, Phone, Bot, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";

type ConnectionState = "disconnected" | "waiting_qr" | "connected" | "loading";
type BotStatus = { loading: boolean; enabled: boolean; source: string; details?: string };

export default function WhatsAppSettings() {
  const [state, setState] = useState<ConnectionState>("loading");
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [botStatus, setBotStatus] = useState<BotStatus>({ loading: true, enabled: false, source: "none" });
  const [disablingBot, setDisablingBot] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrIssuedAtRef = useRef<number | null>(null);

  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const invoke = useCallback(async (action: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Sessão expirada"); return null; }

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

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erro ao comunicar com o servidor");
    }
    return res.json();
  }, [effectiveCompanyId]);

  const checkStatus = useCallback(async () => {
    try {
      const data = await invoke("check-status");
      if (!data) return;
      setState(data.status as ConnectionState);
      setPhone(data.phone || null);
      if (data.status === "connected") {
        setQrcode(null);
        qrIssuedAtRef.current = null;
        stopPolling();
        return;
      }
      // Auto-refresh QR if it's been waiting too long (~25s)
      if (data.status === "waiting_qr" && qrIssuedAtRef.current && Date.now() - qrIssuedAtRef.current > 25000) {
        try {
          const refreshed = await invoke("refresh-qr");
          if (refreshed?.qrcode) {
            setQrcode(refreshed.qrcode);
            qrIssuedAtRef.current = Date.now();
          }
          if (refreshed?.status) setState(refreshed.status as ConnectionState);
        } catch { /* silent */ }
      }
    } catch {
      // silent
    }
  }, [invoke]);

  const checkBotSettings = useCallback(async () => {
    try {
      const data = await invoke("fetch-bot-settings");
      if (!data) return;
      const details = data.source === "typebot" ? "Typebot" : data.source === "settings" ? "Configurações da instância" : "";
      setBotStatus({ loading: false, enabled: data.enabled, source: data.source, details });
    } catch {
      setBotStatus({ loading: false, enabled: false, source: "none" });
    }
  }, [invoke]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(checkStatus, 5000);
  }, [checkStatus, stopPolling]);

  // Initial load
  useEffect(() => {
    if (effectiveCompanyId) {
      checkStatus();
      checkBotSettings();
    } else {
      setState("disconnected");
      setBotStatus({ loading: false, enabled: false, source: "none" });
    }
    return () => stopPolling();
  }, [effectiveCompanyId, checkStatus, checkBotSettings, stopPolling]);

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
      if (data.qrcode) {
        setQrcode(data.qrcode);
        qrIssuedAtRef.current = Date.now();
        startPolling();
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

  const handleRestart = async () => {
    setBusy(true);
    try {
      const data = await invoke("restart-connection");
      if (!data) return;
      setState(data.status as ConnectionState);
      if (data.qrcode) {
        setQrcode(data.qrcode);
        qrIssuedAtRef.current = Date.now();
        startPolling();
      }
      toast.success("Instância recriada, escaneie o novo QR Code");
    } catch (err: any) {
      toast.error(err.message || "Erro ao reconectar");
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
    <AppLayout>
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
            </div>

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
            <div className="flex gap-3">
              {(state === "disconnected" || state === "loading") && (
                <Button onClick={handleConnect} disabled={busy || state === "loading"}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Conectar WhatsApp
                </Button>
              )}
              {state === "waiting_qr" && (
                <>
                  <Button variant="outline" onClick={handleRestart} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Reconectar
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
          </CardContent>
        </Card>
        )}

        {/* External Bot Card */}
        {effectiveCompanyId && (
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
                    Todas as mensagens automáticas são controladas pelos fluxos da plataforma.
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
    </AppLayout>
  );
}
