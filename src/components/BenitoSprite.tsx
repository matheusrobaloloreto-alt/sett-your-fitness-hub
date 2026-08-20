/* eslint-disable react-refresh/only-export-components -- deterministic sprite contracts are intentionally co-located for consumers and tests. */

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { BrainCircuit } from "lucide-react";

export const BENITO_ATLAS_PATH = "/pets/benito-v2/spritesheet.webp";
export const BENITO_COMPACT_ATLAS_PATH = "/pets/benito-v2/spritesheet-compact.webp";
export const BENITO_FALLBACK_LABEL = "Benito";
export const BENITO_COMPACT_MAX_WIDTH = 48;
export const BENITO_STATIC_ICON_MAX_WIDTH = 28;

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

export function getBenitoAtlasPath(width: number): string {
  return width <= BENITO_COMPACT_MAX_WIDTH
    ? BENITO_COMPACT_ATLAS_PATH
    : BENITO_ATLAS_PATH;
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
  const atlasPath = getBenitoAtlasPath(safeWidth);

  return {
    width: safeWidth,
    height,
    backgroundImage: `url("${atlasPath}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${safeWidth * BENITO_ATLAS.columns}px ${height * BENITO_ATLAS.rows}px`,
    backgroundPosition: `${-safeFrame * safeWidth}px ${-animation.row * height}px`,
  };
}

type AtlasStatus = "idle" | "loading" | "loaded" | "error";

const MAX_ATLAS_RETRIES = 2;
const atlasListeners = new Set<() => void>();
const atlasStatuses = new Map<string, AtlasStatus>();
const atlasRetryCounts = new Map<string, number>();

function emitAtlasStatus(): void {
  atlasListeners.forEach((listener) => listener());
}

function subscribeToAtlas(listener: () => void): () => void {
  atlasListeners.add(listener);
  return () => atlasListeners.delete(listener);
}

function getAtlasStatus(path: string): AtlasStatus {
  return atlasStatuses.get(path) ?? "idle";
}

function getServerAtlasStatus(): AtlasStatus {
  return "loading";
}

function preloadAtlas(path: string): void {
  if (typeof window === "undefined" || typeof window.Image === "undefined") return;
  if (getAtlasStatus(path) !== "idle") return;

  atlasStatuses.set(path, "loading");
  emitAtlasStatus();

  const image = new window.Image();
  image.onload = () => {
    atlasRetryCounts.set(path, 0);
    atlasStatuses.set(path, "loaded");
    emitAtlasStatus();
  };
  image.onerror = () => {
    atlasStatuses.set(path, "error");
    emitAtlasStatus();
  };
  image.src = path;
}

function retryAtlas(path: string): void {
  const retryCount = atlasRetryCounts.get(path) ?? 0;
  if (getAtlasStatus(path) !== "error" || retryCount >= MAX_ATLAS_RETRIES) return;
  atlasRetryCounts.set(path, retryCount + 1);
  atlasStatuses.set(path, "idle");
  emitAtlasStatus();
  preloadAtlas(path);
}

const FRAME_CLOCK_INTERVAL_MS = 100;
const frameClockListeners = new Set<() => void>();
let frameClockNow = Date.now();
let frameClockTimer: ReturnType<typeof setTimeout> | undefined;

function stopFrameClock(): void {
  if (frameClockTimer !== undefined) clearTimeout(frameClockTimer);
  frameClockTimer = undefined;
}

function scheduleFrameClock(): void {
  if (frameClockTimer !== undefined || frameClockListeners.size === 0) return;
  frameClockTimer = setTimeout(() => {
    frameClockTimer = undefined;
    frameClockNow = Date.now();
    frameClockListeners.forEach((listener) => listener());
    scheduleFrameClock();
  }, FRAME_CLOCK_INTERVAL_MS);
}

function subscribeToFrameClock(listener: () => void): () => void {
  frameClockListeners.add(listener);
  scheduleFrameClock();
  return () => {
    frameClockListeners.delete(listener);
    if (frameClockListeners.size === 0) stopFrameClock();
  };
}

function getFrameClockSnapshot(): number {
  return frameClockNow;
}

function getServerFrameClockSnapshot(): number {
  return 0;
}

function subscribeToStaticClock(): () => void {
  return () => undefined;
}

function getStaticClockSnapshot(): number {
  return 0;
}

function useBenitoAnimationClock(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? subscribeToFrameClock : subscribeToStaticClock,
    enabled ? getFrameClockSnapshot : getStaticClockSnapshot,
    getServerFrameClockSnapshot,
  );
}

export function getBenitoFrameAtElapsedTime(
  state: BenitoState,
  elapsedMs: number,
): number {
  const animation = BENITO_ANIMATIONS[state];
  const totalDuration = animation.durations.reduce((sum, duration) => sum + duration, 0);
  let cursor = Math.max(0, elapsedMs) % totalDuration;

  for (let frame = 0; frame < animation.frameCount; frame += 1) {
    const duration = animation.durations[frame];
    if (cursor < duration) return frame;
    cursor -= duration;
  }

  return 0;
}

/** Test-only reset for module-level preload and shared-clock state. */
export function resetBenitoRuntimeForTests(): void {
  stopFrameClock();
  frameClockListeners.clear();
  atlasListeners.clear();
  atlasStatuses.clear();
  atlasRetryCounts.clear();
  frameClockNow = Date.now();
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
  const safeDisplayWidth =
    Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : BENITO_ATLAS.cellWidth;
  const atlasPath = getBenitoAtlasPath(safeDisplayWidth);
  const getSelectedAtlasStatus = useCallback(() => getAtlasStatus(atlasPath), [atlasPath]);
  const atlas = useSyncExternalStore(
    subscribeToAtlas,
    getSelectedAtlasStatus,
    getServerAtlasStatus,
  );
  const prefersReducedMotion = useReducedMotion(reducedMotion);
  const animationEnabled =
    atlas === "loaded" &&
    safeDisplayWidth > BENITO_STATIC_ICON_MAX_WIDTH &&
    shouldAnimateBenito({ paused, reducedMotion: prefersReducedMotion });
  const clock = useBenitoAnimationClock(animationEnabled);
  const animationOriginRef = useRef({
    state,
    atlasPath,
    enabled: animationEnabled,
    startedAt: clock,
  });

  useEffect(() => {
    preloadAtlas(atlasPath);
  }, [atlasPath]);

  useEffect(() => {
    const retryCount = atlasRetryCounts.get(atlasPath) ?? 0;
    if (atlas !== "error" || retryCount >= MAX_ATLAS_RETRIES) return;
    const retryTimer = window.setTimeout(() => retryAtlas(atlasPath), 1200);
    return () => window.clearTimeout(retryTimer);
  }, [atlas, atlasPath]);

  const origin = animationOriginRef.current;
  const stateChanged = origin.state !== state || origin.atlasPath !== atlasPath;
  const animationStarted = !origin.enabled && animationEnabled;
  if ((stateChanged && restartOnStateChange) || animationStarted) {
    animationOriginRef.current = {
      state,
      atlasPath,
      enabled: animationEnabled,
      startedAt: clock,
    };
  } else {
    origin.state = state;
    origin.atlasPath = atlasPath;
    origin.enabled = animationEnabled;
  }

  const frame = animationEnabled
    ? getBenitoFrameAtElapsedTime(
        state,
        Math.max(0, clock - animationOriginRef.current.startedAt),
      )
    : 0;
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
