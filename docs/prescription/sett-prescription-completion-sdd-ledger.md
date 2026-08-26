# SETT prescription completion — SDD ledger

Data: 2026-08-26

Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/prescription-completion`
Branch: `codex/sett-prescription-completion-20260826`
Baseline informado: `9a9cf4f6bd15e06bbca474d4b4ab907aec279505`

## Escopo executado

- Deload do motor compartilhado de força alinhado para `RIR 4`.
- `applyLongitudinalProgression()` passou a devolver `workouts` explicitamente e sem mutar a entrada.
- `generateTrainingProgram()` passou a reaplicar `enforceVolumeCaps()` sobre `longitudinal.workouts`.
- Teste de contrato estruturado adicionado para manter `method`, `group_id` e `method_seconds` nulos em iniciante, dor, semanas base e deload.
- REQUEST_CHANGES do QA independente resolvido localmente: `src/lib/periodization.ts` não emite mais regenerativo na faixa antiga 4–5 nem choque na faixa antiga 1–2 em macrociclos longos.
- Segundo REQUEST_CHANGES P1 resolvido localmente: presets vivos de hipertrofia intermediária e força não emitem mais faixa antiga 1–3; duplicata fallback da edge também alinhada.
- A4/A5 não receberam texto duplicado em `methodInstruction()`: os helpers e consumidores já existentes (`formatBiweeklyProgressionForDisplay`, `studentEffortLabel`, `STUDENT_EFFORT_HELP_TEXT`, `StudentWorkout`, `ExerciseCard`) foram preservados.

## TDD — vermelho

Comando:

```bash
npx vitest run src/lib/prescription/longitudinal-engines.test.ts src/lib/prescription/engine.test.ts
```

Resultado esperado e observado: vermelho útil.

- `src/lib/prescription/longitudinal-engines.test.ts`: 4 falhas por `result.workouts` ausente ou não consumível.
- `src/lib/prescription/engine.test.ts`: 2 falhas por contrato de deload ainda na faixa antiga 4–5.
- Total: 6 falhas, 80 passes.

## TDD — verde focado

Comando:

```bash
npx vitest run src/lib/prescription/longitudinal-engines.test.ts src/lib/prescription/engine.test.ts
```

Resultado:

- 2 arquivos passaram.
- 86 testes passaram.

## QA REQUEST_CHANGES — vermelho e correção

Contexto: QA independente retornou `REQUEST_CHANGES` porque `src/lib/periodization.ts` ainda emitia deload/regenerativo na faixa antiga 4–5 e alimenta UI aluno/admin.

Comando:

```bash
npx vitest run src/lib/periodization.test.ts
```

Vermelho 1 observado:

- Novo teste de macrociclo longo falhou em semanas regenerativas 4 e 8: recebido faixa antiga 4–5, esperado `4`.
- Resultado: 1 falha, 2 passes.

Após patch mínimo de regenerativo para `4`, o mesmo comando foi executado de novo.

Vermelho 2 observado:

- O teste passou a falhar em semanas de choque 3 e 7: recebido faixa antiga 1–2, esperado `2`.
- Resultado: 1 falha, 2 passes.

Correção aplicada:

- `src/lib/periodization.ts`: comentário alinhado para deload `RIR 4`.
- `src/lib/periodization.ts`: regenerativo longo emite `rir = "4"`.
- `src/lib/periodization.ts`: choque longo emite `rir = "2"` para respeitar o contrato explícito RIR 2–4.
- Nenhum componente/UX foi editado.

## Segundo QA REQUEST_CHANGES — vermelho e correção

Contexto: segundo QA independente retornou `REQUEST_CHANGES P1` porque `supabase/functions/_shared/prescription/presets.ts` ainda tinha presets vivos fora do contrato RIR 2–4 (`hipertrofia_intermediario` e `forca` na faixa antiga 1–3) e a edge `supabase/functions/ai-prescribe-workout/index.ts` mantinha a duplicata fallback com o mesmo drift.

Comando:

```bash
npx vitest run src/lib/prescription/engine.test.ts src/lib/prescription/edge-safety-invariants.test.ts
```

Vermelho observado:

- `src/lib/prescription/engine.test.ts`: falhou em `hipertrofia_intermediario` com preset fora de RIR 2–4.
- `src/lib/prescription/edge-safety-invariants.test.ts`: falhou na duplicata fallback da edge com o mesmo preset fora de RIR 2–4.
- Resultado: 2 falhas, 86 passes.

Correção aplicada:

- `supabase/functions/_shared/prescription/presets.ts`: `hipertrofia_intermediario.rir` alinhado para `2-3`.
- `supabase/functions/_shared/prescription/presets.ts`: `forca.rir` alinhado para `2-3, nunca falha sistematica`.
- `supabase/functions/ai-prescribe-workout/index.ts`: duplicatas fallback dos dois presets alinhadas com os mesmos valores.
- Nenhum exercício, componente ou UX foi alterado.

Verde imediato:

```bash
npx vitest run src/lib/prescription/engine.test.ts src/lib/prescription/edge-safety-invariants.test.ts
```

Resultado:

- 2 arquivos passaram.
- 88 testes passaram.

## Validação ampliada

Comando:

```bash
npx vitest run src/lib/prescription/engine.test.ts src/lib/prescription/longitudinal-engines.test.ts src/lib/prescription/advancedMethods.test.ts src/lib/setTypes.test.ts src/lib/publishStrengthPlan.test.ts src/lib/weeklyStrengthPeriodization.test.ts
```

Resultado:

- 6 arquivos passaram.
- 133 testes passaram.

Comando focado pós-REQUEST_CHANGES:

```bash
npx vitest run src/lib/periodization.test.ts src/lib/weeklyStrengthPeriodization.test.ts src/lib/prescription/engine.test.ts src/lib/prescription/longitudinal-engines.test.ts src/lib/prescription/advancedMethods.test.ts
```

Resultado:

- 5 arquivos passaram.
- 121 testes passaram.

Comando focado pós-segundo REQUEST_CHANGES:

```bash
npx vitest run src/lib/prescription/engine.test.ts src/lib/prescription/longitudinal-engines.test.ts src/lib/prescription/advancedMethods.test.ts src/lib/prescription/shared-source.test.ts src/lib/prescription/edge-safety-invariants.test.ts src/lib/periodization.test.ts src/lib/weeklyStrengthPeriodization.test.ts
```

Resultado:

- 7 arquivos passaram.
- 139 testes passaram.

Comando:

```bash
npx tsc --noEmit
```

Resultado: passou sem saída.

Comando full:

```bash
npm test
```

Resultado:

- 90 arquivos passaram.
- 637 testes passaram no gate final do owner.

Comando build:

```bash
npm run build
```

Resultado:

- `verify:backend` confirmou backend production `zshrcgbyhzxpnlccssyz`.
- `vite build` passou.
- `prepare-staging-deploy.mjs` foi no-op fora de staging.

Comando Deno pós-segundo REQUEST_CHANGES:

```bash
deno check supabase/functions/_shared/prescription/presets.ts supabase/functions/_shared/prescription/engine.ts supabase/functions/_shared/prescription/longitudinalRules.ts supabase/functions/_shared/prescription/weeklyPeriodization.ts supabase/functions/_shared/prescription/validator.ts supabase/functions/ai-prescribe-workout/index.ts
```

Resultado: passou.

Comando:

```bash
deno check supabase/functions/_shared/prescription/engine.ts supabase/functions/_shared/prescription/longitudinalRules.ts supabase/functions/_shared/prescription/weeklyPeriodization.ts supabase/functions/_shared/prescription/validator.ts
```

Resultado: passou.

Comando:

```bash
deno test supabase/functions/_shared/prescription/volumeRules.test.ts
```

Resultado:

- 5 testes passaram.

Comando:

```bash
deno check supabase/functions/ai-prescribe-workout/index.ts
```

Resultado: passou.

## Evidência de grep

Consulta executada no terminal sobre `supabase/functions/_shared/prescription`, `src/lib/prescription` e `docs/prescription/periodization-methodology-v1.md`, buscando o padrão literal antigo de RIR do deload.

Resultado: única ocorrência no escopo vivo é a asserção negativa em `src/lib/prescription/engine.test.ts` que garante que a faixa antiga 4–5 não volta ao contrato de deload.

## Limites preservados

- QA independente gpt-5.5: `APPROVE` após dois ciclos de `REQUEST_CHANGES` corrigidos e revalidados.
- Commit local autorizado somente após esse `APPROVE`.
- Sem deploy.
- Sem migrations.
- Sem flags.
- Sem edição de cardio, nutrição, CRM, wearables, MFIT, vídeos ou UX geral.
- Sem edição de `StudentWorkout.tsx`.
