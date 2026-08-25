import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

type DragPosition = { x: number; y: number };
type DragDirection = "running-left" | "running-right" | null;

type DragBounds = {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  lastClientX: number;
  moved: boolean;
};

export function useBenitoDrag() {
  const dragRef = useRef<DragBounds>({
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    lastClientX: 0,
    moved: false,
  });
  const dragAbortRef = useRef<AbortController | null>(null);
  const [position, setPosition] = useState<DragPosition>({ x: 0, y: 0 });
  const [direction, setDirection] = useState<DragDirection>(null);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const dx = event.clientX - drag.sx;
    const dy = event.clientY - drag.sy;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;

    const horizontalDelta = event.clientX - drag.lastClientX;
    if (Math.abs(horizontalDelta) >= 3) {
      setDirection(horizontalDelta < 0 ? "running-left" : "running-right");
      drag.lastClientX = event.clientX;
    }
    setPosition({
      x: Math.min(drag.maxX, Math.max(drag.minX, drag.ox + dx)),
      y: Math.min(drag.maxY, Math.max(drag.minY, drag.oy + dy)),
    });
  }, []);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    dragAbortRef.current?.abort();
    const rect = event.currentTarget.getBoundingClientRect();
    const baseLeft = rect.left - position.x;
    const baseTop = rect.top - position.y;
    const minX = 8 - baseLeft;
    const maxX = window.innerWidth - 8 - baseLeft - rect.width;
    const minY = 8 - baseTop;
    const maxY = window.innerHeight - 8 - baseTop - rect.height;
    const ox = Math.min(maxX, Math.max(minX, position.x));
    const oy = Math.min(maxY, Math.max(minY, position.y));

    if (ox !== position.x || oy !== position.y) setPosition({ x: ox, y: oy });
    dragRef.current = {
      sx: event.clientX,
      sy: event.clientY,
      ox,
      oy,
      minX,
      maxX,
      minY,
      maxY,
      lastClientX: event.clientX,
      moved: false,
    };

    const controller = new AbortController();
    dragAbortRef.current = controller;
    const finishDrag = () => {
      controller.abort();
      if (dragAbortRef.current === controller) dragAbortRef.current = null;
      setDirection(null);
    };
    window.addEventListener("pointermove", handlePointerMove, { signal: controller.signal });
    window.addEventListener("pointerup", finishDrag, { once: true, signal: controller.signal });
    window.addEventListener("pointercancel", finishDrag, { once: true, signal: controller.signal });
    window.addEventListener("blur", finishDrag, { once: true, signal: controller.signal });
  }, [handlePointerMove, position]);

  const consumeDragGesture = useCallback(() => {
    const moved = dragRef.current.moved;
    dragRef.current.moved = false;
    return moved;
  }, []);

  useEffect(() => () => {
    dragAbortRef.current?.abort();
    dragAbortRef.current = null;
  }, []);

  return { position, direction, startDrag, consumeDragGesture };
}
