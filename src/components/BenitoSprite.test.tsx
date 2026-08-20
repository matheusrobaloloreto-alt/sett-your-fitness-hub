import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BENITO_ANIMATIONS,
  BENITO_ATLAS,
  BENITO_ATLAS_PATH,
  BENITO_COMPACT_ATLAS_PATH,
  BenitoSprite,
  getBenitoAtlasPath,
  getBenitoDisplayHeight,
  getBenitoFrameAtElapsedTime,
  getBenitoSpriteStyle,
  resetBenitoRuntimeForTests,
  shouldAnimateBenito,
  type BenitoState,
} from "./BenitoSprite";

class MockImage {
  static instances: MockImage[] = [];

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";

  constructor() {
    MockImage.instances.push(this);
  }
}

const RealImage = window.Image;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
  MockImage.instances = [];
  resetBenitoRuntimeForTests();
  Object.defineProperty(window, "Image", {
    configurable: true,
    writable: true,
    value: MockImage,
  });
});

afterEach(() => {
  cleanup();
  resetBenitoRuntimeForTests();
  Object.defineProperty(window, "Image", {
    configurable: true,
    writable: true,
    value: RealImage,
  });
  vi.useRealTimers();
});

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

  it("selects the compact atlas for 16–48px placements", () => {
    expect(getBenitoAtlasPath(16)).toBe(BENITO_COMPACT_ATLAS_PATH);
    expect(getBenitoAtlasPath(42)).toBe(BENITO_COMPACT_ATLAS_PATH);
    expect(getBenitoAtlasPath(48)).toBe(BENITO_COMPACT_ATLAS_PATH);
    expect(getBenitoAtlasPath(49)).toBe(BENITO_ATLAS_PATH);

    expect(getBenitoSpriteStyle({ state: "waiting", frame: 2, width: 42 })).toMatchObject({
      backgroundImage: `url("${BENITO_COMPACT_ATLAS_PATH}")`,
      backgroundSize: "336px 500.5px",
      backgroundPosition: "-84px -273px",
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

  it("switches from loading fallback to the decoded compact atlas on load", () => {
    const { container } = render(
      <BenitoSprite state="greeting" width={42} alt="Benito saudando" />,
    );

    expect(MockImage.instances).toHaveLength(1);
    expect(MockImage.instances[0].src).toBe(BENITO_COMPACT_ATLAS_PATH);
    expect(container.querySelector('[data-benito-fallback="loading"]')).toBeInTheDocument();

    act(() => MockImage.instances[0].onload?.());

    expect(container.querySelector("[data-benito-fallback]")).not.toBeInTheDocument();
    expect(container.querySelector('[data-benito-frame="0"]')).toBeInTheDocument();
  });

  it("uses one shared timer for multiple animated sprites", () => {
    const { container } = render(
      <>
        <BenitoSprite state="greeting" width={42} alt="Benito um" />
        <BenitoSprite state="greeting" width={42} alt="Benito dois" />
      </>,
    );

    expect(MockImage.instances).toHaveLength(1);
    act(() => MockImage.instances[0].onload?.());
    expect(vi.getTimerCount()).toBe(1);

    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelectorAll('[data-benito-frame="2"]')).toHaveLength(2);
  });

  it("keeps 16px and 28px secondary icons static without a clock", () => {
    const { container } = render(
      <>
        <BenitoSprite state="processing" width={16} alt="Benito pequeno" />
        <BenitoSprite state="alert" width={28} alt="Benito alerta" />
      </>,
    );

    act(() => MockImage.instances[0].onload?.());

    expect(container.querySelectorAll('[data-benito-frame="0"]')).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts at frame zero when the state changes", () => {
    const { container, rerender } = render(
      <BenitoSprite state="greeting" width={42} alt="Benito" />,
    );
    act(() => MockImage.instances[0].onload?.());
    act(() => vi.advanceTimersByTime(200));
    expect(container.querySelector('[data-benito-frame="1"]')).toBeInTheDocument();

    rerender(<BenitoSprite state="success" width={42} alt="Benito" />);
    expect(container.querySelector('[data-benito-frame="0"]')).toBeInTheDocument();
  });

  it("retries atlas errors twice and then keeps an explicit error fallback", () => {
    const { container } = render(
      <BenitoSprite state="idle" width={42} alt="Benito" />,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      act(() => MockImage.instances[attempt].onerror?.());
      if (attempt < 2) {
        act(() => vi.advanceTimersByTime(1200));
      }
    }

    expect(MockImage.instances).toHaveLength(3);
    expect(container.querySelector('[data-benito-fallback="error"]')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("calculates variable-duration frames deterministically", () => {
    expect(getBenitoFrameAtElapsedTime("greeting", 0)).toBe(0);
    expect(getBenitoFrameAtElapsedTime("greeting", 139)).toBe(0);
    expect(getBenitoFrameAtElapsedTime("greeting", 140)).toBe(1);
    expect(getBenitoFrameAtElapsedTime("greeting", 420)).toBe(3);
    expect(getBenitoFrameAtElapsedTime("greeting", 700)).toBe(0);
  });
});
