# Política de reparos de dados SETT/BN

Status em 2026-09-10: decisão operacional aplicada ao repositório; não altera banco, deploy ou histórico remoto.

## Veredito

Reparos dirigidos a linhas, pessoas, matrículas, pagamentos ou datas específicas **não entram no fluxo automático normal de migrations**. Eles são operações explicitamente gateadas e ficam em `scripts/`, acompanhados de auditoria somente leitura, before-image, apply, rollback e teste de contrato.

Migrations já aplicadas não são reescritas nem removidas. Elas permanecem byte a byte iguais ao ledger remoto, com a versão remota exata, para que histórico local e remoto continuem reconciliáveis.

## O que pertence a `supabase/migrations/`

- schema portátil, constraints, índices e funções;
- RLS, grants e políticas portáveis;
- mudanças reproduzíveis em ambiente vazio ou novo tenant;
- migration histórica de reparo já aplicada, preservada com versão e bytes remotos exatos.

## O que pertence a `scripts/`

- reparos de dados por tenant ou referências pseudônimas;
- reconciliação de vigência, cobrança, matrícula ou conteúdo real;
- operações que dependem de estado vivo, ordem temporal, identidade, aprovação ou evidência externa.

Cada reparo novo deve ter:

1. auditoria agregada read-only, sem PII;
2. escopo determinístico e contagem esperada;
3. before-image privado e hash;
4. apply transacional, idempotente/fail-closed, com lock e pós-validação;
5. rollback que valida o after-image antes de tocar dados;
6. tratamento explícito de campos controlados por trigger, como `updated_at`;
7. ensaio fora de produção e QA independente;
8. execução manual separada do deploy de migrations;
9. relatório de estágio: local, commit, integração, staging e produção.

## Exceção histórica de 09/09/2026

Os reparos `reconcile_bn_legacy_enrollment_terms` e `reconcile_bn_remaining_legacy_terms` já foram aplicados em produção como migrations. Por isso, seus corpos permanecem no diretório de migrations e foram renomeados para as versões registradas no ledger remoto: `20260909230806` e `20260909231218`. A regra nova vale para os próximos reparos; não se falsifica o histórico passado para simular portabilidade.
