import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("student workout video integration", () => {
  it("keeps the library YouTube id when enriching a prescribed exercise", () => {
    const source = readFileSync("src/pages/student/StudentWorkout.tsx", "utf8");
    expect(source).toContain("youtube_video_id: lib.youtube_video_id ?? null");
    expect(source).not.toContain("youtube_video_id: null,");
  });
});
