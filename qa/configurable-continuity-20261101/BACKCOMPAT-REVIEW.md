> ATUALIZAÇÃO: a raiz decidiu COLUNA DEDICADA. O risco de JSON novo descrito abaixo é histórico do desenho abandonado. Sem edge deploy necessário se JSON legado permanecer intacto e novo enum ficar só na coluna/envelope; testes adicionais cobrem esse contrato. Nenhuma aprovação de rollout/migration em produção nesta etapa.

# Compatibilidade de leitura — rollout obrigatório antes de persistir o novo campo

Estado: revisão independente local; base 61ab2c8. Sem deploy, consulta externa ou escrita no banco.

## Veredito

Risco de release confirmado no código: contrato antigo estrito rejeita qualquer prescription.expired_workout_behavior, inclusive keep_until_replaced. Leitura do JSON é integral, então o fato de um consumidor precisar só de brand/business/messages não o protege.

A reprodução usa git show 61ab2c8:supabase/functions/_shared/company-product-settings.ts, transpila esse snapshot em memória e exerce normalizer, parseSettingsRecord e readCompanyProductSettings reais. Não confunde o worktree em edição com a versão liberada e não persiste snapshots de dados. Teste em backcompat-release61.test.ts; resultado em backcompat-results.txt.

## Consumidores com caminhos concretos

| Função | Evidência local | Consequência quando lê empresa já salva no novo formato |
|---|---|---|
| public-payment-context | index.ts:296 | Rejeita configurações antes de retornar contexto de planos/brand/business do checkout; catch externo responde erro. |
| asaas-webhook | index.ts:214 | Rejeita antes de apply_paid_payment_lifecycle naquele fluxo de confirmação; não concluir pagamento/lifecycle com sucesso por HTTP recebido. |
| asaas-integration | index.ts:642,931 | Leitura antes de validar parcelas ou aplicar lifecycle; pode interromper esses caminhos. |
| ai-prescribe-workout | index.ts:1505 | Rejeita antes de construir entrada da prescrição; normalizadores adicionais em _shared/prescription/engine.ts:503 e companyPolicy.ts:90 também precisam aceitar o novo campo. |
| push-send | index.ts:68,104 | Lembrete diário e evento new_workout leem settings; exceção pode interromper lote, não só destinatário da empresa alterada. |
| process-automation-sessions | index.ts:344,528 | Convite interciclo e execução de flow leem envelope antes de mensagem. |
| whatsapp-webhook | index.ts:821 | Caminho use_company_template=weekly_contact rejeita antes do envio. Não afirmar que todo webhook falha. |
| public-registration | index.ts:323,606,814 -> _shared/sales-funnel.ts:175,330 | Confirmação de pré-cadastro/convites por funil falham ou ficam marcados como failed segundo tratamento do chamador; cadastro já realizado não deve ser interpretado como atomicamente revertido. |

whatsapp-manager importa o mesmo módulo para validateRenderedMessageParts e tipos (index.ts:3), sem leitura integral desse JSON demonstrada. Não classificá-lo automaticamente como consumidor quebrado pelo novo campo. Dependência textual/transitiva não é prova de execução de normalize.

## Ordem de implantação e rollback

1. Compatibilidade de TODOS os leitores backend dos caminhos acima, incluindo módulos internos que renormalizam policy. Testar leitores novos com registros legados, keep e hide e com os campos originais de mensagens/metodologia preservados.
2. Conferir versões efetivamente implantadas; modificar _shared local não prova atualização das funções liberadas. Nenhum deploy autorizado nesta etapa.
3. Só então migration/validator/default SQL e writer/UI. O instante perigoso pode ser a própria migration se houver backfill, ou o primeiro save de QUALQUER configuração: save_company_product_settings valida o payload e persiste o JSON normalizado inteiro (:201-215 da migration 20261026092601); portanto frontend antigo ainda aberto também pode receber o campo novo injetado pelo servidor.
4. Navegador antigo também usa parser estrito. Entregar leitor novo antes de habilitar escritor ajuda, mas abas/PWA antigas podem permanecer. Requer política de atualização/versão e comportamento visível de recarregar, ou projeção compatível/versionada de leitura. Não alegar que edge-first elimina esse problema.
5. Rollback para leitores estritos antigos após o primeiro save não é seguro. Manter camada de leitores compatíveis mesmo ao desativar a funcionalidade nova. Qualquer limpeza do campo persistido precisaria de plano explícito com CAS e preservação de alterações concorrentes; este QA não a executa nem a autoriza.

## Segurança/persistência a preservar

Enum validado no TS E no SQL. Não corrigir incompatibilidade retornando defaults silenciosos para qualquer JSON inválido ou erro de leitura: isso poderia ignorar mensagens/políticas e liberar keep por falha. Manter allowlist para campos realmente desconhecidos. RPC save continua exigindo actor/admin+membership ou master, _company_id válido, _expected_version, lock por empresa, comparação PT409 e histórico. Preservar revokes de INSERT/UPDATE direto. Nova migration ainda será revisada quando entregue por Pauli.

## Limites

Inventário é de caminhos locais confirmados, não prova das versões de código efetivamente implantadas. Os impactos são condicionais à leitura de registro com o novo campo; não há alegação de incidente já ocorrido. Sem gate da feature até leitores, contrato, persistência e testes finais congelados.
