import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
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

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-4 max-w-md">
            <h2 className="text-2xl text-primary">Algo deu errado</h2>
            <p className="text-muted-foreground font-sans text-sm">
              {this.state.error?.message || "Ocorreu um erro inesperado."}
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = "/";
                }}
              >
                Voltar ao início
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Recarregar
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
