/* eslint-disable react-refresh/only-export-components -- standalone Vite QA entrypoint mounts its fixture directly. */

import React from "react";
import { createRoot } from "react-dom/client";
import { BenitoSprite, type BenitoState } from "../src/components/BenitoSprite";

const states: ReadonlyArray<{ label: string; state: BenitoState }> = [
  { label: "idle", state: "idle" },
  { label: "saudação", state: "greeting" },
  { label: "corrida direita", state: "running-right" },
  { label: "corrida esquerda", state: "running-left" },
  { label: "espera", state: "waiting" },
  { label: "processamento", state: "processing" },
  { label: "sucesso", state: "success" },
  { label: "alerta/erro", state: "alert" },
  { label: "celebração", state: "celebration" },
];

function BenitoMobileFixture() {
  const paused = new URLSearchParams(window.location.search).get("animation") !== "run";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        html, body, #root { margin: 0; min-height: 100%; }
        body { min-height: 100vh; overflow-x: hidden; background: #f5f1e8; color: #182348; font: 14px system-ui, sans-serif; }
        main { min-height: 844px; padding: 20px 16px 116px; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        p { margin: 0 0 16px; color: #5a6177; }
        .states { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .state { min-width: 0; padding: 8px 4px; border: 1px solid #d8d2c7; border-radius: 14px; background: white; text-align: center; }
        .state > span:last-child { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
        .assistant { position: fixed; right: 16px; bottom: 96px; width: min(320px, calc(100vw - 32px)); padding: 12px; border: 1px solid #d8d2c7; border-radius: 22px; background: rgba(255,255,255,.96); box-shadow: 0 18px 45px rgba(24,35,72,.2); }
        .assistant-header { display: flex; align-items: center; gap: 10px; }
        .assistant-copy { min-width: 0; }
        .assistant-copy strong, .assistant-copy small { display: block; }
        .assistant-copy small { color: #5a6177; }
        .fab { position: fixed; bottom: 20px; width: 64px; height: 64px; display: grid; place-items: center; padding: 0; border: 0; background: transparent; box-shadow: none; color: #182348; }
        .fab-professor { left: 20px; }
        .fab-student { right: 20px; }
      `}</style>
      <main>
        <h1>Benito v2 · mobile QA</h1>
        <p>Nove estados do aluno e professor no componente React real.</p>
        <section className="states" aria-label="Estados do Benito">
          {states.map(({ label, state }) => (
            <div className="state" key={state}>
              <BenitoSprite state={state} size={42} alt={`Benito: ${label}`} paused={paused} />
              <span>{label}</span>
            </div>
          ))}
        </section>
      </main>
      <aside className="assistant" aria-label="Prévia do assistente">
        <div className="assistant-header">
          <BenitoSprite state="processing" size={42} alt="Benito processando" paused={paused} />
          <div className="assistant-copy">
            <strong>Benito está processando</strong>
            <small>Professor e aluno mantêm o mesmo avatar.</small>
          </div>
        </div>
      </aside>
      <button className="fab fab-professor" data-role="professor" aria-label="Abrir Benito do professor">
        <BenitoSprite state="idle" size={42} alt="" paused={paused} />
      </button>
      <button className="fab fab-student" data-role="student" aria-label="Abrir Benito do aluno">
        <BenitoSprite state="idle" size={42} alt="" paused={paused} />
      </button>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BenitoMobileFixture />
  </React.StrictMode>,
);
