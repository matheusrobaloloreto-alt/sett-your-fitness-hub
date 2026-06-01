import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur">
      <nav className="container flex h-14 items-center justify-between">
        <Logo asLink to="/" size="md" sublabel="Training App" />
        <div className="flex items-center gap-3 sm:gap-5">
          <a href="#diferenciais" className="hidden md:block font-mono text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors">
            Diferenciais
          </a>
          <a href="#planos" className="hidden md:block font-mono text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors">
            Planos
          </a>
          <Link
            to="/auth?as=student"
            aria-label="Acessar como aluno"
            className="font-mono text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            Sou Aluno
          </Link>
          <Link
            to="/auth?as=trainer"
            aria-label="Acessar como treinador"
            className="font-mono text-xs tracking-wider uppercase border border-foreground px-3 py-1.5 hover:bg-foreground hover:text-paper transition-colors"
          >
            Sou Treinador →
          </Link>
        </div>
      </nav>
    </header>
  );
}
