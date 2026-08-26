# Student Wave 1 — SDD brief (2026-08-26)

## Base e limites

- Base aprovada: `f74bac20dd0f0d002635642477795584d8210601`.
- Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/student-wave1`.
- Branch: `codex/student-wave1-20260826`.
- Sem alteração de DB, Edge Function, motor, Studio/admin, CRM ou wearables.
- Sem push/deploy.

## Auditoria factual antes de editar

### Já implementado — preservar e testar

- `StudentPortal` já usa `StudentMethodGroup` para grupos reconhecidos; primeiro grupo abre e os demais recolhem.
- Header compacto tem Avisos/Sair com ícones, `aria-label`, `title` e alvos de 44 px.
- `StudentHome` produz a ordem Treino, Corrida, Ciclismo, Natação, Dicas nutricionais, Estatísticas, Calendário, Integrações; Histórico não é atalho.
- RIR já passa por copy leiga nas superfícies e PDFs do aluno.
- `useBenitoDrag` já tem viewport visual, safe-area, pointercancel/lost capture, persistência versionada e clamp.
- `WarmupGuide` resolve somente movimentos da checklist contra allowlist do catálogo e não usa exercícios do circuito principal.
- Seleção do treino sobrevive ao reload via `resolveWorkoutSelectionAfterReload`.
- Baseline focado: 7 arquivos/22 testes verdes.

### Gaps confirmados

1. `StudentWorkout` renderiza `selectedWorkout.description` literalmente; uma descrição interna do motor chega ao aluno.
2. A rota/tela `StudentWorkout` agrupa métodos visualmente, mas não usa accordion; portanto a experiência não é uniforme com `StudentPortal`.

## Contratos RED→GREEN

1. Um sanitizador student-only remove frases operacionais internas (`BN Prescription Engine`, revisão de casos clínicos e equivalentes normalizados), preserva instruções humanas adjacentes e retorna `null` quando nada útil resta.
2. `StudentWorkout` usa o sanitizador; Studio/admin e payload persistido não mudam.
3. `StudentWorkout` renderiza todos os métodos de agrupamento reconhecidos por `StudentMethodGroup`; métodos individuais e séries normais permanecem visíveis fora do accordion.
4. O accordion preserva o estado dos cards/checks porque somente controla visibilidade; não remonta o conteúdo (`forceMount`).
5. Testes de regressão existentes para header/menu/RIR/Benito/warmup/reload continuam verdes.

## Gates

- RED observado para os dois gaps reais.
- GREEN focado, TypeScript, suíte completa, lint dos arquivos tocados, build.
- Browser local Chromium 390 px e WebKit/iPhone para accordion/collapse, contexto/check, header, Benito e warmup.
- QA independente gpt-5.5 após commit do executor.
