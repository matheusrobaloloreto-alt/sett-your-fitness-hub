import { describe, it, expect } from "vitest";
import { exerciseThumb, youtubeIdFromUrl } from "./exerciseCover";

describe("exerciseThumb — a capa sempre representa o vídeo que vai tocar", () => {
  it("exercício MFIT: usa a capa oficial (.jpg do próprio .mp4), NÃO a thumb do YouTube", () => {
    // Caso real: o importador do MFIT grava o poster correspondente ao vídeo,
    // mas o youtube_video_id foi resolvido pelo NOME e aponta para outro vídeo.
    const cover = exerciseThumb({
      video_url: "https://d2vfutiy2j6sqj.cloudfront.net/115171/mp4/gapun2d27mv_opt.mp4",
      thumbnail_url: "https://d2vfutiy2j6sqj.cloudfront.net/115171/jpg/md/gapun2d2.jpg",
      youtube_video_id: "Y_yWx7SwSXY",
    });
    expect(cover).toBe("https://d2vfutiy2j6sqj.cloudfront.net/115171/jpg/md/gapun2d2.jpg");
  });

  it("vídeo próprio SEM capa cadastrada: não inventa thumb do YouTube", () => {
    expect(exerciseThumb({
      video_url: "https://cdn.exemplo.com/video.mp4",
      youtube_video_id: "Y_yWx7SwSXY",
    })).toBeNull();
    expect(exerciseThumb({
      video_path: "exercicios/meu-video.mp4",
      youtube_video_id: "Y_yWx7SwSXY",
    })).toBeNull();
  });

  it("quando o vídeo que toca É do YouTube, usa a thumb dele", () => {
    expect(exerciseThumb({ video_url: "https://www.youtube.com/watch?v=A3YYT8wvxHs" }))
      .toBe("https://i.ytimg.com/vi/A3YYT8wvxHs/hqdefault.jpg");
  });

  it("sem vídeo próprio: o youtube_video_id É o vídeo, então a thumb dele vale", () => {
    expect(exerciseThumb({ youtube_video_id: "A3YYT8wvxHs" }))
      .toBe("https://i.ytimg.com/vi/A3YYT8wvxHs/hqdefault.jpg");
  });

  it("sem nada: sem capa", () => {
    expect(exerciseThumb({})).toBeNull();
  });
});

describe("youtubeIdFromUrl", () => {
  it("extrai o id de watch, embed e youtu.be", () => {
    expect(youtubeIdFromUrl("https://www.youtube.com/watch?v=A3YYT8wvxHs")).toBe("A3YYT8wvxHs");
    expect(youtubeIdFromUrl("https://www.youtube.com/embed/A3YYT8wvxHs")).toBe("A3YYT8wvxHs");
    expect(youtubeIdFromUrl("https://youtu.be/A3YYT8wvxHs")).toBe("A3YYT8wvxHs");
    expect(youtubeIdFromUrl("https://cdn.exemplo.com/video.mp4")).toBeNull();
  });
});
