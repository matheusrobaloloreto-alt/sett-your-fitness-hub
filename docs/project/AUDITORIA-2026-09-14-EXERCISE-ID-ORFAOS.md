# Auditoria BN de exercise_id órfãos - 2026-09-14

## Veredito

Auditoria determinística, read-only e pseudonimizada gerada contra produção. Não houve escrita remota, alteração de workouts, deploy, commit ou push.

## Contagens

- Slots ativos afetados: 1424
- IDs únicos ausentes: 293
- Ciclos afetados: 128
- Alunos afetados: 41
- Matrículas afetadas: 41
- Workouts afetados: 438
- Restauráveis: 184
- Candidatos ambíguos: 37
- Sem fonte: 72

## Fontes

- Biblioteca atual: 0 evidências
- Roster de gravação: 201 evidências
- Snapshots/revisões/arquivos do banco: 355 evidências
- Artefatos MFIT locais: 84 evidências

## Tenant e visibilidade

Tenant: `bn-performance-training` (32afc48c82b7). Os slots vêm de workouts atuais não superseded e ciclos visíveis não cancelados/superseded. Visibilidade por janela:

```json
{
  "historical_visible": 743,
  "future_visible": 230,
  "current_active_window": 451
}
```

## Riscos

- IDs ambíguos existem e não podem entrar em lote automático.
- IDs sem fonte determinística exigem curadoria/manual evidence, não restauração.

## Próximo lote seguro

Only IDs classified as restauravel, grouped by deterministic source and canonical_name, with a hard cap of 25 IDs or 150 active slots per batch.

Pré-flight obrigatório:
- BEGIN READ ONLY audit must match this report hash for active slots and evidence.
- Re-query exercise_library by ID and abort if any target already exists with divergent metadata.
- Refuse IDs classified as candidato_ambiguo or sem_fonte.
- Create a before-image manifest with exercise_id, canonical_name, source evidence hashes, affected slot counts, and library insert payloads.

Rollback:
- Delete only newly inserted exercise_library rows whose IDs match the batch manifest and have no new workout_logs/workout_sessions references after apply.
- If any row has post-apply usage, roll back by disabling visibility/marking curated status only through an approved follow-up plan, not by deleting history.
- Keep audit manifest immutable; compare-and-swap on exact inserted row JSON before rollback.

## Artefato completo

O JSON ao lado contém a classificação por `exercise_id`, impacto pseudonimizado, metadados disponíveis e evidências exatas sem nomes de alunos, telefones ou secrets.
