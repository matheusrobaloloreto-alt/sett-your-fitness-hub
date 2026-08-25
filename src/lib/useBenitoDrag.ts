import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

type DragPosition = { x: number; y: number };
type DragDirection = "running-left" | "running-right" | null;

type DragBounds = {
  pointerId: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  lastClientX: number;
  moved: boolean;
};

type BenitoRect = { baseLeft: number; baseTop: number; width: number; height: number };
type BenitoViewport = { left: number; top: number; width: number; height: number };
type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };

const POSITION_VERSION = 2;
const POSITION_KEY = "student-benito-position-v2";

export function parseBenitoDragPosition(raw: string | null): DragPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: number; x?: unknown; y?: unknown };
    if (
      parsed.version !== POSITION_VERSION
      || typeof parsed.x !== "number"
      || typeof parsed.y !== "number"
      || !Number.isFinite(parsed.x)
      || !Number.isFinite(parsed.y)
    ) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function clampBenitoDragPosition(
  position: DragPosition,
  rect: BenitoRect,
  viewport: BenitoViewport,
  safeArea: SafeAreaInsets,
): DragPosition {
  const minX = viewport.left + safeArea.left - rect.baseLeft;
  const maxX = viewport.left + viewport.width - safeArea.right - rect.width - rect.baseLeft;
  const minY = viewport.top + safeArea.top - rect.baseTop;
  const maxY = viewport.top + viewport.height - safeArea.bottom - rect.height - rect.baseTop;
  return {
    x: Math.min(Math.max(minX, position.x), Math.max(minX, maxX)),
    y: Math.min(Math.max(minY, position.y), Math.max(minY, maxY)),
  };
}

function readSafeAreaInsets(): SafeAreaInsets {
  if (typeof document === "undefined" || !document.body) return { top: 8, right: 8, bottom: 8, left: 8 };
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = [
    "position:fixed",
    "visibility:hidden",
    "pointer-events:none",
    "padding-top:max(8px, env(safe-area-inset-top, 0px))",
    "padding-right:max(8px, env(safe-area-inset-right, 0px))",
    "padding-bottom:max(8px, env(safe-area-inset-bottom, 0px))",
    "padding-left:max(8px, env(safe-area-inset-left, 0px))",
  ].join(";");
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(computed.paddingTop) || 8,
    right: Number.parseFloat(computed.paddingRight) || 8,
    bottom: Number.parseFloat(computed.paddingBottom) || 8,
    left: Number.parseFloat(computed.paddingLeft) || 8,
  };
  probe.remove();
  return insets;
}

function readVisualViewport(): BenitoViewport {
  const viewport = window.visualViewport;
  return viewport
    ? { left: viewport.offsetLeft, top: viewport.offsetTop, width: viewport.width, height: viewport.height }
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

export function useBenitoDrag() {
  const dragRef = useRef<DragBounds | null>(null);
  const dragAbortRef = useRef<AbortController | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const safeAreaRef = useRef<SafeAreaInsets>({ top: 8, right: 8, bottom: 8, left: 8 });
  const positionRef = useRef<DragPosition>({ x: 0, y: 0 });
  const [position, setPositionState] = useState<DragPosition>(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    return parseBenitoDragPosition(window.localStorage.getItem(POSITION_KEY)) ?? { x: 0, y: 0 };
  });
  const [direction, setDirection] = useState<DragDirection>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReclamping, setIsReclamping] = useState(false);

  const setPosition = useCallback((next: DragPosition) => {
    positionRef.current = next;
    setPositionState(next);
  }, []);

  // Ref callbacks run before effects in WebKit. Keep the geometry ref synchronized
  // during render so a restored transform is not mistaken for the unshifted base.
  positionRef.current = position;

  const persistPosition = useCallback((next = positionRef.current) => {
    try {
      window.localStorage.setItem(POSITION_KEY, JSON.stringify({ version: POSITION_VERSION, ...next }));
    } catch {
      // Private browsing/quota must not disable the assistant.
    }
  }, []);

  const clampForTarget = useCallback((candidate: DragPosition) => {
    const target = targetRef.current;
    if (!target) return candidate;
    const current = positionRef.current;
    const bounds = target.getBoundingClientRect();
    return clampBenitoDragPosition(candidate, {
      baseLeft: bounds.left - current.x,
      baseTop: bounds.top - current.y,
      width: bounds.width,
      height: bounds.height,
    }, readVisualViewport(), safeAreaRef.current);
  }, []);

  const reclamp = useCallback(() => {
    setIsReclamping(true);
    safeAreaRef.current = readSafeAreaInsets();
    const next = clampForTarget(positionRef.current);
    setPosition(next);
    persistPosition(next);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setIsReclamping(false)));
  }, [clampForTarget, persistPosition, setPosition]);

  const attachDragTarget = useCallback((node: HTMLElement | null) => {
    targetRef.current = node;
    if (node) window.requestAnimationFrame(reclamp);
  }, [reclamp]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.sx;
    const dy = event.clientY - drag.sy;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    const horizontalDelta = event.clientX - drag.lastClientX;
    if (Math.abs(horizontalDelta) >= 3) {
      setDirection(horizontalDelta < 0 ? "running-left" : "running-right");
      drag.lastClientX = event.clientX;
    }
    setPosition(clampForTarget({ x: drag.ox + dx, y: drag.oy + dy }));
  }, [clampForTarget, setPosition]);

  const finishDrag = useCallback((pointerId?: number) => {
    const drag = dragRef.current;
    if (!drag || (pointerId != null && pointerId !== drag.pointerId)) return;
    const target = targetRef.current;
    try {
      if (target?.hasPointerCapture(drag.pointerId)) target.releasePointerCapture(drag.pointerId);
    } catch {
      // Safari can throw after pointercancel; global listeners still complete cleanup.
    }
    dragAbortRef.current?.abort();
    dragAbortRef.current = null;
    setDirection(null);
    setIsDragging(false);
    persistPosition();
  }, [persistPosition]);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || (event.button !== 0 && event.pointerType !== "touch")) return;
    event.preventDefault();
    dragAbortRef.current?.abort();
    targetRef.current = event.currentTarget;
    safeAreaRef.current = readSafeAreaInsets();
    const bounded = clampForTarget(positionRef.current);
    if (bounded.x !== positionRef.current.x || bounded.y !== positionRef.current.y) setPosition(bounded);
    dragRef.current = {
      pointerId: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      ox: bounded.x,
      oy: bounded.y,
      lastClientX: event.clientX,
      moved: false,
    };
    setIsDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Older Safari may not capture; window listeners keep the drag alive.
    }
    const controller = new AbortController();
    dragAbortRef.current = controller;
    const finish = (nativeEvent?: Event) => finishDrag((nativeEvent as PointerEvent | undefined)?.pointerId);
    window.addEventListener("pointermove", handlePointerMove, { passive: false, signal: controller.signal });
    window.addEventListener("pointerup", finish, { signal: controller.signal });
    window.addEventListener("pointercancel", finish, { signal: controller.signal });
    event.currentTarget.addEventListener("lostpointercapture", finish, { signal: controller.signal });
    window.addEventListener("blur", () => finishDrag(), { once: true, signal: controller.signal });
  }, [clampForTarget, finishDrag, handlePointerMove, setPosition]);

  const consumeDragGesture = useCallback(() => {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    return moved;
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const handleViewportChange = () => window.requestAnimationFrame(reclamp);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
      dragAbortRef.current?.abort();
      dragAbortRef.current = null;
    };
  }, [reclamp]);

  return { position, direction, isDragging, suspendTransition: isDragging || isReclamping, attachDragTarget, startDrag, consumeDragGesture };
}
