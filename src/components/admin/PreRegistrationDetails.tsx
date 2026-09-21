import { useEffect, useState } from "react";
import { CalendarDays, Clock3, Pencil, Save, WalletCards, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  PRE_REGISTRATION_BUDGET_LABELS,
  PRE_REGISTRATION_CONTACT_LABELS,
  coerceEditedPreRegistrationValue,
  preRegistrationAnswerEntries,
  preRegistrationAnswerValue,
  updatePreRegistrationAnswer,
  type PreRegistrationAnswerEntry,
  type PreRegistrationData,
} from "@/lib/preRegistration";

type PreRegistrationDetailsProps = {
  data: PreRegistrationData | null;
  loading?: boolean;
  compact?: boolean;
  className?: string;
  onSave?: (next: PreRegistrationData) => Promise<PreRegistrationData | void>;
};

const PRIMARY_ANSWER_ORDER = [
  "objective",
  "goals",
  "training_days",
  "available_days",
  "days_available",
  "days_strength",
  "days_per_week_strength",
  "session_duration",
  "session_duration_min",
  "days_cardio",
  "days_per_week_cardio",
  "training_location",
  "current_pain",
] as const;

const PRIMARY_ANSWER_GROUPS = [
  ["objective"],
  ["goals"],
  ["training_days"],
  ["available_days", "days_available"],
  ["days_strength", "days_per_week_strength"],
  ["session_duration", "session_duration_min"],
  ["days_cardio", "days_per_week_cardio"],
  ["training_location"],
  ["current_pain", "injuries"],
] as const;

function primaryAnswerPosition(key: string) {
  const answerKey = key.split(".").pop() || key;
  return PRIMARY_ANSWER_ORDER.indexOf(answerKey as (typeof PRIMARY_ANSWER_ORDER)[number]);
}

function primaryAnswerGroup(key: string) {
  const answerKey = key.split(".").pop() || key;
  return PRIMARY_ANSWER_GROUPS.findIndex((group) => group.some((candidate) => candidate === answerKey));
}

function formatSubmittedAt(value: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function editableValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

export function PreRegistrationDetails({
  data,
  loading = false,
  compact = false,
  className,
  onSave,
}: PreRegistrationDetailsProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>({});
  const [draftBudget, setDraftBudget] = useState<string | null>(null);
  const [draftContact, setDraftContact] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    setDraftAnswers(data?.answers || {});
    setDraftBudget(data?.budgetRange || null);
    setDraftContact(data?.preferredContactPeriod || null);
    setNotesDraft(data?.manualNotes || "");
    setEditing(false);
  }, [data]);

  if (loading) {
    return (
      <div className={cn("space-y-3", className)} aria-busy="true">
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn("rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground", className)}>
        Nenhum pré-cadastro foi encontrado para esta pessoa.
      </div>
    );
  }

  const canEdit = Boolean(onSave && data.recordId);
  const answers = preRegistrationAnswerEntries(data.answers)
    .filter((answer) => !["budget_range", "preferred_contact_period", "notes"].includes(answer.key.split(".").pop() || answer.key));
  const primaryAnswers = PRIMARY_ANSWER_GROUPS.flatMap((_, groupIndex) => {
    const candidates = answers
      .filter((answer) => primaryAnswerGroup(answer.key) === groupIndex)
      .sort((left, right) => primaryAnswerPosition(left.key) - primaryAnswerPosition(right.key));
    return candidates.slice(0, 1);
  });
  const primaryKeys = new Set(primaryAnswers.map((answer) => answer.key));
  const selectedPrimaryGroups = new Set(primaryAnswers.map((answer) => primaryAnswerGroup(answer.key)));
  const additionalAnswers = answers.filter((answer) => (
    !primaryKeys.has(answer.key) && !selectedPrimaryGroups.has(primaryAnswerGroup(answer.key))
  ));
  const notesChanged = notesDraft.trim() !== (data.manualNotes || "").trim();

  const persist = async (next: PreRegistrationData, successTitle: string) => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(next);
      toast({ title: successTitle, description: "As informações já estão disponíveis no atendimento e na prescrição." });
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async () => {
    try {
      await persist({ ...data, manualNotes: notesDraft }, "Notas atualizadas");
    } catch {
      // O toast de erro é emitido por persist.
    }
  };

  const saveAll = async () => {
    try {
      await persist({
        ...data,
        answers: draftAnswers,
        budgetRange: draftBudget,
        preferredContactPeriod: draftContact,
        manualNotes: notesDraft,
      }, "Anamnese atualizada");
      setEditing(false);
    } catch {
      // Mantém o formulário aberto para correção/tentativa posterior.
    }
  };

  const renderEditor = (answer: PreRegistrationAnswerEntry) => {
    const currentValue = preRegistrationAnswerValue(draftAnswers, answer.key);
    if (typeof answer.rawValue === "boolean") {
      return (
        <select
          value={currentValue ? "true" : "false"}
          onChange={(event) => setDraftAnswers((current) => updatePreRegistrationAnswer(current, answer.key, event.target.value === "true"))}
          className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          aria-label={`Editar ${answer.label}`}
        >
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      );
    }
    if (typeof answer.rawValue === "number") {
      return (
        <Input
          type="number"
          value={currentValue === null || currentValue === undefined ? "" : String(currentValue)}
          onChange={(event) => setDraftAnswers((current) => updatePreRegistrationAnswer(
            current,
            answer.key,
            coerceEditedPreRegistrationValue(answer.rawValue, event.target.value),
          ))}
          className="mt-2 h-9"
          aria-label={`Editar ${answer.label}`}
        />
      );
    }
    return (
      <Textarea
        value={editableValue(currentValue)}
        onChange={(event) => setDraftAnswers((current) => updatePreRegistrationAnswer(
          current,
          answer.key,
          coerceEditedPreRegistrationValue(answer.rawValue, event.target.value),
        ))}
        className="mt-2 min-h-16 resize-y text-sm"
        aria-label={`Editar ${answer.label}`}
      />
    );
  };

  const renderAnswers = (items: typeof answers, emphasized = false) => (
    <dl className={cn("grid gap-2", compact ? "grid-cols-1" : "md:grid-cols-2")}>
      {items.map((answer) => (
        <div
          key={answer.key}
          className={cn(
            "min-w-0 rounded-xl border p-3",
            emphasized ? "border-primary/20 bg-primary/[0.06]" : "border-border bg-background/80",
          )}
        >
          <dt className="text-eyebrow text-muted-foreground">{answer.label}</dt>
          {editing ? renderEditor(answer) : (
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {answer.value}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn(
        "grid gap-2",
        compact ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-[0.8fr_0.8fr_0.9fr_1.5fr]",
      )}>
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
          <p className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
            <WalletCards className="h-3.5 w-3.5" /> Investimento
          </p>
          {editing ? (
            <select
              value={draftBudget || ""}
              onChange={(event) => setDraftBudget(event.target.value || null)}
              className="mt-1.5 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
              aria-label="Editar investimento"
            >
              <option value="">Não informado</option>
              {Object.entries(PRE_REGISTRATION_BUDGET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : (
            <p className="mt-1 font-mono-data text-xs text-foreground">
              {PRE_REGISTRATION_BUDGET_LABELS[data.budgetRange || ""] || "Não informado"}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
          <p className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" /> Melhor contato
          </p>
          {editing ? (
            <select
              value={draftContact || ""}
              onChange={(event) => setDraftContact(event.target.value || null)}
              className="mt-1.5 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
              aria-label="Editar melhor horário para contato"
            >
              <option value="">Não informado</option>
              {Object.entries(PRE_REGISTRATION_CONTACT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : (
            <p className="mt-1 font-mono-data text-xs text-foreground">
              {PRE_REGISTRATION_CONTACT_LABELS[data.preferredContactPeriod || ""] || "Não informado"}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
          <p className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Recebido em
          </p>
          <p className="mt-1 font-mono-data text-xs text-foreground">{formatSubmittedAt(data.submittedAt)}</p>
        </div>
        <div className={cn("rounded-xl border border-primary/15 bg-primary/5 p-2.5", compact && "col-span-2")}>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`student-notes-${data.recordId}`} className="text-eyebrow text-muted-foreground">Notas</label>
            {canEdit && notesChanged && !editing && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={saveNotes} disabled={saving}>
                <Save className="mr-1 h-3.5 w-3.5" />Salvar
              </Button>
            )}
          </div>
          <Textarea
            id={`student-notes-${data.recordId}`}
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            placeholder="Anotações internas sobre o aluno..."
            disabled={!canEdit || saving}
            className="mt-1 min-h-12 resize-y bg-background/80 text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">Principais informações</p>
          <Badge variant="outline" className="rounded-full font-mono-data text-[10px]">
            {data.source === "lead" ? "Resposta original" : "Dados integrados"}
          </Badge>
        </div>
        {canEdit && (
          editing ? (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => {
                setDraftAnswers(data.answers);
                setDraftBudget(data.budgetRange);
                setDraftContact(data.preferredContactPeriod);
                setNotesDraft(data.manualNotes || "");
                setEditing(false);
              }} disabled={saving}>
                <X className="mr-1.5 h-4 w-4" />Cancelar
              </Button>
              <Button type="button" size="sm" onClick={saveAll} disabled={saving}>
                <Save className="mr-1.5 h-4 w-4" />{saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-4 w-4" />Editar anamnese
            </Button>
          )
        )}
      </div>

      {answers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          O pré-cadastro existe, mas não possui respostas estruturadas.
        </div>
      ) : (
        <>
          {primaryAnswers.length > 0 ? renderAnswers(primaryAnswers, true) : renderAnswers(answers)}
          {primaryAnswers.length > 0 && additionalAnswers.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="font-medium text-foreground">Demais respostas</p>
              {renderAnswers(additionalAnswers)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
