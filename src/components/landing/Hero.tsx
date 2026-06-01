import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section className="border-b border-line">
      <div className="container py-20 md:py-32 grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
        <div className="lg:col-span-8">
          <p className="text-eyebrow mb-8">— Manifesto / 01</p>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-[88px] leading-[0.95] tracking-tight text-balance">
            Treino é <em className="italic font-normal text-navy">ciência</em>.
            <br />
            O resto é planilha.
          </h1>
          <p className="mt-10 max-w-xl text-lg leading-relaxed text-muted-foreground">
            O Set existe para devolver ao treinador o que sempre foi dele:{" "}
            <span className="text-foreground">o controle exato do estresse mecânico</span>{" "}
            aplicado em cada grupamento muscular. Onde a maioria oferece app de treino,
            entregamos sistema de prescrição.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              to="/auth?as=trainer"
              aria-label="Acessar como treinador"
              className="inline-flex items-center gap-2 bg-navy text-paper font-medium px-6 py-3 hover:bg-navy/90 transition-colors"
            >
              Sou Treinador <span aria-hidden>→</span>
            </Link>
            <Link
              to="/auth?as=student"
              aria-label="Acessar como aluno"
              className="inline-flex items-center gap-2 border border-foreground px-6 py-3 font-medium hover:bg-foreground hover:text-paper transition-colors"
            >
              Sou Aluno
            </Link>
            <a
              href="#planos"
              className="font-mono text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors px-2"
            >
              Ver planos ↓
            </a>
          </div>
        </div>

        {/* Editorial data block */}
        <aside className="lg:col-span-4 border-l border-line pl-8 space-y-6">
          <div>
            <p className="text-eyebrow mb-2">Ciclo 03 / Quadríceps</p>
            <p className="font-mono text-4xl text-navy leading-none">+14.2%</p>
            <p className="font-mono text-xs text-muted-foreground mt-2">
              volume total vs. ciclo 02
            </p>
          </div>
          <div className="border-t border-line pt-6">
            <p className="text-eyebrow mb-2">RPE médio</p>
            <p className="font-mono text-2xl">8.4 <span className="text-muted-foreground text-sm">/ 10</span></p>
          </div>
          <div className="border-t border-line pt-6">
            <p className="text-eyebrow mb-2">Última sessão</p>
            <p className="font-mono text-sm">Agachamento · 4×8 · 120kg</p>
            <p className="font-mono text-xs text-muted-foreground mt-1">há 12 minutos</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
