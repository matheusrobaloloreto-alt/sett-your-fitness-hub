import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BENITO_ANIMATIONS,
  BENITO_ATLAS,
  BENITO_ATLAS_PATH,
  BenitoSprite,
  getBenitoDisplayHeight,
  getBenitoSpriteStyle,
  shouldAnimateBenito,
  type BenitoState,
} from "./BenitoSprite";

describe("BENITO_ANIMATIONS", () => {
  it("maps product states to the exact hatch-pet standard rows", () => {
    const expectedRows: Record<BenitoState, number> = {
      idle: 0,
      "running-right": 1,
      "running-left": 2,
      greeting: 3,
      celebration: 4,
      alert: 5,
      error: 5,
      waiting: 6,
      processing: 7,
      success: 8,
      review: 8,
    };

    for (const [state, row] of Object.entries(expectedRows)) {
      expect(BENITO_ANIMATIONS[state as BenitoState].row).toBe(row);
    }
  });

  it("uses the exact v2 frame counts and per-frame durations", () => {
    expect(
      Object.fromEntries(
        Object.entries(BENITO_ANIMATIONS).map(([state, animation]) => [
          state,
          animation.frameCount,
        ]),
      ),
    ).toEqual({
      idle: 6,
      "running-right": 8,
      "running-left": 8,
      greeting: 4,
      celebration: 5,
      alert: 8,
      error: 8,
      waiting: 6,
      processing: 6,
      success: 6,
      review: 6,
    });

    expect(BENITO_ANIMATIONS.idle).toMatchObject({
      frameCount: 6,
      durations: [280, 110, 110, 140, 140, 320],
    });
    expect(BENITO_ANIMATIONS["running-right"].durations).toEqual([
      120, 120, 120, 120, 120, 120, 120, 220,
    ]);
    expect(BENITO_ANIMATIONS["running-left"].durations).toEqual([
      120, 120, 120, 120, 120, 120, 120, 220,
    ]);
    expect(BENITO_ANIMATIONS.greeting.durations).toEqual([140, 140, 140, 280]);
    expect(BENITO_ANIMATIONS.celebration.durations).toEqual([140, 140, 140, 140, 280]);
    expect(BENITO_ANIMATIONS.error.durations).toEqual([
      140, 140, 140, 140, 140, 140, 140, 240,
    ]);
    expect(BENITO_ANIMATIONS.waiting.durations).toEqual([150, 150, 150, 150, 150, 260]);
    expect(BENITO_ANIMATIONS.processing.durations).toEqual([120, 120, 120, 120, 120, 220]);
    expect(BENITO_ANIMATIONS.success.durations).toEqual([150, 150, 150, 150, 150, 280]);
  });
});

describe("getBenitoSpriteStyle", () => {
  it("scales the full atlas and offsets exact cells at half-native size", () => {
    const style = getBenitoSpriteStyle({ state: "running-left", frame: 3, width: 96 });

    expect(getBenitoDisplayHeight(96)).toBe(104);
    expect(style).toMatchObject({
      width: 96,
      height: 104,
      backgroundImage: `url("${BENITO_ATLAS_PATH}")`,
      backgroundSize: "768px 1144px",
      backgroundPosition: "-288px -208px",
    });
  });

  it("matches native atlas dimensions and wraps frames safely", () => {
    const style = getBenitoSpriteStyle({ state: "success", frame: 13, width: 192 });

    expect(BENITO_ATLAS).toMatchObject({ width: 1536, height: 2288 });
    expect(style).toMatchObject({
      width: 192,
      height: 208,
      backgroundSize: "1536px 2288px",
      backgroundPosition: "-192px -1664px",
    });
  });
});

describe("animation and fallback contracts", () => {
  it("disables animation when paused or reduced motion is requested", () => {
    expect(shouldAnimateBenito({})).toBe(true);
    expect(shouldAnimateBenito({ paused: true })).toBe(false);
    expect(shouldAnimateBenito({ reducedMotion: true })).toBe(false);
  });

  it("renders an accessible BrainCircuit fallback without decoding the atlas", () => {
    const { container } = render(
      <BenitoSprite state="greeting" width={80} alt="Benito saudando" />,
    );

    expect(screen.getByRole("img", { name: "Benito saudando" })).toBeInTheDocument();
    expect(container.querySelector("svg[data-benito-fallback]")).toBeInTheDocument();
  });

  it("supports decorative sprites through an empty alt", () => {
    const { container } = render(<BenitoSprite alt="" paused />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg[data-benito-fallback]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
