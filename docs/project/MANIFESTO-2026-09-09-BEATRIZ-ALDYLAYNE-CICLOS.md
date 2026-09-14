# Manifesto de reparo alvo: Beatriz e Aldylayne - 2026-09-09

## Escopo

Aplicado em producao apos dry-run do apply exato com rollback e GO independente,
sem tocar nos arquivos de vigencias legadas. Projeto PROD:
`zshrcgbyhzxpnlccssyz`, tenant `bn-performance-training`.

Pos-audit: 4/4 after-images conferidas; auditoria com RLS ativa e sem acesso de
`anon`/`authenticated`. Beatriz ficou com zero sobreposicoes atuais/futuras. A
fronteira futura vazia de Aldylayne saiu do conflito; permaneceu somente o par
real de cardio/historico que o manifesto determinou preservar.

Arquivos novos:

- `scripts/repair-bn-beatriz-aldylayne-cycle-overlaps-dryrun.sql`
- `scripts/repair-bn-beatriz-aldylayne-cycle-overlaps-apply.sql`
- `scripts/rollback-bn-beatriz-aldylayne-cycle-overlaps.sql`
- `docs/project/MANIFESTO-2026-09-09-BEATRIZ-ALDYLAYNE-CICLOS.md`

## Alvos

| Matricula | Ciclo | Acao |
| --- | --- | --- |
| `3530d245ed22` | `2024d5159013` | `end_date` `2026-09-16` -> `2026-09-06`, véspera do ciclo enviado `4c5a69f9b36c` |
| `3530d245ed22` | `7c16117aefd4` | `start_date` `2026-10-23` -> `2026-10-24` |
| `3530d245ed22` | `5ca7adcdcc45` | `start_date` `2026-12-04` -> `2026-12-05` |
| `d735907ca436` | `5e8114de5c79` | `start_date` `2026-10-13` -> `2026-10-15`, depois do ciclo ativo usado `311f71c93012` |

`beforeimagehash` fail-closed dos quatro alvos:
`6bcfc8b3d08068df07978cdf11421a566c92e56e1d50ff86746ec46e11b2f968`.

## Gates principais

- Resolve exatamente 4 ciclos por refs de matricula/ciclo no tenant BN.
- Falha se qualquer alvo ou ciclo anterior estiver superseded, com datas diferentes
  do manifesto, ou se houver residuo da mesma `repair_key`.
- Beatriz: o ciclo ativo precisa continuar sem logs/sessoes e com 11 treinos/116
  exercicios; o substituto precisa existir como `pending`/`sent`, com conteudo.
- Fronteiras futuras: precisam ser futuras em relacao a `current_business_date`,
  sem logs/sessoes/intercycle/archive/carryover.
- Aldylayne: o alvo futuro precisa permanecer vazio e sem dependencias; o ciclo
  anterior usado precisa seguir com 4 treinos/40 exercicios.
- Preserva por hash: matriculas, workouts, logs, sessoes, running plans,
  strength plans e bundles das duas matriculas.
- Pos-reparo esperado: Beatriz fica com zero overlaps atuais/futuros; Aldylayne
  mantém somente o conflito conhecido `b41fde29a9c4` x `311f71c93012`, sem overlap
  envolvendo `5e8114de5c79`.

## Operacao

Dry-run:

```bash
supabase --workdir /Users/macbookpro/Documents/Marquito/sett-your-fitness-hub db query --linked --file /Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc/scripts/repair-bn-beatriz-aldylayne-cycle-overlaps-dryrun.sql
```

Apply executado apos GO independente:

```bash
supabase --workdir /Users/macbookpro/Documents/Marquito/sett-your-fitness-hub db query --linked --file /Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc/scripts/repair-bn-beatriz-aldylayne-cycle-overlaps-apply.sql
```

Rollback, somente se o estado atual ainda bater com os `after_sha256` auditados:

```bash
supabase --workdir /Users/macbookpro/Documents/Marquito/sett-your-fitness-hub db query --linked --file /Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc/scripts/rollback-bn-beatriz-aldylayne-cycle-overlaps.sql
```

## Limites

Nao corrige vigencia financeira, nao reprocessa pagamentos, nao move treinos, nao
supersede ciclos e nao mexe no conflito de cardio/historico da Aldylayne.
