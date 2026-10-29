# Migration current — revisão independente pré-freeze

Arquivo: `supabase/migrations/20261029122806_company_whatsapp_message_sequences.sql`.

SHA-256 lido antes e depois da revisão/reexecução: `b26eb3f2a2640502cb9bd90a40757a45e8d87a3feade8f05be0a92f6e5f5f438`.

## Veredito

**APROVADO para narrow staging apply somente deste hash**, após freeze explícito informado pela raiz e conferido no handoff `docs/superpowers/plans/2026-10-29-message-sequences-backend.md`. Nenhum bloqueador novo identificado pela revisão estática e pelo contrato PGlite local. Antes da escrita, a raiz deve confirmar dependências/definições do alvo no preflight anexo; ausência ou divergência do validator exige parar e revisar. Qualquer hash diferente invalida este parecer para o arquivo alterado. A aprovação não inclui feature migration, produção, deploy ou envios.

Preflight informado pela raiz, com correção factual posterior: staging com ledger 182, owner fence e validator existentes e bucket `public=false`. `migration_not_yet_applied` consultava a tabela nova `company_message_sequences`; não verificava licença nem `service_company_feature_allowed`. Não há constatação de feature/license migration ausente. Segundo a raiz, os ledgers representam baselines distintos: staging 146 + 36 = 182; produção 235 + 36 = 271. Isso é informação recebida, não verificação remota executada por este QA. O `preflight.sql` local da raiz consulta existência por nome, mas não cobre todas as assinaturas/dependências nem o corpo do validator vigente.

## Verificações concluídas

- Ordem dos locks corrigida: snapshot/claim/authorize travam owner antes de sequence; não permanece a inversão identificada na primeira versão. ACK pós-resposta usa token da parte e não adquire owner; permite registrar recibo aceito sem liberar novo envio por lease expirado.
- Validator usa `CREATE OR REPLACE`, preservando OID e chamadas existentes do CAS. Comparação textual local mostrou que, removendo somente o novo ramo `message_sequences`, o corpo coincide exatamente com o validator da migration `20261028090117_company_prescription_methodology.sql`.
- A migration não substitui defaults, `save_company_product_settings`, lock inicial, CAS ou histórico. Trigger verifica referência existente, empresa, bucket privado, MIME e tamanho antes da escrita. Legado `messages` permanece separado.
- Política nova é restritiva; insert exige admin/master no namespace, update/delete de `message-settings` são impedidos para authenticated. SELECT continua dependente das políticas de tenant preexistentes; não há abertura pública nova. O preflight deve inspecionar as permissivas existentes em conjunto.
- Tabelas têm RLS e privilégios retirados de anon/authenticated; RPCs de snapshot/claim/authorize/ACK são service-only, com search_path vazio. Inspeção de pendências exige `auth.uid()` e staff da empresa.
- Snapshot persiste a primeira versão, serializa criação e reconhece ACKs; ordem de partes bloqueia avanço sobre pendência/incerteza. Criação de snapshot de mídia exige referência autorizada em settings/histórico da empresa. Reuso de snapshot não depende da configuração atual.
- Validação pública limita a dez partes lógicas. Ledger interno aceita vinte para suportar expansão de áudio + texto de legenda no sender atual; não representa vinte partes configuráveis pelo cliente.
- Recovery preserva tentativas legadas incertas; entradas novas in_flight estacionam o owner e pendências seguras podem retomar com lease novo. Nenhuma fila é disparada pelo SQL de apply.

## Reexecução SQL independente

```sh
SETT_TEST_PGLITE_MODULE=/tmp/sett-a25-independent-review/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/message_sequences_contract.test.mjs
```

**Exit 0; 5/5 testes reportados pelo runner** (um teste principal e quatro subtestes), duração 21,99s:

1. Dez eventos/limite/variáveis/push e legado.
2. CAS/histórico e mídia de tenant com escrita atômica.
3. Snapshot imutável, ordem, ACK replay, incerto e grants.
4. Recovery SQL de flow, rotação de lease, rejeição do token antigo e estacionamento de incerto.

Engine PGlite em memória; Auth/Storage/tabelas de apoio sintéticos. Não prova Storage RLS nativo, interleaving de transações em PostgreSQL separado, browser, provider ou produção. Fixture `is_company_staff` retorna true e por isso não deve ser apresentada como teste real de permissão de staff. Nenhum Docker, probe 54322 ou remoto usado.

Hash do teste reexecutado: `c322c5cefa2fb6d955f0518ec084d3aa3ae2eb71143e176ac7affa4567252f24`.

## Itens para liberar o apply estreito

1. Freeze do hash acima recebido da raiz e reconfirmado no handoff do Bacon. Novo hash exige revisão do delta.
2. Raiz confirma assinaturas/tabelas/colunas de apoio e compara definições atuais dos quatro objetos substituídos (validator e dois claims; defaults é dependência lida). Novo arquivo proposto `qa/message-sequences-migration-preflight.review.sql` contém somente consultas read-only; não foi executado remotamente por este QA. Se validator alvo divergir do baseline local, revisar antes de sobrescrever.
3. Raiz preserva definições/ACLs anteriores e executa migration de forma transacional pelo mecanismo nativo, sem ampliar para feature migration ou demais pendências automaticamente.
4. Native Auth/upload/save/CAS/restore e híbrido são aceitação pós-apply da raiz; devem incorporar as correções de evidência/restore registradas em `qa/message-sequences-frontend-harness-review-20261029.md`. Sem essa execução não há aceitação operacional da feature.

A presença de `service_company_feature_allowed(uuid,text)` não foi determinada pelo preflight inicial; a raiz verificará sua assinatura separadamente. Somente se a RPC estiver ausente, o dispatcher/híbrido falha em `company_feature_unavailable`. Essa condição é uma dependência a conferir, não um bloqueio constatado. Não deduzir ausência de licença a partir do ledger ou da falta da nova tabela de sequências. Não contornar com mock de permissão nem aplicar migração ampla sem revisão específica.

Frontend previamente validado com 29/29 permanece um gate separado. Migration final, runtime nativo e browser ainda pendentes; sem conclusão de release.
