const items = [
  {
    n: "01",
    title: "Matriz de Volume Biomecânico",
    body: "Cada exercício distribui esforço entre primários e secundários. O agachamento soma volume para quadríceps e glúteos simultaneamente — em tempo real.",
  },
  {
    n: "02",
    title: "Log Real de Carga & Repetição",
    body: "Sem estimativa, sem 'fiz mais ou menos isso'. O aluno registra carga e repetição realmente executadas. O dado bruto é a base da prescrição seguinte.",
  },
  {
    n: "03",
    title: "Sobrecarga Progressiva Auditável",
    body: "Alertas visuais quando o aluno supera o ciclo anterior. Gráficos comparativos de volume e força acumulada. A evolução em prova, não em sensação.",
  },
];

export function Differentials() {
  return (
    <section id="diferenciais" className="border-b border-line">
      <div className="container py-20 md:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16">
          <div className="lg:col-span-4">
            <p className="text-eyebrow mb-4">— Capítulo / 02</p>
            <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight">
              Três <em className="italic font-normal text-navy">decisões</em> técnicas que mudam tudo.
            </h2>
          </div>
          <p className="lg:col-span-7 lg:col-start-6 text-lg text-muted-foreground leading-relaxed">
            Diferente de aplicativos de treino genéricos, o Set é construído sobre a ciência do
            bodybuilding. Estes três pilares definem por que treinadores sérios trocam a planilha
            pelo Set — e não voltam atrás.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 border-t border-line">
          {items.map((item) => (
            <article
              key={item.n}
              className="border-b md:border-b-0 md:border-r border-line last:border-r-0 p-8 md:p-10 hover:bg-paper-warm transition-colors"
            >
              <p className="font-mono text-sm text-navy mb-8">{item.n}</p>
              <h3 className="font-display text-2xl mb-4 leading-tight">{item.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
