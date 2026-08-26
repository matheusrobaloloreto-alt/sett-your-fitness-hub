# SETT prescription completion — executor report

Data: 2026-08-26

## Resultado

Patch local concluído no worktree novo. O QA independente retornou `REQUEST_CHANGES` em dois ciclos, as mudanças pedidas foram corrigidas e o terceiro review terminou em `APPROVE`. A entrega está autorizada para commit local; não houve deploy, migration, push ou alteração de flag.

## Arquivos alterados

- `supabase/functions/_shared/prescription/methodology.ts`
  - `DELOAD_RULES.rir` alterado da faixa antiga 4–5 para `4`.
- `supabase/functions/_shared/prescription/engine.ts`
  - Remanescentes da faixa antiga 4–5 nos specs compartilhados de força substituídos por `4`.
  - Cap final agora consome `longitudinal.workouts`.
- `supabase/functions/_shared/prescription/longitudinalRules.ts`
  - `applyLongitudinalProgression()` clona os workouts, aplica progressão na cópia e retorna `workouts`.
- `supabase/functions/_shared/prescription/explanations.ts`
  - Explicação de deload alinhada para `RIR 4`.
- `supabase/functions/_shared/prescription/validator.ts`
  - Recomendação do warning de deload alinhada para `RIR 4`.
- `supabase/functions/_shared/prescription/presets.ts`
  - `hipertrofia_intermediario.rir` alinhado para `2-3`.
  - `forca.rir` alinhado para `2-3, nunca falha sistematica`.
- `supabase/functions/ai-prescribe-workout/index.ts`
  - Duplicata fallback dos presets `hipertrofia_intermediario` e `forca` alinhada ao contrato RIR 2–4.
- `src/lib/prescription/longitudinal-engines.test.ts`
  - Testes travam retorno explícito, ausência de mutação lateral, preservação de +1 série abaixo do cap e redução acima do cap.
- `src/lib/prescription/engine.test.ts`
  - Testes de deload atualizados para `RIR 4`.
  - Novo teste estruturado exige `method`, `group_id` e `method_seconds` nulos em iniciante, dor, base e deload.
  - Novo teste garante presets vivos de hipertrofia intermediária e força dentro de RIR 2–4.
- `src/lib/prescription/edge-safety-invariants.test.ts`
  - Novo guard estático garante que a duplicata fallback da edge também não emite presets críticos fora de RIR 2–4.
- `src/lib/periodization.ts`
  - Comentário alinhado para deload `RIR 4`.
  - Macrociclo longo agora emite regenerativo `RIR 4`.
  - Macrociclo longo agora emite choque `RIR 2`, respeitando o contrato explícito RIR 2–4.
- `src/lib/periodization.test.ts`
  - Novo teste de 8 semanas exige regenerativos em `RIR 4`, choques em `RIR 2` e todas as semanas dentro de 2–4.
- `docs/prescription/periodization-methodology-v1.md`
  - Contrato metodológico atual do deload alinhado para `RIR 4`.
- `docs/prescription/sett-prescription-completion-sdd-ledger.md`
  - Ledger local de TDD e validação.
- `docs/prescription/sett-prescription-completion-report.md`
  - Este relatório.

## Pontos de contrato cobertos

- Biblioteca-only preservado: não foi criado fallback com IDs falsos nem catálogo externo.
- Deload permanece com volume reduzido, sem falha e sem método avançado.
- Deload agora é `RIR 4`, sem remanescente contratual da faixa antiga 4–5 no motor compartilhado de força.
- Presets vivos de hipertrofia intermediária e força agora ficam dentro de RIR 2–4.
- Força preserva o texto `nunca falha sistematica`.
- Fallback legado da edge foi alinhado para não driftar do contrato compartilhado.
- Periodização visual/admin-aluno agora também emite regenerativo `RIR 4`.
- Choque visual/admin-aluno de macrociclo longo foi rebaixado da faixa antiga 1–2 para `2` para não sair do contrato RIR 2–4.
- A progressão longitudinal não depende mais de mutação lateral para chegar ao cap final.
- O cap pós-progressão mantém +1 série quando abaixo do teto e reduz quando acima.
- `method`, `group_id` e `method_seconds` continuam nulos nos contextos bloqueados.
- A4/A5 não foram duplicados em `methodInstruction()` porque o fluxo atual já passa por helpers student-facing existentes e testados.

## Validações

- Vermelho inicial focado: 6 falhas esperadas no comando `npx vitest run src/lib/prescription/longitudinal-engines.test.ts src/lib/prescription/engine.test.ts`.
- REQUEST_CHANGES vermelho 1: `npx vitest run src/lib/periodization.test.ts` falhou por regenerativo na faixa antiga 4–5.
- REQUEST_CHANGES vermelho 2: após patch de regenerativo, o mesmo teste falhou por choque na faixa antiga 1–2.
- Segundo REQUEST_CHANGES vermelho: `npx vitest run src/lib/prescription/engine.test.ts src/lib/prescription/edge-safety-invariants.test.ts` falhou em motor e edge por preset crítico na faixa antiga 1–3.
- Verde focado: 86/86.
- Verde focado pós-REQUEST_CHANGES: 121/121 em `periodization`, `weeklyStrengthPeriodization` e prescrição.
- Verde focado pós-segundo REQUEST_CHANGES: 88/88 no par vermelho; 139/139 em prescrição + edge source contract + periodização/weekly.
- Verde ampliado: 133/133.
- `npx tsc --noEmit`: passou.
- `npm test`: 90 arquivos / 637 testes passaram no gate final do owner.
- `npm run build`: passou; `verify:backend` confirmou production `zshrcgbyhzxpnlccssyz`, `vite build` passou e staging sanitizer foi no-op fora de staging.
- `deno check` dos módulos compartilhados tocados: passou.
- `deno check` pós-segundo REQUEST_CHANGES em `presets.ts`, módulos compartilhados de prescrição tocados e `ai-prescribe-workout/index.ts`: passou.
- `deno test supabase/functions/_shared/prescription/volumeRules.test.ts`: 5/5.
- `deno check supabase/functions/ai-prescribe-workout/index.ts`: passou.

## Riscos e pendências

- QA independente gpt-5.5 aprovou o diff final (`APPROVE`) após confirmar as duas correções solicitadas.
- Integração, staging e produção continuam pendentes e fora do escopo desta entrega; não houve push, deploy ou migration.
- O build mantém o aviso existente de chunks acima de 500 kB; não é regressão desta mudança nem bloqueio do motor de prescrição.
- Ainda existem menções históricas à faixa antiga 4–5 fora do contrato vivo alterado, como docs/auditorias antigas e helpers de tradução student-facing. No escopo vivo verificado (`_shared/prescription`, `src/lib/prescription`, `src/lib/periodization.ts`, `periodization-methodology-v1.md`), a única ocorrência é uma asserção negativa contra essa faixa antiga.
