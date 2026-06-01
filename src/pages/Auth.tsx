import { useState } from "react";
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
  const { toast } = useToast();

  // Redirect if already logged in
  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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
            {isLogin ? "Acesse sua conta" : "Crie sua conta"}
          </p>
          <Link to="/" className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors">
            ← voltar
          </Link>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="bg-secondary border-border"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-secondary border-border"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full font-sans" disabled={loading}>
              {loading ? "Carregando..." : isLogin ? "Entrar" : "Cadastrar"}
            </Button>
          </form>
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-primary transition-colors font-sans"
          >
            {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Faça login"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
