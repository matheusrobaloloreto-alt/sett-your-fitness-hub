import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  scope?: "page" | "section";
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  componentDidUpdate(previousProps: Props) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      const section = this.props.scope === "section";
      const moduleLoadError = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk .+ failed|unable to preload css/i.test(this.state.error?.message || "");
      return (
        <div role="alert" className={`${section ? "min-h-48 rounded-xl border py-10" : "min-h-screen"} flex items-center justify-center bg-background p-4`}>
          <div className="text-center space-y-4 max-w-md">
            <h2 className="text-2xl text-primary">{moduleLoadError ? "Não foi possível abrir esta tela" : "Algo deu errado"}</h2>
            <p className="text-muted-foreground font-sans text-sm">
              {moduleLoadError
                ? "O carregamento foi interrompido. Recarregue esta tela para tentar novamente."
                : this.state.error?.message || "Ocorreu um erro inesperado."}
            </p>
            <div className="flex gap-3 justify-center">
              {!section && <Button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = "/";
                }}
              >
                Voltar ao início
              </Button>}
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                {section ? "Recarregar esta tela" : "Recarregar"}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
