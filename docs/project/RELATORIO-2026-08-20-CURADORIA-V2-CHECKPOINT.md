# SETT/BN — checkpoint da curadoria v2

**Data:** 2026-08-20
**Modo:** leitura do Supabase canônico + geração offline sanitizada. Nenhum dado remoto foi alterado.

## Resultado

O reconciliador v2 foi implementado e executado contra o catálogo vivo. Os **926/926 exercícios** foram classificados por `exercise_id`: 749 permanecem nominalmente iguais aos pacotes v1, 177 são novos, e não houve item ausente, conflito de ID ou mudança nominal silenciosa.

As três trilhas permanecem independentes e fail-closed:

- 716 exercícios com alvo único aguardam revisão técnica;
- 489 exercícios sem contraindicação e sem tag de dor aguardam decisão `explicit_none|has_metadata|needs_more_info`;
- 72 clusters, cobrindo 179 exercícios com vídeo compartilhado, aguardam QA editorial e de playback;
- nenhum item foi marcado automaticamente como aprovado ou `ready_for_upsert`.

## Artefatos

Os artefatos sanitizados estão em `docs/prescription/curation-v2/`:

- snapshot completo do catálogo, targets, metadata e mídia;
- reconciliação 926/926;
- filas P0/P1/P2/P3;
- clusters de vídeo;
- resumo determinístico da execução.

Distribuição inicial da fila única: P0 13, P1 213, P2 628 e P3 1. A prioridade serve apenas para ordenar revisão; não aprova biomecânica, segurança ou mídia.

## Validação

- `node --test scripts/prescription/generate-library-curation-v2.test.mjs`: 2/2;
- snapshot: 926 exercícios e `contains_pii=false`;
- reconciliação: 926 linhas vivas, zero divergência silenciosa;
- clusters de mídia: 72 clusters / 179 exercícios;
- varredura local: zero e-mail, telefone, JWT, service-role ou segredo em query string;
- zero `ready_for_upsert=true`.

## Próximo gate

Revisar o P0 por biomecânica/cinesiologia e QA editorial independente. Somente decisões explícitas, com evidência e segundo revisor, podem gerar manifests aprovados. Escrita em staging ainda depende de backup, validator, return guard, SQL noop e rollback; produção permanece bloqueada até o gate completo.
