import { describe, expect, it } from "vitest";
import { clampBenitoDragPosition, parseBenitoDragPosition } from "./useBenitoDrag";

describe("student Benito drag geometry", () => {
  it("clamps against the visual viewport and safe-area insets", () => {
    expect(clampBenitoDragPosition(
      { x: -400, y: -900 },
      { baseLeft: 300, baseTop: 700, width: 76, height: 76 },
      { left: 12, top: 24, width: 390, height: 720 },
      { top: 20, right: 8, bottom: 16, left: 8 },
    )).toEqual({ x: -280, y: -656 });
  });

  it("accepts only the versioned finite persisted position", () => {
    expect(parseBenitoDragPosition('{"version":2,"x":-120,"y":-40}')).toEqual({ x: -120, y: -40 });
    expect(parseBenitoDragPosition('{"x":-120,"y":-40}')).toBeNull();
    expect(parseBenitoDragPosition('{"version":2,"x":"oops","y":0}')).toBeNull();
    expect(parseBenitoDragPosition("not-json")).toBeNull();
  });
});
