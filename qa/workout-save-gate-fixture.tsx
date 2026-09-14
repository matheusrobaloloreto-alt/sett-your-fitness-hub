/* eslint-disable react-refresh/only-export-components -- standalone Vite QA entrypoint mounts its fixture directly. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  hasBlockingSaveIssue,
  issueFromPrescriptionValidationFailure,
  issuesFromPrescriptionValidation,
  resolveWorkoutSaveDraft,
  type WorkoutSaveIssue,
  type WorkoutSaveRepair,
} from "../src/lib/workoutSaveValidation";
import "../src/index.css";

const library = [
  { id: "supino-atual", name: "Supino Inclinado com Halteres", muscle_group: "Peitoral" },
];

function Fixture() {
  const [mode, setMode] = useState<"warning" | "critical" | "remote">("warning");
  const [title, setTitle] = useState("Treino A - Empurrar");
  const [sets, setSets] = useState("25");
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<WorkoutSaveIssue[]>([]);
  const [repairs, setRepairs] = useState<WorkoutSaveRepair[]>([]);
  const [saved, setSaved] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");

  const save = async () => {
    setSaved(false);
    setIssues([]);
    setRepairs([]);
    setSaving(true);
    const draft = mode === "critical"
      ? [{
        title,
        exercises: [{ exercise_name: "Exercício importado sem vínculo", muscle_group: "Peitoral", sets: "3" }],
      }]
      : [{
        title,
        exercises: [{ exercise_id: "supino-atual", exercise_name: "Supino Inclinado com Halteres", muscle_group: "Peitoral", sets }],
      }];

    const resolved = resolveWorkoutSaveDraft({ workouts: draft, libraryExercises: library });
    setRepairs(resolved.repairs);
    if (hasBlockingSaveIssue(resolved.issues)) {
      setIssues(resolved.issues);
      setSaving(false);
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));

    if (mode === "remote") {
      setIssues([issueFromPrescriptionValidationFailure("validador indisponível")]);
      setSaving(false);
      return;
    }

    const remoteIssues = issuesFromPrescriptionValidation({
      status: "warnings",
      blockers: [],
      warnings: [{
        severity: "warning",
        code: "high_volume_quadriceps",
        source: "volume",
        message: "Quadríceps: 25 séries/semana estimadas.",
      }],
    });
    setIssues(remoteIssues);
    if (!hasBlockingSaveIssue(remoteIssues)) setSaved(true);
    setSaving(false);
  };

  const focusIssue = (issue: WorkoutSaveIssue) => {
    setLibrarySearch(issue.exerciseName || "");
    setLibraryOpen(true);
  };

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold text-primary">Prescrição de treino</h1>
      <div className="flex gap-2">
        <button className="rounded border px-3 py-2" onClick={() => setMode("warning")} disabled={saving}>Aviso de volume</button>
        <button className="rounded border px-3 py-2" onClick={() => setMode("critical")} disabled={saving}>Erro crítico</button>
        <button className="rounded border px-3 py-2" onClick={() => setMode("remote")} disabled={saving}>Falha remota</button>
        <button className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar Tudo"}
        </button>
      </div>

      <section className="rounded border p-4" data-workout-exercise-anchor="0-0">
        <label className="block text-sm font-medium">
          Título do treino
          <input className="mt-1 block w-full rounded border px-2 py-1" value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Séries
          <input className="mt-1 block w-full rounded border px-2 py-1" value={sets} onChange={(event) => setSets(event.target.value)} disabled={saving} />
        </label>
        <h2 className="font-medium">{mode === "critical" ? "Exercício importado sem vínculo" : "Supino Inclinado com Halteres"}</h2>
        <p className="text-sm text-muted-foreground">Volume alto deve ser aviso, não bloqueio estrutural.</p>
      </section>

      {(issues.length > 0 || repairs.length > 0) && (
        <aside className="rounded border border-destructive/40 bg-destructive/5 p-4" data-testid="workout-save-gate-panel">
          <h2 className="font-semibold text-primary">Salvamento do treino</h2>
          {repairs.map((repair) => <p key={repair.toExerciseId} className="text-sm">{repair.message}</p>)}
          {issues.map((issue) => (
            <div key={issue.code} className="mt-2 rounded border bg-background p-3">
              <span className="text-xs font-semibold text-destructive">Crítico</span>
              <p>{issue.message}</p>
              {issue.recommendation && <p className="text-sm text-muted-foreground">{issue.recommendation}</p>}
              <button className="mt-2 rounded border px-2 py-1 text-sm" onClick={() => focusIssue(issue)}>Corrigir</button>
            </div>
          ))}
        </aside>
      )}

      {saved && <p role="status">Treino salvo com aviso não crítico.</p>}
      {libraryOpen && (
        <div role="dialog" aria-label="Biblioteca de exercícios" className="rounded border p-4">
          <label>
            Buscar exercício
            <input className="ml-2 rounded border px-2 py-1" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} />
          </label>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
