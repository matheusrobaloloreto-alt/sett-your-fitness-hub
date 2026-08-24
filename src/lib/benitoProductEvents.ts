import { useEffect, useState } from "react";
import type { BenitoState } from "@/components/BenitoSprite";

export const BENITO_PRODUCT_EVENT_NAME = "benito:product-event";

export type BenitoProductAudience = "professor" | "student";

export type BenitoProductEvent =
  | { source: "professor_prescription"; action: "generation_started" | "review_started" | "completed" | "failed" | "blocked" }
  | { source: "student_workout"; action: "start_blocked" | "started" | "completed" }
  | { source: "student_feedback"; action: "submitted" | "failed" };

export type BenitoProductEventSpec = {
  audience: BenitoProductAudience;
  state: BenitoState;
  ttlMs: number | null;
  sticky: boolean;
  priority: number;
  fallback: BenitoState;
};

export type BenitoProductEventCandidate = {
  state: BenitoState;
  priority: number;
  fallback: BenitoState;
  expiresAt: number | null;
};

const SHORT_MS = 1800;
const ERROR_MS = 2200;
const ALERT_MS = 2400;

const STATE_PRIORITY: Readonly<Record<BenitoState, number>> = {
  idle: 0,
  waiting: 20,
  greeting: 30,
  success: 40,
  celebration: 40,
  review: 60,
  alert: 70,
  error: 70,
  processing: 80,
  "running-left": 100,
  "running-right": 100,
};

const EVENT_SPECS: Readonly<Record<string, BenitoProductEventSpec>> = {
  "professor_prescription:generation_started": {
    audience: "professor",
    state: "processing",
    ttlMs: null,
    sticky: true,
    priority: 80,
    fallback: "idle",
  },
  "professor_prescription:review_started": {
    audience: "professor",
    state: "review",
    ttlMs: null,
    sticky: true,
    priority: 60,
    fallback: "idle",
  },
  "professor_prescription:completed": {
    audience: "professor",
    state: "success",
    ttlMs: SHORT_MS,
    sticky: false,
    priority: 40,
    fallback: "idle",
  },
  "professor_prescription:failed": {
    audience: "professor",
    state: "error",
    ttlMs: ERROR_MS,
    sticky: false,
    priority: 70,
    fallback: "idle",
  },
  "professor_prescription:blocked": {
    audience: "professor",
    state: "alert",
    ttlMs: ALERT_MS,
    sticky: false,
    priority: 70,
    fallback: "idle",
  },
  "student_workout:start_blocked": {
    audience: "student",
    state: "waiting",
    ttlMs: SHORT_MS,
    sticky: false,
    priority: 20,
    fallback: "idle",
  },
  "student_workout:started": {
    audience: "student",
    state: "greeting",
    ttlMs: SHORT_MS,
    sticky: false,
    priority: 30,
    fallback: "idle",
  },
  "student_workout:completed": {
    audience: "student",
    state: "celebration",
    ttlMs: SHORT_MS,
    sticky: false,
    priority: 40,
    fallback: "idle",
  },
  "student_feedback:submitted": {
    audience: "student",
    state: "success",
    ttlMs: SHORT_MS,
    sticky: false,
    priority: 40,
    fallback: "idle",
  },
  "student_feedback:failed": {
    audience: "student",
    state: "error",
    ttlMs: ERROR_MS,
    sticky: false,
    priority: 70,
    fallback: "idle",
  },
};

function eventKey(event: BenitoProductEvent): string {
  return `${event.source}:${event.action}`;
}

export function getBenitoEventSpec(event: BenitoProductEvent): BenitoProductEventSpec | null {
  return EVENT_SPECS[eventKey(event)] ?? null;
}

export function emitBenitoProductEvent(event: BenitoProductEvent): boolean {
  if (typeof window === "undefined") return false;
  const spec = getBenitoEventSpec(event);
  if (!spec) return false;
  window.dispatchEvent(new CustomEvent(BENITO_PRODUCT_EVENT_NAME, { detail: event }));
  return true;
}

export function resolveBenitoProductState({
  fallback,
  dragDirection = null,
  candidates,
  now = Date.now(),
}: {
  fallback: BenitoState;
  dragDirection?: "running-left" | "running-right" | null;
  candidates: BenitoProductEventCandidate[];
  now?: number;
}): BenitoState {
  if (dragDirection) return dragDirection;
  const fallbackCandidate: BenitoProductEventCandidate = {
    state: fallback,
    priority: STATE_PRIORITY[fallback] ?? 0,
    fallback,
    expiresAt: null,
  };
  const active = [...candidates, fallbackCandidate]
    .filter((candidate) => candidate.expiresAt === null || candidate.expiresAt > now)
    .sort((a, b) => b.priority - a.priority);
  return active[0]?.state ?? fallback;
}

export function useBenitoProductState(
  audience: BenitoProductAudience,
  fallback: BenitoState = "idle",
  dragDirection: "running-left" | "running-right" | null = null,
): BenitoState {
  const [candidate, setCandidate] = useState<BenitoProductEventCandidate | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let timer: number | null = null;

    const clearReactionTimer = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };

    const handleEvent = (event: Event) => {
      const detail = (event as CustomEvent<BenitoProductEvent>).detail;
      const spec = detail ? getBenitoEventSpec(detail) : null;
      if (!spec || spec.audience !== audience) return;

      clearReactionTimer();
      const expiresAt = spec.ttlMs === null ? null : Date.now() + spec.ttlMs;
      setCandidate({
        state: spec.state,
        priority: spec.priority,
        fallback: spec.fallback,
        expiresAt,
      });
      if (spec.ttlMs !== null) {
        timer = window.setTimeout(() => {
          timer = null;
          setCandidate(null);
        }, spec.ttlMs);
      }
    };

    window.addEventListener(BENITO_PRODUCT_EVENT_NAME, handleEvent);
    return () => {
      clearReactionTimer();
      window.removeEventListener(BENITO_PRODUCT_EVENT_NAME, handleEvent);
    };
  }, [audience]);

  return resolveBenitoProductState({
    fallback,
    dragDirection,
    candidates: candidate ? [candidate] : [],
  });
}
