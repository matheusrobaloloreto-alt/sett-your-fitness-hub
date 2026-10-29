# Freeze — consumidores manuais de sequências WhatsApp

Registro UTC: 2026-10-29T13:16:16.440351+00:00

Workspace: `/Users/macbookpro/.codex/worktrees/sett-load-save-release-20260928`
Branch: `codex/sett-self-service-local-20261026`
HEAD: `45b6c3af4f99766c69bc9f1dbb8bd177b6ce634c`

Os dez arquivos abaixo estão congelados por este executor para o QA independente. Nenhum patch foi reaplicado; a integração ocorreu no workspace compartilhado. O dirty anterior foi preservado. Este registro não congela nem assume ownership dos arquivos de Bacon, Mill ou QA.

## Manifesto SHA-256

Paths relativos ao workspace acima; algoritmo SHA-256 sobre os bytes atuais.

```text
158ed4cc8d42b7b46018a7b47e5a19404e93f2578eb9f6acec85b5ed3b8ed375  src/lib/studentChat.ts
966951c0ff9af8d3840b72f1906b33c686d010b104a7a19c31b768a8fe38f683  src/lib/whatsappChatPanel.ts
edd8ba052ae24dc8b046dfcddf49ba0b63056ab9351589a044b0079ab7e9aba5  src/lib/whatsappChatRequest.ts
cbff19109aee86fb38f73c8a906a90d40b8af2ada866d1442ba9440f03f48533  src/pages/admin/WhatsAppChat.tsx
2b170a3f0e012e9022d006777375ac2e4eee58f7f9b3168ffbdd8c205a58250c  src/pages/admin/RegistrationManager.tsx
1191e09dda33b386b699da098281673e077896af2a6a06eb3b9517a34b2827b2  src/pages/admin/AnamnesisManager.tsx
75cf7ee562557fcdbcf1954ca3dcd9fe7a4632af8690ef8a53d5109446976752  src/lib/manualEventSequence.test.ts
20cb1e9e7177db0baab01a2c530e76a14bb7015045a657889bfce67d5d6c004d  src/pages/admin/WhatsAppChat.sequence.test.tsx
4c9cc13591223dda98cf1854c81b12c451321d98e201c7027e6f7bbb12e5b8ce  src/lib/whatsappChatPanel.test.ts
0fb199ef92fd8a7f3c1d74759ec80909d61677fc091eabdf55fecb6f962f1c27  src/components/admin/LeadFiscalConfirmation.test.tsx
```

## Evidência local anterior ao freeze

- Seis arquivos de testes: 40/40, execução serial final em `/tmp/sett-manual-sequence-final6.log`.
- Fiscal: 26/26, execução isolada em `/tmp/sett-manual-sequence-lead-serial.log`. A rodada paralela anterior teve timeouts; não foi contabilizada como aprovação.
- TypeScript final: exit 0, `npx tsc --noEmit --pretty false -p tsconfig.app.json`, log `/tmp/sett-manual-sequence-types-final.log`.
- Lint focado final: exit 0, sem saída, `/tmp/sett-manual-sequence-lint-final2.log`.
- Diff-check dos seis arquivos de implementação: exit 0.
- Patch incremental contra as cópias do início: `/tmp/sett-manual-sequence-consumers.patch`, somente para inspeção. NÃO aplicar novamente.

## Contrato e gate restante

A revisão transporta todas as partes tipadas e só envia após confirmação explícita via `whatsapp-manager`, ação `send-message-sequence`, com `parts`, `requestId` estável, `companyId`, `chatId`, `studentId`, `remoteJid` e `signMessages`. Após início, congela partes e assinatura. ACK completo exige `success:true`, `sequenceComplete:true` e o mesmo `requestId`; `sequence_not_completed` retoma o mesmo snapshot, enquanto resultado desconhecido/`dispatch_uncertain` bloqueia repetição. `chatId` no ACK já é consumido para abrir conversa recém-criada.

A raiz informou que Bacon corrigirá a criação/resolução validada de conversa quando não há chat. Na leitura deste executor antes do freeze, o endpoint ainda exigia chat existente. Este documento não atesta a correção posterior nem o QA integrado. Nenhuma operação remota, deploy ou envio real foi executado.
