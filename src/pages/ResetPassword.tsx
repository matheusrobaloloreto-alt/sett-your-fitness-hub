import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Logo } from "@/components/Logo";

export default function ResetPassword() {
  const { completePasswordRecovery } = useAuth();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid" | "saved">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const invalidLink = [url.searchParams, fragment].some(params => params.has("error") || params.has("error_code"));
    if (invalidLink) {
      setStatus("invalid");
      window.history.replaceState(window.history.state, "", window.location.pathname);
      return;
    }
    // getUser waits for the SDK's automatic callback exchange and validates
    // the session with Auth, rather than trusting parameters in the link.
    supabase.auth.getUser().then(({ data, error }) => {
      if (active) setStatus(!error && data.user ? "ready" : "invalid");
    }).catch(() => { if (active) setStatus("invalid"); });
    return () => { active = false; };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== "ready" || inFlight.current) return;
    setError("");
    if (password.length < 8) { setError("Use pelo menos 8 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não conferem."); return; }
    inFlight.current = true;
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (error.status === 401 || error.status === 403 || error.code === "session_not_found") {
          setStatus("invalid");
        } else {
          setError(error.code === "same_password"
            ? "Escolha uma senha diferente da anterior."
            : error.code === "weak_password"
              ? "Escolha uma senha mais forte, com letras, números e símbolos."
              : "Não foi possível atualizar a senha. Tente novamente.");
        }
        return;
      }
      if (!data.user) throw new Error("Password update not confirmed");
      setPassword(""); setConfirm(""); setStatus("saved");
      completePasswordRecovery();
    } catch {
      setError("Não foi possível atualizar a senha. Verifique sua conexão e tente novamente.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return <div className="min-h-screen flex items-center justify-center bg-background p-4">
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="space-y-4 text-center">
        <div className="flex justify-center"><Logo size="lg" sublabel="Training App" /></div>
        <h1 className="flex items-center justify-center gap-2 text-xl font-semibold"><KeyRound className="h-5 w-5" /> Nova senha</h1>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "checking" && <p role="status" className="text-sm text-muted-foreground">Verificando o link...</p>}
        {status === "invalid" && <>
          <p role="alert" className="text-sm text-foreground">Este link expirou ou não é válido. Solicite um novo link para recuperar sua senha.</p>
          <Button asChild className="w-full"><Link to="/auth?mode=recovery" onClick={completePasswordRecovery}>Solicitar novo link</Link></Button>
        </>}
        {status === "saved" && <>
          <p role="status" className="text-sm text-foreground">Senha atualizada com sucesso.</p>
          <Button asChild className="w-full"><Link to="/">Entrar no app</Link></Button>
        </>}
        {status === "ready" && <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <div className="relative">
              <Input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} className="pr-12" aria-describedby="password-requirement" disabled={saving} />
              <Button type="button" size="icon" variant="ghost" className="absolute right-0 top-0" title={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(value => !value)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p id="password-requirement" className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <Input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={saving} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Salvando..." : "Salvar nova senha"}</Button>
        </form>}
      </CardContent>
    </Card>
  </div>;
}
