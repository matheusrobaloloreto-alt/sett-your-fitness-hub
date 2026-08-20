/* eslint-disable react-refresh/only-export-components -- deterministic sprite contracts are intentionally co-located for consumers and tests. */

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { BrainCircuit } from "lucide-react";

export const BENITO_ATLAS_PATH = "/pets/benito-v2/spritesheet.webp";
export const BENITO_FALLBACK_LABEL = "Benito";

export const BENITO_ATLAS = {
  columns: 8,
  rows: 11,
  cellWidth: 192,
  cellHeight: 208,
  width: 1536,
  height: 2288,
} as const;

export type BenitoState =
  | "idle"
  | "greeting"
  | "running-left"
  | "running-right"
  | "waiting"
  | "processing"
  | "success"
  | "alert"
  | "error"
  | "celebration"
  | "review";

export interface BenitoAnimationConfig {
  row: number;
  frameCount: number;
  durations: readonly number[];
}

const repeatedDurations = (
  frameCount: number,
  duration: number,
  finalDuration: number,
): readonly number[] => [
  ...Array.from({ length: frameCount - 1 }, () => duration),
  finalDuration,
];

/**
 * App-facing states mapped onto the hatch-pet v2 standard animation rows.
 * Aliases intentionally share the exact row timing instead of inventing a
 * second animation contract in the product UI.
 */
export const BENITO_ANIMATIONS: Readonly<Record<BenitoState, BenitoAnimationConfig>> = {
  idle: {
    row: 0,
    frameCount: 6,
    durations: [280, 110, 110, 140, 140, 320],
  },
  "running-right": {
    row: 1,
    frameCount: 8,
    durations: repeatedDurations(8, 120, 220),
  },
  "running-left": {
    row: 2,
    frameCount: 8,
    durations: repeatedDurations(8, 120, 220),
  },
  greeting: {
    row: 3,
    frameCount: 4,
    durations: repeatedDurations(4, 140, 280),
  },
  celebration: {
    row: 4,
    frameCount: 5,
    durations: repeatedDurations(5, 140, 280),
  },
  error: {
    row: 5,
    frameCount: 8,
    durations: repeatedDurations(8, 140, 240),
  },
  alert: {
    row: 5,
    frameCount: 8,
    durations: repeatedDurations(8, 140, 240),
  },
  waiting: {
    row: 6,
    frameCount: 6,
    durations: repeatedDurations(6, 150, 260),
  },
  processing: {
    row: 7,
    frameCount: 6,
    durations: repeatedDurations(6, 120, 220),
  },
  success: {
    row: 8,
    frameCount: 6,
    durations: repeatedDurations(6, 150, 280),
  },
  review: {
    row: 8,
    frameCount: 6,
    durations: repeatedDurations(6, 150, 280),
  },
};

export interface BenitoSpriteStyleInput {
  state: BenitoState;
  frame: number;
  width: number;
}

export interface BenitoAnimationModeInput {
  paused?: boolean;
  reducedMotion?: boolean;
}

export function shouldAnimateBenito({
  paused = false,
  reducedMotion = false,
}: BenitoAnimationModeInput): boolean {
  return !paused && !reducedMotion;
}

export function getBenitoDisplayHeight(width: number): number {
  return width * (BENITO_ATLAS.cellHeight / BENITO_ATLAS.cellWidth);
}

export function getBenitoSpriteStyle({
  state,
  frame,
  width,
}: BenitoSpriteStyleInput): CSSProperties {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : BENITO_ATLAS.cellWidth;
  const height = getBenitoDisplayHeight(safeWidth);
  const animation = BENITO_ANIMATIONS[state];
  const safeFrame = Math.max(0, Math.trunc(frame)) % animation.frameCount;

  return {
    width: safeWidth,
    height,
    backgroundImage: `url("${BENITO_ATLAS_PATH}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${safeWidth * BENITO_ATLAS.columns}px ${height * BENITO_ATLAS.rows}px`,
    backgroundPosition: `${-safeFrame * safeWidth}px ${-animation.row * height}px`,
  };
}

type AtlasStatus = "idle" | "loading" | "loaded" | "error";

let atlasStatus: AtlasStatus = "idle";
let atlasRetryCount = 0;
const MAX_ATLAS_RETRIES = 2;
const atlasListeners = new Set<() => void>();

function emitAtlasStatus(): void {
  atlasListeners.forEach((listener) => listener());
}

function subscribeToAtlas(listener: () => void): () => void {
  atlasListeners.add(listener);
  return () => atlasListeners.delete(listener);
}

function getAtlasStatus(): AtlasStatus {
  return atlasStatus;
}

function getServerAtlasStatus(): AtlasStatus {
  return "loading";
}

function preloadAtlas(): void {
  if (typeof window === "undefined" || typeof window.Image === "undefined") return;
  if (atlasStatus !== "idle") return;

  atlasStatus = "loading";
  emitAtlasStatus();

  const image = new window.Image();
  image.onload = () => {
    atlasRetryCount = 0;
    atlasStatus = "loaded";
    emitAtlasStatus();
  };
  image.onerror = () => {
    atlasStatus = "error";
    emitAtlasStatus();
  };
  image.src = BENITO_ATLAS_PATH;
}

function retryAtlas(): void {
  if (atlasStatus !== "error" || atlasRetryCount >= MAX_ATLAS_RETRIES) return;
  atlasRetryCount += 1;
  atlasStatus = "idle";
  emitAtlasStatus();
  preloadAtlas();
}

function subscribeToReducedMotion(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }

  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function getReducedMotionPreference(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function useReducedMotion(override?: boolean): boolean {
  const preference = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionPreference,
    () => false,
  );
  return override ?? preference;
}

export interface BenitoSpriteProps {
  state?: BenitoState;
  /** Display width in CSS pixels. Takes precedence over `size`. */
  width?: number;
  /** Display width alias for compact call sites. */
  size?: number;
  alt?: string;
  ariaLabel?: string;
  "aria-label"?: string;
  className?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  restartOnStateChange?: boolean;
}

export function BenitoSprite({
  state = "idle",
  width,
  size = 96,
  alt,
  ariaLabel,
  "aria-label": ariaLabelAttribute,
  className,
  paused = false,
  reducedMotion,
  restartOnStateChange = true,
}: BenitoSpriteProps) {
  const displayWidth = width ?? size;
  const displayHeight = getBenitoDisplayHeight(
    Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : BENITO_ATLAS.cellWidth,
  );
  const label = ariaLabelAttribute ?? ariaLabel ?? alt ?? BENITO_FALLBACK_LABEL;
  const decorative = label === "";
  const atlas = useSyncExternalStore(
    subscribeToAtlas,
    getAtlasStatus,
    getServerAtlasStatus,
  );
  const prefersReducedMotion = useReducedMotion(reducedMotion);
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const previousStateRef = useRef(state);

  useEffect(() => {
    preloadAtlas();
  }, []);

  useEffect(() => {
    if (atlas !== "error" || atlasRetryCount >= MAX_ATLAS_RETRIES) return;
    const retryTimer = window.setTimeout(retryAtlas, 1200);
    return () => window.clearTimeout(retryTimer);
  }, [atlas]);

  useEffect(() => {
    const animation = BENITO_ANIMATIONS[state];
    const stateChanged = previousStateRef.current !== state;
    previousStateRef.current = state;

    if (stateChanged && restartOnStateChange) {
      frameRef.current = 0;
      setFrame(0);
    } else if (frameRef.current >= animation.frameCount) {
      frameRef.current %= animation.frameCount;
      setFrame(frameRef.current);
    }

    if (prefersReducedMotion) {
      frameRef.current = 0;
      setFrame(0);
      return;
    }

    if (atlas !== "loaded") return;
    if (!shouldAnimateBenito({ paused, reducedMotion: prefersReducedMotion })) return;

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextFrame = () => {
      const currentFrame = frameRef.current % animation.frameCount;
      timeout = setTimeout(() => {
        if (!active) return;
        frameRef.current = (currentFrame + 1) % animation.frameCount;
        setFrame(frameRef.current);
        scheduleNextFrame();
      }, animation.durations[currentFrame]);
    };

    scheduleNextFrame();

    return () => {
      active = false;
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, [atlas, paused, prefersReducedMotion, restartOnStateChange, state]);

  const safeDisplayWidth =
    Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : BENITO_ATLAS.cellWidth;
  const commonProps = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": label };

  return (
    <span
      {...commonProps}
      className={className}
      data-benito-state={state}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: safeDisplayWidth,
        height: displayHeight,
        overflow: "hidden",
        flex: "0 0 auto",
      }}
    >
      {atlas === "loaded" ? (
        <span
          aria-hidden="true"
          data-benito-frame={frame}
          style={{
            display: "block",
            flex: "0 0 auto",
            ...getBenitoSpriteStyle({ state, frame, width: safeDisplayWidth }),
          }}
        />
      ) : (
        <BrainCircuit
          aria-hidden="true"
          data-benito-fallback={atlas === "error" ? "error" : "loading"}
          width={safeDisplayWidth * 0.48}
          height={safeDisplayWidth * 0.48}
        />
      )}
    </span>
  );
}
