import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();

  useEffect(() => {
    console.error("404 - rota não encontrada:", location.pathname, "| role:", role);
  }, [location.pathname, role]);

  const dashboardMap: Record<string, string> = {
    admin: "/admin",
    coordinator: "/coordinator",
    trainer: "/trainer",
    master: "/master",
    student: "/aluno",
  };
  const homePath = (role && dashboardMap[role]) || "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-6xl text-primary">404</h1>
        <p className="text-xl text-foreground">Página não encontrada</p>
        <p className="text-sm text-muted-foreground font-sans break-all">
          A rota <code className="bg-muted px-1.5 py-0.5 rounded">{location.pathname}</code> não existe ou você não tem acesso a ela.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={() => navigate(homePath)}>Voltar ao painel</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
