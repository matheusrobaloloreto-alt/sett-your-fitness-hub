import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WarmupGuide } from "./WarmupGuide";

const exercises = [
  {
    exercise_id: "ex-video",
    exercise_name: "Agachamento goblet",
    muscle_group: "perna",
    video_url: "https://example.test/goblet.mp4",
    video_path: null,
    youtube_video_id: null,
    thumbnail_url: "https://example.test/goblet.jpg",
  },
  {
    exercise_id: "ex-fallback",
    exercise_name: "Remada baixa",
    muscle_group: "costa",
    video_url: null,
    video_path: null,
    youtube_video_id: null,
    thumbnail_url: null,
  },
];

describe("WarmupGuide exercise previews", () => {
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
        muscleGroups={["perna", "costa"]}
        exercises={exercises}
        open
        onOpenChange={onOpenChange}
        onVideoPlay={onVideoPlay}
      />,
    );

    expect(screen.getByRole("heading", { name: "Exercícios do treino" })).toBeInTheDocument();
    const thumbnail = screen.getByRole("img", { name: "Prévia de Agachamento goblet" });
    expect(thumbnail).toHaveAttribute("loading", "lazy");
    expect(document.querySelector("video, iframe")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Assistir demonstração de Agachamento goblet" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onVideoPlay).not.toHaveBeenCalled();
    frameCallbacks.shift()?.(0);
    expect(onVideoPlay).toHaveBeenCalledWith(exercises[0]);

    expect(screen.getByText("Vídeo ainda não vinculado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buscar demonstração de Remada baixa" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    frameCallbacks.shift()?.(16);
    expect(onVideoPlay).toHaveBeenCalledWith(exercises[1]);
  });
});
