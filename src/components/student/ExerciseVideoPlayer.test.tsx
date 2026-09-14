import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExerciseVideoPlayer } from "./ExerciseVideoPlayer";
import {
  buildYouTubeEmbedUrl,
  buildYouTubeSearchUrl,
  youtubeIdFromVideoValue,
} from "@/lib/exerciseVideoPlayer";

describe("ExerciseVideoPlayer", () => {
  it("builds privacy-preserving muted inline YouTube loop URLs", () => {
    const src = buildYouTubeEmbedUrl("A3YYT8wvxHs");
    const url = new URL(src);

    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/A3YYT8wvxHs");
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("mute")).toBe("1");
    expect(url.searchParams.get("loop")).toBe("1");
    expect(url.searchParams.get("playlist")).toBe("A3YYT8wvxHs");
    expect(url.searchParams.get("playsinline")).toBe("1");
    expect(url.searchParams.get("rel")).toBe("0");
  });

  it("extracts YouTube IDs from supported values", () => {
    expect(youtubeIdFromVideoValue("A3YYT8wvxHs")).toBe("A3YYT8wvxHs");
    expect(youtubeIdFromVideoValue("https://www.youtube.com/watch?v=A3YYT8wvxHs&t=20")).toBe("A3YYT8wvxHs");
    expect(youtubeIdFromVideoValue("https://www.youtube.com/embed/A3YYT8wvxHs")).toBe("A3YYT8wvxHs");
    expect(youtubeIdFromVideoValue("https://youtu.be/A3YYT8wvxHs")).toBe("A3YYT8wvxHs");
    expect(youtubeIdFromVideoValue("https://cdn.sett.test/video.mp4")).toBeNull();
  });

  it("uses native silent looping inline playback for own video files", () => {
    render(<ExerciseVideoPlayer video={{ type: "path", value: "https://cdn.sett.test/demo.mp4", title: "Demo" }} />);

    const video = document.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("src", "https://cdn.sett.test/demo.mp4");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video?.muted).toBe(true);
  });

  it("keeps YouTube fallback inside SETT instead of linking to the YouTube app", () => {
    render(<ExerciseVideoPlayer video={{ type: "url", value: "https://www.youtube.com/watch?v=A3YYT8wvxHs", title: "Demo" }} />);

    const frame = screen.getByTitle("Demonstração do exercício");
    expect(frame).toHaveAttribute("src", expect.stringContaining("https://www.youtube-nocookie.com/embed/A3YYT8wvxHs"));
    expect(frame).toHaveAttribute("src", expect.stringContaining("playlist=A3YYT8wvxHs"));
    expect(screen.queryByRole("link", { name: /abrir|buscar/i })).not.toBeInTheDocument();
  });

  it("exposes external search only as a secondary explicit action when unavailable", () => {
    const searchUrl = buildYouTubeSearchUrl("Agachamento");
    render(<ExerciseVideoPlayer video={{ type: "unavailable", value: searchUrl, title: "Agachamento" }} />);

    expect(screen.getByText("Vídeo ainda não disponível no catálogo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /buscar demonstração no youtube/i })).toHaveAttribute("href", searchUrl);
  });
});
