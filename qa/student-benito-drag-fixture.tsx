import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BenitoSprite } from "../src/components/BenitoSprite";
import { useBenitoDrag } from "../src/lib/useBenitoDrag";
import "../src/index.css";

function Fixture() {
  const { position, direction, isDragging, suspendTransition, attachDragTarget, startDrag, consumeDragGesture } = useBenitoDrag();
  const [opens, setOpens] = useState(0);

  return (
    <main className="min-h-[180vh] bg-background p-6">
      <p data-open-count={opens}>Aberturas: {opens}</p>
      <button
        ref={attachDragTarget}
        type="button"
        data-benito-fab="student"
        aria-label="Abrir Benito"
        data-drag-direction={direction ?? "idle"}
        data-dragging={isDragging ? "true" : "false"}
        data-drag-x={Math.round(position.x)}
        data-drag-y={Math.round(position.y)}
        style={{
          position: "fixed",
          right: 20,
          bottom: 96,
          width: 76,
          height: 76,
          transform: `translate(${position.x}px, ${position.y}px)`,
          touchAction: "none",
          transition: suspendTransition ? "none" : "transform 200ms",
        }}
        onPointerDown={startDrag}
        onClick={() => {
          if (!consumeDragGesture()) setOpens((current) => current + 1);
        }}
      >
        <BenitoSprite state={direction ?? "idle"} size={60} alt="" />
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
