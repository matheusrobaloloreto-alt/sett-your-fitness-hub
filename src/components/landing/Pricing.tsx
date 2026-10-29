import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { usePlatformCatalog } from "@/hooks/usePlatformCatalog";
import { FEATURE_LABELS } from "@/lib/platformSettingsClient";

export function Pricing() {
  const catalog = usePlatformCatalog();
  const tiers = Object.entries(catalog.data?.tiers || {}).map(([key, tier]) => ({ name: tier.name, price: tier.monthly_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), period: "/ mês", label: tier.name, description: tier.description, features: [tier.limits_enabled && tier.active_student_limit>0?`Até ${tier.active_student_limit} alunos ativos`:"Alunos ativos sem limite de tier",...Object.entries(tier.features).filter(([,enabled]) => enabled).map(([feature]) => FEATURE_LABELS[feature as keyof typeof FEATURE_LABELS])], cta: "Começar", featured: key === "intermediate" }));
  return (
    <section id="planos" className="border-b border-line bg-paper-warm">
      <div className="container py-20 md:py-28">
        <div className="mb-16 max-w-2xl">
          <p className="text-eyebrow mb-4">— Capítulo / 03</p>
          <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight mb-6">
            Três <em className="italic font-normal text-navy">planos</em>. Sem mais.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Escolha os recursos adequados à sua operação.
          </p>
        </div>

        {catalog.isLoading && <p role="status">Carregando catálogo...</p>}
        {catalog.isError && <p role="alert">Catálogo indisponível. Tente novamente mais tarde.</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`bg-paper p-8 md:p-10 flex flex-col ${
                tier.featured ? "ring-2 ring-navy ring-offset-0 relative z-10" : ""
              }`}
            >
              {tier.featured && (
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-navy mb-6">
                  → Mais escolhido
                </p>
              )}
              <p className="font-mono text-xs tracking-wider uppercase text-muted-foreground mb-2">
                {tier.label}
              </p>
              <h3 className="font-display text-3xl mb-4">{tier.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="font-display text-5xl text-navy">{tier.price}</span>
                <span className="font-mono text-sm text-muted-foreground">{tier.period}</span>
              </div>
              <p className="text-muted-foreground mb-8 leading-relaxed">{tier.description}</p>

              <ul className="space-y-3 mb-10 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <Check className="h-4 w-4 text-navy mt-0.5 shrink-0" strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/auth?as=trainer"
                className={`block text-center py-3 font-medium transition-colors ${
                  tier.featured
                    ? "bg-navy text-paper hover:bg-navy/90"
                    : "border border-foreground hover:bg-foreground hover:text-paper"
                }`}
              >
                {tier.cta} →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
