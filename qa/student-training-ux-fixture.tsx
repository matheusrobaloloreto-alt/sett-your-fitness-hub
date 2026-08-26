import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Dumbbell, LogOut, Megaphone, Play } from "lucide-react";
import { EditorialPageHeader } from "../src/components/EditorialPageHeader";
import { Button } from "../src/components/ui/button";
import { WarmupGuide, type WarmupExercise } from "../src/components/student/WarmupGuide";
import { StudentMethodGroup } from "../src/components/student/StudentMethodGroup";
import { BenitoSprite } from "../src/components/BenitoSprite";
import { useBenitoDrag } from "../src/lib/useBenitoDrag";
import "../src/index.css";

const workoutExercises: WarmupExercise[] = [
  { exercise_id: "squat", exercise_name: "Agachamento goblet", muscle_group: "perna", video_url: "https://example.test/goblet.mp4" },
  { exercise_id: "row", exercise_name: "Remada baixa", muscle_group: "costa", video_url: "https://example.test/remada.mp4" },
  { exercise_id: "press", exercise_name: "Supino com halteres", muscle_group: "peito" },
];

const warmupLibraryExercises: WarmupExercise[] = [
  { exercise_id: "air-squat", exercise_name: "Agachamento livre (air squat)", muscle_group: "perna", video_url: "https://example.test/air-squat.mp4" },
  { exercise_id: "cat-camel", exercise_name: "Cat-camel (gato-camelo)", muscle_group: "costa", video_url: "https://example.test/cat-camel.mp4" },
  { exercise_id: "flexao", exercise_name: "Flexão de braço", muscle_group: "peito", video_url: "https://example.test/flexao.mp4" },
];

function Fixture() {
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const { position, direction, isDragging, suspendTransition, attachDragTarget, startDrag, consumeDragGesture } = useBenitoDrag();

  return (
    <main className="min-h-[120vh] bg-background">
      <EditorialPageHeader
        compactMobile
        className="bg-card sm:px-6"
        innerClassName="mx-auto max-w-2xl"
        overline="Portal do aluno"
        title="MEU TREINO"
        titleClassName="text-xl text-primary sm:text-2xl"
        leading={<span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10"><Dumbbell className="h-5 w-5 text-primary" /></span>}
        context={<span className="text-foreground">Matheus Loreto Teste de Nome Completo</span>}
        actions={(
          <>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Avisos" title="Avisos"><Megaphone className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Sair" title="Sair"><LogOut className="h-4 w-4" /></Button>
          </>
        )}
      />

      <section className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:px-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Treino B · Semana 3</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div><h2 className="font-display text-xl text-foreground">Força de membros inferiores</h2><p className="text-xs text-muted-foreground">3 blocos · 7 exercícios</p></div>
            <Button size="sm" variant="outline" onClick={() => setWarmupOpen(true)}>Prepare-se</Button>
          </div>
        </div>

        <StudentMethodGroup
          blockName="Bloco 1"
          method="biset"
          instruction="Faça a dupla sem descanso; recupere ao final do bloco."
          summary="2 exercícios em sequência"
          defaultOpen
        >
          {["Agachamento goblet", "Remada baixa"].map((name, index) => (
            <div key={name} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{name}</span><span className="text-xs text-muted-foreground">3 × 10 · 60s</span></span>
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md text-primary" aria-label={`Ver vídeo de ${name}`}><Play className="h-4 w-4" /></button>
              {index === 0 && <input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} aria-label="Concluir primeira série" className="h-5 w-5" />}
            </div>
          ))}
        </StudentMethodGroup>

        <StudentMethodGroup blockName="Bloco 2" method="circuito" instruction="Passe pelas três estações e descanse ao fim da volta." summary="×3 voltas">
          <p>Conteúdo do circuito</p>
        </StudentMethodGroup>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">Levantamento terra romeno</p>
          <p className="text-xs text-muted-foreground">Série normal · 3 × 8 · 90s</p>
        </div>
        {selectedVideo && <p role="status" className="text-xs text-muted-foreground">Demonstração selecionada: {selectedVideo}</p>}
      </section>

      <button
        ref={attachDragTarget}
        type="button"
        aria-label="Abrir Benito"
        data-benito-fab="student"
        style={{ transform: `translate(${position.x}px, ${position.y}px)`, touchAction: "none", transition: suspendTransition ? "none" : undefined }}
        onPointerDown={startDrag}
        onClick={() => { if (!consumeDragGesture()) setSelectedVideo("Benito aberto"); }}
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] right-[calc(1.25rem+env(safe-area-inset-right,0px))] z-40 flex h-[76px] w-[76px] items-center justify-center outline-none"
      >
        <BenitoSprite state={direction ?? (isDragging ? "running-left" : "idle")} size={60} alt="" className="benito-sprite-prominent" />
      </button>

      <WarmupGuide muscleGroups={workoutExercises.map((exercise) => exercise.muscle_group)} libraryExercises={warmupLibraryExercises} open={warmupOpen} onOpenChange={setWarmupOpen} onVideoPlay={(exercise) => setSelectedVideo(exercise.exercise_name)} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
