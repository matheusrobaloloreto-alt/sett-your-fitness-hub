# QA independente — sequências multimídia por evento

## Estado e limites

Inspeção estática local em 2026-10-29. Workspace `sett-load-save-release-20260928`, branch `codex/sett-self-service-local-20261026`, HEAD `45b6c3af4f99766c69bc9f1dbb8bd177b6ce634c` confirmado. Working tree extenso e concorrente, preservado. Este arquivo é a única escrita desta análise; nenhum arquivo de implementação foi alterado. Nenhum teste executado nesta fase; aguarda sinal da raiz para revisar o candidato integrado e reexecutar independentemente. Nenhum remoto, envio, deploy, credencial ou conexão de produção consultado.

As observações abaixo descrevem os arquivos lidos durante a integração, não defeitos atribuídos ao candidato final. Na leitura inicial, `rg message_sequences src supabase/functions supabase/migrations/2026102*` não encontrou implementação. Arquivos podem mudar enquanto os executores trabalham. Referências de linha abaixo são âncoras da leitura, a reconfirmar no snapshot final.

Contrato recebido: `message_sequences` opcional, por evento WhatsApp, até 10 partes `{id,type,text,media?:{bucket,path,mimeType,fileName}}`; texto/áudio/vídeo/imagem; adicionar/remover; preservar `messages` legado. Os quatro campos push title/body continuam strings.

## Inventário obrigatório de consumidores

| Evento/caminho | Arquivos e âncoras concretas | Verificação necessária |
| --- | --- | --- |
| Editor, leitura e CAS | `src/pages/admin/ProductSettings.tsx` (`MESSAGE_LABELS`, load/save, `companyRef`, `saveEpoch`); `src/lib/companyProductSettings.ts`; `supabase/functions/_shared/company-product-settings.ts` (`normalizeCompanyProductSettings`, `parseSettingsRecord`) | Optional não pode ser rejeitado, descartado ou materializado como override inesperado. Upload/salvamento tardio não pode contaminar outra empresa. |
| SQL e histórico | `supabase/migrations/20261026092601_company_product_settings.sql:180` (`save_company_product_settings`); validators posteriores em `supabase/migrations/` | Migração aditiva deve atualizar o validator efetivamente vigente, preservar lock de insert inicial, PT409 e histórico atômico. Não basta alterar TypeScript. |
| Pré-cadastro | `supabase/functions/_shared/sales-funnel.ts:264` (`sendPreRegistrationConfirmation`); `supabase/functions/public-registration/index.ts` | Ledger de Lead separado do ledger de aluno; ambos precisam ser considerados. |
| Fiscal, pagamento, avaliação | `supabase/functions/_shared/sales-funnel.ts:155` (`sendFunnelWhatsAppMessage`); callers `public-registration/index.ts:603,717`, `asaas-integration/index.ts:989`, `asaas-webhook/index.ts:266` | Eventos `fiscal_invite`, `payment_link`, `assessment_onboarding`; preservar valores de link/prazo/data por ocorrência. |
| Semanal: worker | `supabase/functions/process-automation-sessions/index.ts:491,539` | Aplicar central somente no opt-in `use_company_template === 'weekly_contact'`; preservar grafos livres, consentimento, identidade, lease e ACK. |
| Semanal: webhook síncrono | `supabase/functions/whatsapp-webhook/index.ts:784` | Caminho distinto do worker; não pode continuar enviando somente o texto legado. Preservar ocorrência inbound e reconciliação. |
| Interciclos | `supabase/functions/process-automation-sessions/index.ts:273,348,357` | Delivery/invite/opt-in e vínculo de ciclo preservados; ledger por parte sem duplicar convite nem alterar token no retry. |
| Primeiro contato | `src/pages/admin/RegistrationManager.tsx:499,1090`; `src/lib/studentChat.ts:14` | Preview de Lead e ação de aluno devem carregar a sequência inteira sem envio automático. |
| Fiscal/pagamento/avaliação manuais | `src/pages/admin/RegistrationManager.tsx:979,1026,1113,1125,1187` | Existem chamadas diretas a `draftCompanyEventMessage`, além de `openStudentChat(messageEvent)`; migrar apenas o segundo perde consumidores. |
| Anamnese manual | `src/pages/admin/AnamnesisManager.tsx:114`; `src/lib/studentChat.ts` | Chamada direta retorna string hoje; garantir transporte das mídias ao painel. |
| Renovação próxima/pendente | `src/pages/admin/AdminDashboard.tsx:357`; `src/components/admin/AtRiskStudents.tsx:155`; `src/pages/admin/RegistrationManager.tsx:1625` | Ambos eventos via `openStudentChat`, conservar destino e link da ocorrência. |
| Transporte e envio manual | `src/lib/whatsappChatPanel.ts:7`; `src/lib/whatsappChatRequest.ts:17`; `src/pages/admin/WhatsAppChat.tsx:1198,1600` | Envelope/prefill atualmente textual; sequência deve sobreviver rota fallback, nonce, add/remove, envio parcial e confirmação humana. |
| Storage/envio mídia | `supabase/functions/whatsapp-manager/index.ts:1233`; `supabase/functions/_shared/whatsappMedia.ts:65`; `src/lib/messageTemplateMedia.ts`; `src/lib/whatsappMediaUpload.ts` | Fontes atuais são chat/student/template-upload. Template rápido de `message_templates` é um domínio separado da configuração de evento. |
| Push (permanecer texto) | `supabase/functions/push-send/index.ts:75,108`; `supabase/functions/_shared/communication-policy.ts:26` | `daily_reminder_title/body`, `new_workout_push_title/body` não entram em sequências; nem envio WhatsApp derivado de push. |

## Riscos para bloquear aceite se persistirem no candidato

1. **P1 — consumidores textuais esquecidos.** `draftCompanyEventMessage` retorna `Promise<string>` e `prefillMessage` é string. Acrescentar editor e sender no funil não integra anamnese, primeiro contato e renovação manuais. Worker e webhook também precisam de cobertura independente. Confirmar comportamento para sequência só de mídia: não pode sumir por guard `message.trim()`.
2. **P1 — retry parcial e snapshot.** O funil lido mantém status por evento e relê settings no retry; um loop sobre partes pode duplicar ACKs e misturar versões após edição. Worker possui `beginDispatch`/`authorizeDispatch`/`acknowledgeDispatch` e lease (`_shared/automation-recovery.ts`), mas sua chave atual é por nó/convite. Exigir snapshot durável de partes ordenadas, texto renderizado, referências de mídia, settings version, tenant e destinatário; identidade da parte por ocorrência estável. Preservar revisão humana para timeout/ACK desconhecido. Não prometer exactly-once no provedor sem suporte desse provedor.
3. **P1 — fronteira privateStorage.** O `send-media` lido não aceita URL arbitrária: valida referência, tenant, metadados e faz assinatura server-side. A futura fonte de mídia de evento precisa provar vínculo com configuração autorizada/snapshot autorizado, não apenas prefixo `companyId/`. Não reutilizar permissões de anexos de chat para ler qualquer objeto da empresa. Conferir configuração do bucket como privado e RLS real; tipos TS e testes SQL simulados não provam Storage Auth nativo.
4. **P1 — remoção/overwrite de objeto em uso.** Remover parte do rascunho não deve excluir mídia usada na versão salva ou snapshot em execução. Impedir sobrescrita do mesmo path; sumiço/403/MIME divergente deve falhar explicitamente, nunca degradar para sucesso texto ou bucket público.
5. **P1 — validação/CAS divergentes.** TS e SQL devem concordar em shape, limites, IDs e variáveis por evento; payload inválido deve manter versão/histórico. CAS sobre o documento completo não pode apagar `messages`, outra sequência ou outra seção. Conflito preserva o rascunho; não salvar silenciosamente após recarregar.
6. **P1 — drift de tenant no upload e retry.** Upload iniciado em A e finalizado após selecionar B não pode anexar path de A a B; fila/retry não pode herdar empresa ou destinatário atuais da UI. Revalidar acesso/feature/identidade/consentimento na fronteira de envio de cada parte.
7. **P2 — compatibilidade das ausências.** Diferenciar campo ausente, evento ausente, array vazio e remoção da última parte. O pedido não define se `[]` significa desativar ou voltar ao legado: o candidato precisa adotar semântica explícita e testada. Sequência inválida nunca deve ser ignorada silenciosamente. Quatro push continuam texto.

## Matriz de aceitação (a executar depois do sinal da raiz)

| ID | Ensaio sintético/local | Resultado exigido / arquivo-base |
| --- | --- | --- |
| A01 | Abrir/salvar settings antigos sem `message_sequences`; comparar `messages` e outras seções antes/depois | Legado intacto, fallback idêntico. `src/lib/companyProductSettings.test.ts`, `src/pages/admin/ProductSettings.test.tsx`. |
| A02 | Configurar as 10 partes em cada um dos 10 eventos WhatsApp; tentar 11, ID repetido, tipo desconhecido, push como evento de sequência | 10 aceitas; inválidos rejeitados em TS e SQL sem incremento/histórico. `src/lib/companyMessageVariables.test.ts`, nova fixture SQL da migração integrada. |
| A03 | Texto vazio/whitespace, caption vazio em mídia, variável válida/inválida por evento, chaves extras, media ausente/indevida, null e valores não array | Paridade TS/SQL, política de caption e ausência explícita. Não presumir que texto vazio em mídia deva falhar. |
| A04 | Adicionar/remover tipos e última parte; salvar/reabrir, alternar evento e empresa durante upload/save atrasado, conflito PT409 | Ordem/IDs persistem; sem upload tardio em tenant errado; draft mantido no conflito. `ProductSettings.review.test.tsx`, `ProductSettings.test.tsx`. |
| A05 | Tenant A tenta ler/upload/assinar/enviar referência de B, bucket não permitido, traversal/URL/percent-encoding, prefixo correto mas objeto fora do evento | Zero chamada ao provedor; autorização server-side. `_shared/whatsappMedia.test.ts`, nova suíte de sequência, futura Storage Auth local nativa. |
| A06 | Metadados falsos, arquivo inexistente, tamanho zero/acima do limite, MIME incompatível, overwrite e objeto removido | Falha explícita antes da parte; referências privadas e sem URL assinada persistida na configuração. |
| A07 | Texto → áudio → vídeo → imagem em cada consumer; sequência só de mídia; legado sem sequência | Ordem real verificada por chamadas mockadas e ACK externo por parte. `companyFunnelMessages.test.ts`, `process-automation-sessions/index.test.ts`, testes de webhook e painel. |
| A08 | ACK 1, falha comprovada antes de enviar 2, editar/remover/reordenar settings, retomar | P1 não repete; P2/P3 usam snapshot original; próxima ocorrência usa nova versão. Novo teste de retry da sequência. |
| A09 | Timeout após POST, HTTP 503 potencialmente aceito, 200 sem ID, ACK salvo e projeção DB falha, ACK DB falha | Incerto exige reconciliação, nenhum retry automático do incerto; falha de projeção não reenvia ACK. `communicationsReconciliation.test.ts`, `qa/self-service-dispatcher.test.ts`. |
| A10 | Duas execuções concorrentes; lease perdido entre partes; callback tardio; assinatura/provider lento | Uma identidade durável por parte; worker antigo não avança nem completa ocorrência. `qa/self-service-dispatch-guards.test.ts`, testes SQL locais de ledger. |
| A11 | Abrir anamnese/primeiro contato/fiscal/pagamento/avaliação/renovação no painel, navegar pela rota fallback; reenviar após falha parcial | Todas as partes visíveis em rascunho; zero POST ao preparar; confirmação explícita conserva ACKs. `whatsappChatRequest.test.ts`, `whatsappChatPanel.test.ts`, testes do componente integrado. |
| A12 | Worker semanal opt-in vs grafo livre; webhook semanal; interciclo cancelado, sem opt-in, sem consentimento, identidade alterada | Mesmas regras de segurança pré-existentes; fluxo livre não substituído pelo central; sem envio após revogação. |
| A13 | Quatro push, render de variáveis, version 0 e migrations anteriores | Somente title/body texto; nenhum parser/loop multimídia altera push. `communicationPolicy.test.ts`, testes de push. |
| A14 | Dois saves simultâneos esperam versão 0 e depois N | Um vencedor, um PT409, um registro de histórico por versão; nenhuma escrita parcial. `supabase/tests/company_product_settings_local.test.mjs` (PostgreSQL nativo local; inspecionar alvo antes). |

## Reexecução independente e integridade

Após aviso da raiz: confirmar HEAD/branch e lista exata de arquivos integrados, registrar hashes antes/depois da revisão, separar diff da demanda do dirty anterior. Não usar `git diff HEAD` integral como se fosse uma mudança única. Revisar contrato e segurança em passes separados. Se arquivos mudarem durante o gate, invalidar o resultado afetado e repetir somente esse trecho.

Começar pelos testes locais acima, com Supabase/provedor mockados e sem leitura de credenciais. Exemplo de subconjunto existente (a revisar antes de executar):

```sh
npm run test -- src/lib/companyProductSettings.test.ts src/lib/companyMessageVariables.test.ts src/lib/companyFunnelMessages.test.ts src/lib/communicationPolicy.test.ts src/lib/communicationsReconciliation.test.ts src/lib/whatsappChatRequest.test.ts src/lib/whatsappChatPanel.test.ts src/pages/admin/ProductSettings.test.tsx src/pages/admin/ProductSettings.review.test.tsx
```

Acrescentar as suítes novas indicadas pelos executores e revisar seus mocks de rede. SQL local exige inspecionar endpoint/fixture e usar banco efêmero próprio; nunca confiar em variável herdada que possa apontar remoto. Não rodar scripts `live`, `deploy`, `release`, nem `qa/assert-dispatch-idle.mjs` sem inspecionar seus efeitos/alvo. Build escreve `dist`; coordenar com a raiz ou usar saída isolada, pois há integração concorrente. Nenhuma dessas verificações foi executada nesta entrega de inventário.

Resultado atual: inventário e roteiro de aceitação prontos; feature integrada, diff final, runtime e Storage nativo ainda não avaliados. Este documento não aprova release.
