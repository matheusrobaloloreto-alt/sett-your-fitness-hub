import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WarmupGuide } from "./WarmupGuide";

const exercises = [
  {
    exercise_id: "ex-video",
    exercise_name: "Agachamento livre (air squat)",
    muscle_group: "perna",
    video_url: "https://example.test/goblet.mp4",
    video_path: null,
    youtube_video_id: null,
    thumbnail_url: "https://example.test/goblet.jpg",
  },
  {
    exercise_id: "ex-fallback",
    exercise_name: "Mobilidade de Tornozelo",
    muscle_group: "perna",
    video_url: null,
    video_path: null,
    youtube_video_id: null,
    thumbnail_url: null,
  },
];

describe("WarmupGuide exercise previews", () => {
  it("maps checklist warmup items to safe library previews without showing main workout exercises", () => {
    render(
      <WarmupGuide
        muscleGroups={["perna"]}
        libraryExercises={[
          {
            exercise_id: "warmup-air-squat",
            exercise_name: "Agachamento livre (air squat)",
            muscle_group: "perna",
            video_url: "https://example.test/air-squat.mp4",
            video_path: null,
            youtube_video_id: null,
            thumbnail_url: "https://example.test/air-squat.jpg",
          },
          {
            exercise_id: "main-leg-press",
            exercise_name: "Leg press 45",
            muscle_group: "perna",
            video_url: "https://example.test/leg-press.mp4",
            video_path: null,
            youtube_video_id: null,
            thumbnail_url: "https://example.test/leg-press.jpg",
          },
          {
            exercise_id: "main-extensora",
            exercise_name: "Cadeira extensora",
            muscle_group: "quadríceps",
            video_url: "https://example.test/extensora.mp4",
            video_path: null,
            youtube_video_id: null,
            thumbnail_url: "https://example.test/extensora.jpg",
          },
        ]}
        open
        onOpenChange={vi.fn()}
        onVideoPlay={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Demonstrações do aquecimento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assistir demonstração de Agachamento livre (air squat)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Leg press 45/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cadeira extensora/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("5 min de esteira/bike em ritmo leve").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vídeo indisponível para este item").length).toBeGreaterThan(0);
  });

  it("shows a lazy actionable preview for every exercise without mounting any player", () => {
    const onVideoPlay = vi.fn();
    const onOpenChange = vi.fn();
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    render(
      <WarmupGuide
        muscleGroups={["perna"]}
        libraryExercises={exercises}
        open
        onOpenChange={onOpenChange}
        onVideoPlay={onVideoPlay}
      />,
    );

    expect(screen.getByRole("heading", { name: "Demonstrações do aquecimento" })).toBeInTheDocument();
    const thumbnail = screen.getByRole("img", { name: "Prévia de Agachamento livre (air squat)" });
    expect(thumbnail).toHaveAttribute("loading", "lazy");
    expect(document.querySelector("video, iframe")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Assistir demonstração de Agachamento livre (air squat)" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onVideoPlay).not.toHaveBeenCalled();
    frameCallbacks.shift()?.(0);
    expect(onVideoPlay).toHaveBeenCalledWith(exercises[0]);

    expect(screen.getByText("Vídeo ainda não vinculado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buscar demonstração de Mobilidade de Tornozelo" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    frameCallbacks.shift()?.(16);
    expect(onVideoPlay).toHaveBeenCalledWith(exercises[1]);
  });

  it("uses a preferred unique warmup match when the generic library name is duplicated", () => {
    render(
      <WarmupGuide
        muscleGroups={["core"]}
        libraryExercises={[
          {
            exercise_id: "dead-bug-1",
            exercise_name: "Dead bug",
            muscle_group: "core",
            video_url: "https://example.test/dead-bug-1.mp4",
          },
          {
            exercise_id: "dead-bug-2",
            exercise_name: "Dead bug",
            muscle_group: "core",
            video_url: "https://example.test/dead-bug-2.mp4",
          },
          {
            exercise_id: "dead-bug-activation",
            exercise_name: "Dead bug de ativação",
            muscle_group: "core",
            video_url: "https://example.test/dead-bug-activation.mp4",
          },
        ]}
        open
        onOpenChange={vi.fn()}
        onVideoPlay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Assistir demonstração de Dead bug de ativação" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assistir demonstração de Dead bug" })).not.toBeInTheDocument();
  });

  it("matches accented checklist labels against the normalized allowlist", () => {
    render(
      <WarmupGuide
        muscleGroups={["peito"]}
        libraryExercises={[
          {
            exercise_id: "pushup",
            exercise_name: "Flexão de braço",
            muscle_group: "peito",
            video_url: "https://example.test/flexao.mp4",
          },
        ]}
        open
        onOpenChange={vi.fn()}
        onVideoPlay={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Assistir demonstração de Flexão de braço" })).toBeInTheDocument();
  });
});
