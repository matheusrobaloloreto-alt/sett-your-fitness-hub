# Configuração de continuidade — settings worker

Base: 61ab2c848982feb89a741d258b48596b5b58d4b6, checkout compartilhado sett-joint-fix.
Sem commit/deploy/DDL remoto deste worker. Leituras remotas limitadas a definições SQL e triggers no projeto autorizado. Portal/helpers/hook são de Bernoulli; QA/root WIP preservado.

## Contrato congelado da DDL

Migration criada pela CLI após consultar migration --help e migration new --help:
`supabase/migrations/20261101223102_company_expired_workout_behavior.sql`

SHA256 definitivo: `a5d09feca803492dc82b35add8a252d44e13c0b263679cb9a8104f5fd65a9964`.
Hash anterior 8dc1422... revogado antes de qualquer nova homologação por não proteger auditoria de chamadores SQL com OID legado.
Root informou parecer independente favorável ao hash definitivo e reservará eventual aplicação nativa ao staging ifymocggowdlqqcxugko. Isso não é aplicação ou validação de produção deste worker.

- Coluna text NOT NULL DEFAULT keep_until_replaced nas tabelas company_product_settings e company_product_settings_history. CHECK enum keep_until_replaced/hide_on_expiry.
- JSON settings, defaults SQL e validator JSON legados NÃO recebem a nova chave. Nenhum rewrite de settings, matrícula, ciclo, treino, datas ou histórico de treinos.
- Nome/assinatura do RPC de save preservados: public.save_company_product_settings(_company_id uuid,_settings jsonb,_expected_version integer).
- Campo virtual aceito em _settings.prescription.expired_workout_behavior e removido com #- antes do save legado. Tipo/enum inválidos causam erro e rollback da transação inteira.
- Save legado movido a settings_private, com seus grants a clientes revogados; mantém autorização exata por empresa, validação, advisory lock, CAS, versionamento e audit. Wrapper chama-o ANTES de ler/escrever a política. Não foram concedidos INSERT/UPDATE de tabelas a clientes.
- Omissão do campo por cliente antigo preserva o valor atual. Resposta retorna settings JSON legado + version + expired_workout_behavior no envelope externo. Parser novo projeta a coluna em prescription apenas em memória.
- Mudança explícita da política exige hasPrescription; feature gate e RLS existentes continuam ativos.
- BEFORE INSERT no histórico copia política corrente da empresa, independente do wrapper. Cobre chamada já aquecida ao OID legado e public.adopt_platform_experience_defaults, que lê JSON corrente e chama save. Wrapper ajusta a mesma versão auditada depois de uma mudança explícita dentro da mesma transação.
- RPC mínimo public.get_company_workout_expiry_policy(_company_id uuid) -> {company_id,expired_workout_behavior,version}. Autoriza master, is_company_staff ou existência de students com user_id=auth.uid e company_id exata. Não exige company_members para aluno; não retorna settings JSON. Ausência REAL de linha após autorização retorna keep/version0; NULL/inválido/empresa alheia/sem identidade não vira grant default.
- Funções novas security definer com search_path vazio, referências qualificadas, REVOKE PUBLIC/anon e grant somente authenticated. Políticas/grants das tabelas preservados.

## Contrato para Bernoulli

O hook de aluno deve chamar get_company_workout_expiry_policy com _company_id e validar company_id/enum/version da resposta. Nunca usar data:null do SELECT de company_product_settings como autorização keep: RLS pode ocultar a linha de aluno não member.

Admin/shared: readCompanyProductSettings seleciona settings,version,expired_workout_behavior. parseSettingsRecord projeta a coluna no contrato CompanyProductSettings.prescription.expired_workout_behavior. Envelope legado sem coluna normaliza keep; coluna presente inválida falha. Schema sem coluna falha como migration ausente em vez de inventar default.

## UI

Configurações > Prescrição > Após o vencimento do treino:
- Manter o último treino até o próximo ser publicado (padrão).
- Ocultar automaticamente ao vencer.
Ajuda i explica alcance por empresa, preservação de matrícula/ciclos/histórico e que não publica treino futuro. Save continua por companyId + expectedVersion. Recarregamento reflete a política retornada.

## Compatibilidade e matriz de decisão

| Opção | Abas/edges antigas | Migração/rollout | Decisão |
|---|---|---|---|
| Novo enum persistido no JSON settings | Normalizadores strict antigos rejeitam, inclusive abas antigas; edge-first não elimina abas abertas | Exigiria coordenar bundles e todos os clientes antes de persistir | Rejeitada |
| Colunas dedicadas + wrapper + read RPC mínimo | Settings JSON e payload esperado pelos leitores antigos continuam válidos; save antigo preserva política/audit | DDL aditiva primeiro; frontend depois; nenhum redeploy das 11 edges para esta política | Adotada |

Leitores antigos continuam com o comportamento de sua versão até recarregarem/atualizarem. Compatibilidade de dados não impõe o novo modo hide numa aba executando JS antigo. O backend operacional de sessões não foi alterado.

## Grafo conservador de 11 Edge bundles

Import direto do contrato compartilhado: ai-prescribe-workout, asaas-integration, asaas-webhook, process-automation-sessions, public-payment-context, push-send, whatsapp-manager, whatsapp-webhook.

Import transitivo: public-registration via _shared/sales-funnel; ai-coach-pack via _shared/prescription/catalogVolume -> volumeRules -> types; ai-validate-prescription via types e demais helpers de prescrição.

O grafo inclui referências de tipo; não equivale a afirmar que os 11 executam o normalizador em runtime. sales-funnel efetivamente lê/normaliza settings; outros consumidores também usam _shared/message-sequence, communication-policy, prescription/companyPolicy e engine. Root possui o inventário em output/configurable-continuity-20261101.private/edge-consumers.json. Com colunas dedicadas, os leitores publicados que selecionam settings,version não encontram chave desconhecida e não precisam de redeploy para este contrato.

## Validação própria

- RED antes da implementação: suites de contrato/UI falharam pelos campos/controle ausentes.
- settings-column-contract.mjs: 16 checks PASS executando migration real, validator/save reais locais e parser exato antigo do commit 61ab2c8 em PGlite isolado.
- Inclui first-save/version0/default, old envelope, strip da chave virtual, persistência/audit da mesma CAS version, old-client omission mantendo hide, warmed pre-migration adoption + helper legado direto, rollback invalid enum/types, stale CAS, foreign admin/trainer/student write denial, no direct grants/private EXECUTE, native SQL RLS do aluno SEM company_members, company alheia/sem auth negados, default somente para linha realmente ausente, staff/master e feature gate.
- Script/resultados: qa/configurable-continuity-20261101/settings-column-contract.mjs e settings-column-contract-results.txt.
- Fixture usa primitivos auth/tenant/entitlement sintéticos; os triggers comerciais/media existentes foram inspecionados mas não reproduzidos integralmente. Native staging/browser/hosted Auth ficam com root/QA.
- Teste UI novo passou isolado: edição, ajuda i, save com empresa/version e reload. Log /tmp/sett-expiry-settings-ui-policy.log.
- Regressões UI/contrato: 87/87 PASS em seis arquivos no log /tmp/sett-expiry-settings-final-scoped.log, copiado para settings-worker-vitest-results.txt. Config própria de QA mantém assertions e aumenta somente timeouts para carga concorrente do host; tentativas com timeouts padrão tiveram falhas de timeout.
- ESLint UI/testes: limpo em /tmp/sett-expiry-settings-ui-lint.log. Shared file tem um erro HERDADO no-control-regex na linha 30, idêntico em HEAD e WIP, comprovado por /tmp/sett-expiry-settings-baseline-lint.log e /tmp/sett-expiry-settings-lint.log. Linha não alterada.
- git diff --check passou. TSC/build global não executados pelo worker para evitar disputar o gate do root.

## Ordem de rollout e rollback

1. QA independente revisa o hash congelado; executar migration no staging isolado e testar RPCs como admin, aluno sem membership, foreign e aba antiga. Root controla o staging.
2. Antes de qualquer rollout de produção: aprovação específica do root/usuário e gates independentes. Este worker não tem autorização de DDL/deploy de produção.
3. Ordem técnica é DDL/RPC/colunas antes do frontend. Fazer readback de policy e da versão, com settings JSON ainda sem chave virtual. Não exige edge-first. Qualquer redeploy futuro de Edge que empacote este shared novo também deve ocorrer após a DDL, pois o shared novo seleciona a coluna dedicada.
4. Frontend novo usa projeção de coluna para admin e RPC mínimo para aluno. Verificar os dois comportamentos e troca de tenant/reload; saves antigos precisam continuar preservando hide e audit.
5. Rollback frontend primeiro. Reter colunas/wrapper/trigger e audit para clientes novos já abertos; não apagar nem reescrever settings/histórico para rollback.

## Ownership

Arquivos de implementação deste worker: supabase/functions/_shared/company-product-settings.ts; src/pages/admin/ProductSettings.tsx; src/components/admin/settingsHelpRegistry.ts; migration acima. Testes diretos: src/lib/companyProductSettings.test.ts e src/pages/admin/ProductSettings.test.tsx; artefatos próprios em qa/configurable-continuity-20261101/settings-* e este handoff. Sem alterações em fontes de portal/hook, locks, SW ou secrets.

## Freeze de fontes / homologação reportada pelo root

Root informou aplicação única bem-sucedida da DDL no staging ifymocggowdlqqcxugko e início de testes reais Auth/REST; recibo sob controle do root em output/configurable-continuity-20261101.private/stage-migration-receipt.json. Não é ação remota deste worker e não equivale a produção. Fontes de implementação congeladas para TSC/build final. Manifest próprio: settings-worker-freeze.json. Não editar implementação sem coordenar um achado real.

Verificação final: todos os seis hashes do manifest continuam idênticos após 87/87 PASS; nenhuma fonte de implementação foi alterada após o freeze.
