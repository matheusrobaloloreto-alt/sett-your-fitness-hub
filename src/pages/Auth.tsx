import { useRef, useState } from "react";
import { Navigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const as = searchParams.get("as");
  const isStudent = as === "student";
  const isTrainer = as === "trainer";
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(searchParams.get("mode") === "recovery");
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const recoveryInFlight = useRef(false);
  const { toast } = useToast();

  // Redirect if already logged in
  if (!authLoading && user && !forgotPassword) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recoveryInFlight.current) return;
    setLoading(true);

    if (forgotPassword) {
      recoveryInFlight.current = true;
      setRecoveryError("");
      try {
        const { error } = await supabase.functions.invoke("student-recovery-whatsapp", {
          body: { email: email.trim() },
        });
        if (error) throw error;
        setRecoverySent(true);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        setRecoveryError(status === 429
          ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
          : "Não foi possível enviar o link agora. Tente novamente em alguns minutos.");
      } finally {
        recoveryInFlight.current = false;
        setLoading(false);
      }
      return;
    }

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Cadastro realizado!", description: "Verifique seu email para confirmar." });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <Logo size="lg" sublabel="Training App" />
          </div>
          {(isStudent || isTrainer) && (
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-navy">
              — {isStudent ? "Acesso do Aluno" : "Acesso do Treinador"}
            </p>
          )}
          <p className="text-muted-foreground text-sm font-sans">
            {forgotPassword ? "Recuperar senha" : isLogin ? "Acesse sua conta" : "Crie sua conta"}
          </p>
          <Link to="/" className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors">
            ← voltar
          </Link>
        </CardHeader>
        <CardContent>
          {recoverySent ? <div role="status" className="space-y-3 text-sm text-foreground">
            <p>Se este e-mail estiver cadastrado e vinculado a um WhatsApp confirmado, você receberá um link para criar uma nova senha.</p>
            <p className="text-muted-foreground">O link será enviado na conversa já cadastrada no SETT.</p>
          </div> : <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && !forgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-foreground">Nome completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome"
                  className="bg-secondary border-border"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="bg-secondary border-border"
                required
              />
            </div>
            {!forgotPassword && <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-secondary border-border"
                minLength={6}
                required
              />
            </div>}
            {recoveryError && <p role="alert" className="text-sm text-destructive">{recoveryError}</p>}
            <Button type="submit" className="w-full font-sans" disabled={loading}>
              {loading ? "Carregando..." : forgotPassword ? "Enviar link de recuperação" : isLogin ? "Entrar" : "Cadastrar"}
            </Button>
          </form>}
          {isLogin && !forgotPassword && <Button type="button" variant="link" className="mt-2 w-full" onClick={() => {
            setForgotPassword(true); setPassword(""); setRecoveryError("");
          }}>Esqueci minha senha</Button>}
          <button
            disabled={loading}
            onClick={() => {
              if (forgotPassword) { setForgotPassword(false); setRecoverySent(false); setRecoveryError(""); setIsLogin(true); }
              else setIsLogin(!isLogin);
            }}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-primary transition-colors font-sans"
          >
            {forgotPassword ? "Voltar para entrar" : isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Faça login"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
