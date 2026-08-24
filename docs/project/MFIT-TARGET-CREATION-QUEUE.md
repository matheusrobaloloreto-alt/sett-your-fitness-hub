# MFIT — fila segura de criação e curadoria de alvos

Esta fila transforma os 42 nomes marcados como `NEEDS_TARGET_CREATION` em trabalho auditável. Ela não autoriza criação no banco, alias, importação ou upsert. Todos os itens continuam `human_review_only=true` e `ready_for_upsert=false`.

## Contagens

- 25 variantes que dependem de vídeo;
- 5 candidatos a alvo standalone;
- 2 nomes compostos que devem ser decompostos em exercícios canônicos + método;
- 3 famílias que exigem deduplicação canônica;
- 7 nomes bloqueados por evidência insuficiente.

## Priorização provisória

- `P0`: compostos e nomes ambíguos/bloqueados, por risco de modelagem incorreta;
- `P1`: deduplicação canônica, para evitar novas duplicatas;
- `P2`: standalone e variantes dependentes de vídeo.

Essa ordem não representa frequência. `occurrence_count` permanece `null` porque os três snapshots atuais completos ainda não foram obtidos. Quando os snapshots existirem, a fila deve ser reordenada por ocorrência sem alterar a decisão biomecânica automaticamente.

## Gate de curadoria

1. Gravar o vídeo solicitado no item, incluindo vistas, setup, implemento e amplitude descritos.
2. Revisar taxonomia, lateralidade, suporte, riscos e músculos qualitativos com especialista humano.
3. Para compostos, cadastrar/reusar componentes canônicos e representar combinação somente no método.
4. Para deduplicação, comparar nomes, vídeo e metadata de toda a família antes de criar ou sugerir alias.
5. Executar `node scripts/validate-mfit-target-creation-queue.mjs`.
6. Submeter o lote a QA independente. Somente outro artefato explicitamente aprovado poderá propor escrita.

## Bloqueios atuais

- Snapshots `sett-students`, `mfit-clients` e `mfit-workouts` atuais/completos ausentes.
- Nenhum dos 42 possui ocorrência comprovada nesta rodada.
- Vídeos e evidências operacionais ainda não existem para liberar qualquer item.
