import { CalendarDays, Clock3, WalletCards } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PRE_REGISTRATION_BUDGET_LABELS,
  PRE_REGISTRATION_CONTACT_LABELS,
  preRegistrationAnswerEntries,
  type PreRegistrationData,
} from "@/lib/preRegistration";

type PreRegistrationDetailsProps = {
  data: PreRegistrationData | null;
  loading?: boolean;
  compact?: boolean;
  className?: string;
};

function formatSubmittedAt(value: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function PreRegistrationDetails({
  data,
  loading = false,
  compact = false,
  className,
}: PreRegistrationDetailsProps) {
  if (loading) {
    return (
      <div className={cn("space-y-3", className)} aria-busy="true">
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground", className)}>
        Nenhum pré-cadastro foi encontrado para esta pessoa.
      </div>
    );
  }

  const answers = preRegistrationAnswerEntries(data.answers)
    .filter((answer) => !["budget_range", "preferred_contact_period"].includes(answer.key));

  return (
    <div className={cn("space-y-4", className)}>
      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-3")}>
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
            <WalletCards className="h-3.5 w-3.5" /> Investimento
          </p>
          <p className="mt-1 font-mono-data text-sm text-foreground">
            {PRE_REGISTRATION_BUDGET_LABELS[data.budgetRange || ""] || "Não informado"}
          </p>
        </div>
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" /> Melhor contato
          </p>
          <p className="mt-1 font-mono-data text-sm text-foreground">
            {PRE_REGISTRATION_CONTACT_LABELS[data.preferredContactPeriod || ""] || "Não informado"}
          </p>
        </div>
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Recebido em
          </p>
          <p className="mt-1 font-mono-data text-sm text-foreground">{formatSubmittedAt(data.submittedAt)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">Respostas do pré-cadastro</p>
        <Badge variant="outline" className="rounded-full font-mono-data text-[10px]">
          {data.source === "lead" ? "Resposta original" : "Dados integrados"}
        </Badge>
      </div>

      {answers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          O pré-cadastro existe, mas não possui respostas estruturadas.
        </div>
      ) : (
        <dl className={cn("grid gap-2", compact ? "grid-cols-1" : "md:grid-cols-2")}>
          {answers.map((answer) => (
            <div key={answer.key} className="min-w-0 rounded-2xl border border-border bg-background/80 p-3">
              <dt className="text-eyebrow text-muted-foreground">{answer.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {answer.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
