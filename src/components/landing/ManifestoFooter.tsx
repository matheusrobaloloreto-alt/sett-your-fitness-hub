import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { DEFAULT_PLATFORM_CONTENT, type LandingContent } from "@/lib/platformContent";


export function ManifestoFooter({ content = DEFAULT_PLATFORM_CONTENT.cms }: { content?: LandingContent }) {
  return (
    <footer className="bg-ink text-paper">
      <div className="container py-20 md:py-28">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/50 mb-10">
          — Fim do manual / Princípio fundador
        </p>
        <p className="font-display text-4xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-balance max-w-5xl">
          <span className="whitespace-pre-line">{content.footer_manifesto}</span>
        </p>

        <div className="mt-20 pt-10 border-t border-paper/15 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <div>
            <div className="mb-3">
              <Logo variant="inverted" size="lg" sublabel="Training App" />
            </div>
            <p className="font-mono text-xs text-paper/50 max-w-md">
              {content.footer_description}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs uppercase tracking-wider">
            {content.support_url && <a href={content.support_url} rel="noopener noreferrer" className="text-paper/70 hover:text-paper">{content.support_label}</a>}
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
          © {new Date().getFullYear()} Set Training App · {content.footer_edition}
        </p>
      </div>
    </footer>
  );
}
