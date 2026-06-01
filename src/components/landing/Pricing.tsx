import { Link } from "react-router-dom";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Básico",
    price: "R$ 49,90",
    period: "/ mês",
    label: "Personal Solo",
    description: "Para quem está construindo a operação. Biblioteca, prescrição e log essenciais.",
    features: [
      "Até 30 alunos ativos",
      "Biblioteca de exercícios com vídeo",
      "Prescrição por ciclo (42 dias)",
      "Log de carga e repetição",
      "Dashboard de evolução",
    ],
    cta: "Começar",
    featured: false,
  },
  {
    name: "Intermediário",
    price: "R$ 400",
    period: "/ mês",
    label: "Consultoria em crescimento",
    description: "Para times pequenos. Gestão de sub-treinadores e financeiro integrado.",
    features: [
      "Alunos ilimitados",
      "Gestão de equipe (sub-treinadores)",
      "Anamnese digital",
      "Agenda integrada",
      "Financeiro básico",
      "Suporte prioritário",
    ],
    cta: "Falar com vendas",
    featured: true,
  },
  {
    name: "Avançado",
    price: "R$ 799",
    period: "/ mês",
    label: "Escala & automação",
    description: "Para consultorias em escala. Cobrança e CRM no automático.",
    features: [
      "Tudo do Intermediário",
      "Integração Asaas (cobrança auto)",
      "WhatsApp CRM completo",
      "Notificações automáticas",
      "Automações por gatilho",
      "Onboarding dedicado",
    ],
    cta: "Falar com vendas",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="planos" className="border-b border-line bg-paper-warm">
      <div className="container py-20 md:py-28">
        <div className="mb-16 max-w-2xl">
          <p className="text-eyebrow mb-4">— Capítulo / 03</p>
          <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight mb-6">
            Três <em className="italic font-normal text-navy">planos</em>. Sem mais.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Você escolhe pelo tamanho da operação, não por feature que talvez use. Toda
            funcionalidade técnica está em todos os planos.
          </p>
        </div>

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
