import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";


export function ManifestoFooter() {
  return (
    <footer className="bg-ink text-paper">
      <div className="container py-20 md:py-28">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/50 mb-10">
          — Fim do manual / Princípio fundador
        </p>
        <p className="font-display text-4xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-balance max-w-5xl">
          Volume é <em className="italic font-normal text-paper/90">verdade</em>.
          <br />
          Carga é <em className="italic font-normal text-paper/90">compromisso</em>.
          <br />
          Progressão é <em className="italic font-normal text-paper/90">prova</em>.
        </p>

        <div className="mt-20 pt-10 border-t border-paper/15 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <div>
            <div className="mb-3">
              <Logo variant="inverted" size="lg" sublabel="Training App" />
            </div>
            <p className="font-mono text-xs text-paper/50 max-w-md">
              A plataforma onde o treino vira dado. Construído para o treinador sério.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs uppercase tracking-wider">
            <Link to="/auth?as=student" className="text-paper/70 hover:text-paper transition-colors">
              Sou Aluno
            </Link>
            <Link to="/auth?as=trainer" className="text-paper/70 hover:text-paper transition-colors">
              Sou Treinador
            </Link>
            <a href="#planos" className="text-paper/70 hover:text-paper transition-colors">
              Planos
            </a>
            <a href="#diferenciais" className="text-paper/70 hover:text-paper transition-colors">
              Diferenciais
            </a>
          </div>
        </div>

        <p className="mt-10 font-mono text-[10px] uppercase tracking-wider text-paper/30">
          © {new Date().getFullYear()} Set Training App · Edição Primeira / v1.0
        </p>
      </div>
    </footer>
  );
}
