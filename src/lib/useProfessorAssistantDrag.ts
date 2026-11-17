import { PointerEvent as ReactPointerEvent, useCallback, useLayoutEffect, useRef, useState } from "react";

export const PROFESSOR_ASSISTANT_SIZE = 76;
const POSITION_KEY = "bnito-professor-position-v1";
type Position = { x: number; y: number };
type Placement = Position & { fits: boolean };
const SIDEBAR = '.sett-linen-sidebar > [data-sidebar="sidebar"]';
const DOCK = ".sett-linen-dock";
const CHAT_LAUNCHER = ".sett-chat-launcher";
type Gesture = {
  pointerId: number; dx: number; dy: number; startX: number; startY: number;
  lastX: number; moved: boolean;
};

function initialPosition(): Position {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  try {
    const stored = JSON.parse(window.localStorage.getItem(POSITION_KEY) || "null");
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
      return { x: stored.x, y: stored.y };
    }
  } catch {
    // Storage can be unavailable or contain an obsolete value.
  }
  return { x: window.innerWidth - 92, y: window.innerHeight - 92 };
}

export function useProfessorAssistantDrag(isMobile: boolean, chatAvailable: boolean, pathname: string) {
  const [position, setPosition] = useState<Placement>(() => ({ ...initialPosition(), fits: false }));
  const preference = useRef<Position>(position);
  // Non-null only during an active gesture; never replace intent with a temporary clamp.
  const requestedPosition = useRef<Position | null>(null);
  const [direction, setDirection] = useState<"running-left" | "running-right" | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const abort = useRef<AbortController | null>(null);

  const display = useCallback((candidate: Position) => {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const margin = 12;
    const sidebar = document.querySelector(SIDEBAR)?.getBoundingClientRect();
    const dock = document.querySelector(DOCK)?.getBoundingClientRect();
    // Keep the assistant in the content area for the full sidebar spring and
    // above the entire dock, including its safe area and install banner offset.
    const minX = Math.max(left, sidebar?.width ? sidebar.right : left) + margin;
    const maxX = left + width - PROFESSOR_ASSISTANT_SIZE - margin;
    const x = Math.max(minX, Math.min(candidate.x, maxX));
    const chat = document.querySelector(CHAT_LAUNCHER)?.getBoundingClientRect();
    const overChat = chat?.height && x < chat.right + margin
      && x + PROFESSOR_ASSISTANT_SIZE > chat.left - margin;
    const minY = top + margin;
    const maxY = Math.min(top + height, dock?.height ? dock.top : top + height, overChat ? chat.top : top + height)
      - PROFESSOR_ASSISTANT_SIZE - margin;
    const bounded = {
      x,
      y: Math.max(minY, Math.min(candidate.y, maxY)),
      fits: minX <= maxX && minY <= maxY,
    };
    setPosition(previous => previous.x === bounded.x && previous.y === bounded.y
      && previous.fits === bounded.fits ? previous : bounded);
  }, []);

  useLayoutEffect(() => {
    const reclamp = () => display(requestedPosition.current ?? preference.current);
    reclamp();
    const viewport = window.visualViewport;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reclamp);
    document.querySelectorAll(`${SIDEBAR}, ${DOCK}, ${CHAT_LAUNCHER}`).forEach(element => observer?.observe(element));
    // The install banner moves the dock without changing the dock's size.
    const root = document.documentElement;
    let installHeight = root.style.getPropertyValue("--sett-install-height");
    const installObserver = isMobile ? new MutationObserver(() => {
      const nextHeight = root.style.getPropertyValue("--sett-install-height");
      if (nextHeight === installHeight) return;
      installHeight = nextHeight;
      reclamp();
    }) : null;
    installObserver?.observe(root, { attributes: true, attributeFilter: ["style"] });
    window.addEventListener("resize", reclamp);
    window.addEventListener("orientationchange", reclamp);
    window.addEventListener("scroll", reclamp, true);
    viewport?.addEventListener("resize", reclamp);
    viewport?.addEventListener("scroll", reclamp);
    return () => {
      observer?.disconnect();
      installObserver?.disconnect();
      window.removeEventListener("resize", reclamp);
      window.removeEventListener("orientationchange", reclamp);
      window.removeEventListener("scroll", reclamp, true);
      viewport?.removeEventListener("resize", reclamp);
      viewport?.removeEventListener("scroll", reclamp);
    };
  }, [display, isMobile, chatAvailable, pathname]);

  useLayoutEffect(() => () => abort.current?.abort(), []);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || abort.current) return;
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    requestedPosition.current = { x: rect.left, y: rect.top };
    gesture.current = {
      pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top,
      startX: event.clientX, startY: event.clientY, lastX: event.clientX, moved: false,
    };
    try { target.setPointerCapture(event.pointerId); } catch { /* Window listeners are the fallback. */ }
    const controller = new AbortController();
    abort.current = controller;

    const finish = (persist: boolean) => {
      const requested = requestedPosition.current;
      if (!requested) return;
      requestedPosition.current = null;
      const moved = gesture.current?.moved;
      controller.abort();
      abort.current = null;
      try {
        if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      } catch { /* Pointer capture may already have been released. */ }
      setDirection(null);
      if (persist && moved) {
        preference.current = requested;
        try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(preference.current)); } catch { /* Optional storage. */ }
      } else if (!persist) {
        // Suppress a possible click synthesized after cancellation as well.
        if (gesture.current) gesture.current.moved = true;
      }
      display(preference.current);
    };
    window.addEventListener("pointermove", (move: PointerEvent) => {
      const drag = gesture.current;
      if (!drag || move.pointerId !== drag.pointerId) return;
      if (Math.abs(move.clientX - drag.startX) > 5 || Math.abs(move.clientY - drag.startY) > 5) drag.moved = true;
      if (!drag.moved) return;
      move.preventDefault();
      const delta = move.clientX - drag.lastX;
      if (Math.abs(delta) >= 3) {
        setDirection(delta < 0 ? "running-left" : "running-right");
        drag.lastX = move.clientX;
      }
      requestedPosition.current = { x: move.clientX - drag.dx, y: move.clientY - drag.dy };
      display(requestedPosition.current);
    }, { passive: false, signal: controller.signal });
    window.addEventListener("pointerup", (up: PointerEvent) => {
      if (up.pointerId === event.pointerId) finish(true);
    }, { signal: controller.signal });
    window.addEventListener("pointercancel", (cancel: PointerEvent) => {
      if (cancel.pointerId === event.pointerId) finish(false);
    }, { signal: controller.signal });
    target.addEventListener("lostpointercapture", () => finish(false), { signal: controller.signal });
    window.addEventListener("blur", () => finish(false), { signal: controller.signal });
  }, [display]);

  const consumeDragGesture = useCallback((clickDetail: number) => {
    const moved = gesture.current?.moved ?? false;
    gesture.current = null;
    // Enter/Space (detail=0) must still work after a drag without a click.
    return clickDetail !== 0 && moved;
  }, []);

  return { position, fits: position.fits, direction, startDrag, consumeDragGesture };
}
