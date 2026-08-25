import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("student workout video integration", () => {
  it("keeps the library YouTube id when enriching a prescribed exercise", () => {
    const source = readFileSync("src/pages/student/StudentWorkout.tsx", "utf8");
    expect(source).toContain("youtube_video_id: lib.youtube_video_id ?? null");
    expect(source).not.toContain("youtube_video_id: null,");
  });

  it("routes warmup previews through the canonical portal viewer and fallback", () => {
    const portal = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
    const warmup = readFileSync("src/components/student/WarmupGuide.tsx", "utf8");
    expect(portal).toContain("onVideoPlay={openVideoForExercise}");
    expect(portal.indexOf("if (ex.video_path)")).toBeLessThan(portal.indexOf("if (ex.video_url)"));
    expect(portal.indexOf("if (ex.video_url)")).toBeLessThan(portal.indexOf("if (ex.youtube_video_id)"));
    expect(portal).toContain('supabase.functions.invoke("youtube-exercise-video"');
    expect(portal).toContain('type: "unavailable"');
    expect(warmup).toContain("exerciseThumb(exercise)");
    expect(warmup).toContain('loading="lazy"');
    expect(warmup).not.toMatch(/<video|<iframe/);
  });
});
