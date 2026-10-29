# QA independente — continuação, manager novo contato e recibos finais

Data: 2026-10-29. Workspace `/Users/macbookpro/.codex/worktrees/sett-load-save-release-20260928`; branch `codex/sett-self-service-local-20261026`; HEAD `45b6c3af4f99766c69bc9f1dbb8bd177b6ce634c`, reconfirmado. Working tree dirty anterior preservado. Revisão direta independente dos executores; controllers anteriores indisponíveis. Na primeira rodada, única escrita no repositório foi este documento. Após autorização explícita de ownership, foram alterados também o fixture/teste de integração do manager e criado `qa/message-sequences-jid-regression.test.ts`, conforme adendo final. Nenhuma fonte de produção, migration, harness da raiz ou manifesto foi alterado por este QA. Nenhum remoto, produção, deploy, envio real, Docker ou configuração de ambiente executados.

## Veredito

**Atualização após correção da raiz: P2 fechado e delta manager aprovado localmente no hash `51c8de430728705378390991650871aa8e076503a6ef775dae9f7a4077077985`.** Rodada independente: 67 testes existentes + 4 próprios passaram, incluindo as duas regressões persistidas e duas negativas de identidade. Os recibos de staging/native/híbrido seguem aceitos nos limites abaixo. O relato original da falha é preservado como histórico; ver adendo ao final para o estado vigente e a pendência de atualizar o manifesto do manager.

Skills aplicadas: `marquito-orchestrator-root` e `matt-skills-curated:code-review`, adaptadas ao escopo explícito de QA do dirty frozen, sem implementação. Não houve revisão de todo o diff anterior contra HEAD nem nova execução das combinações já aprovadas de 89 backend / 29 frontend.

## Especificação — achado acionável

### [P2] Novo contato encontra/cria uma conversa válida, mas a comparação literal de JID impede o envio

Local principal: `supabase/functions/whatsapp-manager/index.ts:1291`. Contexto: lookup por variantes em 1264–1266, insert pelo destinatário verificado em 1270–1272 e snapshot/provider target pelo body em 1300–1302.

Contrato violado: follow-up do plano backend, “contact without an existing chat”, promete resolver variantes de destinatário direto no tenant/instância correto e reutilizar a conversa validada. `resolveVerifiedWhatsAppRecipient`/`sameWhatsAppRecipient` já reconhecem a equivalência brasileira e preservam a rota persistida do provider quando validada.

1. Request com `chatId:null` e JID sintético `5548999990001@s.whatsapp.net`; existe uma conversa na mesma empresa/instância com `554899990001@s.whatsapp.net` (forma legada sem nono dígito). `directWhatsAppJidVariants` inclui essa conversa e o lookup a retorna. `beforeSend` exige `chat.data.remote_jid === body.remoteJid`, então retorna **422 `sequence_not_completed`**, zero POSTs simulados e nenhum snapshot. Retomar com o mesmo rascunho reproduz o bloqueio.
2. Request com `chatId:null`, aluno válido e JID legado `554899990001@s.whatsapp.net`; telefone persistido do aluno é `+55 48 99999 0001`, BR. A validação aceita a identidade e insere a conversa com JID canônico `5548999990001@s.whatsapp.net`. A mesma comparação literal a torna inutilizável para esse request: **422**, conversa já criada, zero POSTs, nenhum snapshot.

Severidade: P2 funcional; não foi observada entrega indevida nem bypass de tenant. O fail-closed impede enviar, mas quebra contatos legítimos aceitos pelo próprio resolvedor.

Próxima ação para o executor/raiz: fixar a identidade/routa verificada após resolução da conversa e usá-la consistentemente no snapshot/envio; manter o fence contra mudança real de destinatário, aluno e instância. Não basta remover o fence ou substituir indiscriminadamente todas as comparações por normalização. Acrescentar ambos os casos de regressão e manter requestId/chatId estáveis no retry. Este QA não implementou a correção.

Reprodutor: `/tmp/sett-independent-newchat-alias-20261029.test.ts`, SHA-256 `b95726b3a3e4c81f7d330085f0fdc2e1f8e5ad6c26230b01ec721cc633a82a24`. É cópia isolada do harness de assinatura existente, com SOURCE apontando explicitamente para o handler real do workspace; somente os dados sintéticos passam a BR e o fake DB passa a devolver/preservar o JID efetivamente armazenado. Duas asserções novas esperam 200/uma entrega simulada. Nenhuma substituição do handler ou helpers de identidade.

```sh
deno test --cached-only --no-lock --allow-read --allow-env --filter '/manual new contact|independent:/' /tmp/sett-independent-newchat-alias-20261029.test.ts
```

Resultado: **6 controles existentes passaram, 2 regressões novas falharam, 61 testes filtrados**. Log `/tmp/sett-independent-newchat-alias-controls-20261029.log`. Os seis controles pertencem aos 67, não são cobertura adicional somável. As duas falhas possuem a mesma causa e constituem um único finding.

## Padrões e limites dos testes

Sem outro finding novo comprovado de padrões/tenant/imutabilidade no trecho revisado. Lookup usa empresa + instância + variantes; conflito 23505 relê o mesmo escopo; erro/ambiguidade fecha antes do envio; não há update de `student_id` para reassociar conversa existente. A suíte original contém os seis casos novos anunciados pelo executor e eles passaram no runner independente.

`WhatsAppChat.sequence.test.tsx` monta `EventSequenceReview`, não toda a página com `handleSendEventSequence`. Seus quatro testes comprovam revisão, confirmação explícita, bloqueio visual e preview; não constituem prova integrada de envio para novo contato/consumo de chatId. `manualEventSequence.test.ts` testa transporte e classificação de ACK. A leitura estática confirma consumo de chatId após sucesso no handler da página; browser continua sendo gate da raiz. A UI preserva rascunho/requestId quando recebe `sequence_not_completed`, mas isso não resolve a divergência literal do finding.

## Reexecução focada independente

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Manager completo, incluindo seis testes de novo contato | **67/67** | `/tmp/sett-independent-manager-continuation-20261029.log` |
| Rascunhos manuais, transporte, chat review e fiscal | **66/66**, sete arquivos | `/tmp/sett-independent-manual-continuation-20261029.log`; 59,22s |
| Typecheck offline do manager real | **passou** | `/tmp/sett-independent-manager-check-offline-20261029.log` |
| Diff whitespace do manager | **passou** | `git diff --check -- supabase/functions/whatsapp-manager/index.ts` |
| Regressões próprias de variantes + controles | **6 passaram / 2 falharam** | log e reprodutor acima |

```sh
deno test --cached-only --no-lock --allow-read --allow-env supabase/functions/whatsapp-manager/whatsappSignature.integration.test.ts
./node_modules/.bin/vitest run src/lib/manualEventSequence.test.ts src/lib/whatsappChatRequest.test.ts src/lib/communicationsLegacyDrafts.test.ts src/lib/studentChat.test.ts src/lib/whatsappChatPanel.test.ts src/pages/admin/WhatsAppChat.sequence.test.tsx src/components/admin/LeadFiscalConfirmation.test.tsx --fileParallelism=false
deno test --no-run --cached-only --no-lock supabase/functions/whatsapp-manager/index.ts
```

Deno 2.9.4. Não foi concedido `--allow-net`; as dependências Deno foram limitadas ao cache e o harness usa transporte sintético. Tentativa inicial de `deno check --cached-only` foi rejeitada pelo parser, porque essa versão não oferece a flag nesse subcomando; não é falha do produto. O comando equivalente `deno test --no-run --cached-only --no-lock` acima concluiu o typecheck sem executar o handler. Vitest usou binário já instalado, sem instalação/download ou browser.

## Hashes e fronteira do candidato

- Manifesto `docs/superpowers/plans/2026-10-29-message-sequences-backend-files.sha256`: **14/14 OK**, conferido antes e depois dos testes. Manager atual `2a967b4e372b45d85834bbccc25bf9beeca6c813034dd099e9efd59cb9fd243f`; teste manager `a43d53b06ce5ad48893e7a54c0aef34b20ecbb207c6c297e8a7b417553e23d81`.
- Freeze manual `qa/message-sequences-manual-drafts-freeze-20261029.md`: **10/10 hashes conferidos**, todos iguais. Não houve repetição do lote frontend 29 já aprovado.
- Sender `086b72a31cff551e46c6b864637f0ba5954e503680516701f98216c7ce311562`; migration `b26eb3f2a2640502cb9bd90a40757a45e8d87a3feade8f05be0a92f6e5f5f438`: iguais aos dois recibos nativos atuais.
- Os hashes são de arquivos inteiros com dirty anterior; não atribuem todo o diff à feature. A árvore continua no mesmo HEAD e não houve commit/push por este QA.

## Readback independente dos recibos apresentados pela raiz

Leitura de arquivos locais e inspeção dos harnesses, **sem repetir consultas remotas ou executar novamente os harnesses**. Os recibos são evidência de execução da raiz e não um atestado deste QA de acesso remoto atual. Eles fixam hashes do sender/migration, não do handler manager; portanto o híbrido não cobre o finding acima.

| Evidência | Conferência |
| --- | --- |
| `apply-intent.json` + `apply-staging.json` | Projeto staging `ifymocggowdlqqcxugko`, hash exato da migration, intenção 182→183, `appliesOnlyReviewedMigration:true`, receipt `accepted:true`, versão `20261029122806`, ledger **183**. O receipt de apply isoladamente não contém hash; a ligação é com intent/manifesto. |
| `native-acceptance.private.json` | Terminal **passed**, `all_passed:true`, **47/47 entradas passed**, providerCalls **0**. runId `9496588d-a0bb-41ef-9409-0231043c8ffd`. Hashes absolutos resolvidos e recalculados, ambos iguais. |
| `fixture-manifest.private.json` | Mesmo runId, projeto e candidateHashes do native. Híbrido referencia esse run por `mediaRunId`. |
| `runtime-acceptance.private.json` | Terminal **passed**, `passed:true`, runId `7ef24a86-14bb-45cc-a3e1-cdffb2fc0e92`, **6 POSTs simulados**, `realProviderCalls:0`, `productionWrites:0`. Hashes relativos recalculados, iguais aos do native/source. |
| `runtime-acceptance.initial-failed.private.json` | Preservado, terminal failed, runId distinto do runtime aprovado, conforme esperado para execuções diferentes. Não contabilizado como aprovação. A raiz informou correção somente dos fileNames do fixture; harness atual usa `fixture.png`, `qa-audio.mp3` e `qa-video.mp4`, em acordo com o script native. Não existe aqui prova de um diff histórico completo do harness anterior. |

Inspeção do native atual: CAS concorrente usa dois logins/threads, exige [200,409]; fixture de mídia B é válido e assinado pelo proprietário B; negativas de save exigem código 22023; restore compara latest com o último envelope escrito pelo próprio run e exige readback das settings originais. Os 47 incluem leituras repetidas e não são 47 cenários distintos. ACK do journal é transição sintética de banco, não entrega de provider.

Inspeção do híbrido atual: invoca sender real, usa DB/Storage nativos e provider `.invalid` simulado; confere replay sem novos POSTs, retomada de partes frozen, três tipos de mídia e parada incerta. A barreira segura o primeiro POST simulado, o concorrente precisa rejeitar com `dispatch_uncertain`, e só depois há release/ACK; não é `Promise.all` de duas entregas já concluídas. Isso aceita o cenário de fence por parte/scope null apresentado. Não demonstra por si lease/owner rotation de flow/intercycle em conexões nativas; esse ponto permanece com evidência local anterior e exige prova nativa específica se a raiz o declarar coberto nativamente.

Hashes dos arquivos de evidência lidos nesta rodada:

```text
67d5cb72c26feb7f35be23c909b5a3cee941f8bdef89bfed84398d0334822a95  apply-intent.json
71aeeb60c230cb5e07e5f95523659d408a003c6397100d57174d332a4b790879  apply-staging.json
75f8c3596db53aadb320ec09fc38251c5b50a13fc7a64c03fbbdd098b65fadda  native-acceptance.private.json
b96dd919bf92adee1c14fda9bb04490e2673cba2273f4e14c7b211aa70ac5ab5  runtime-acceptance.private.json
4a5819cbf4eb9b53997332ec17e4df70fec5b9f572b21b659079d80ef6fdd79c  runtime-acceptance.initial-failed.private.json
7ef60cad9d9623cc1593b6a394dfbfd4af8e2333d302be5b80352f5d2b0a4c6d  qa/message-sequences-hosted-runtime.native.ts
8ed2bbbe30a8d9b6d152db914c41c1c9d2de163873600c4387e3d0545095b53c  scripts/qa/message-sequences-hosted-native.py
```

Os cinco primeiros paths são relativos a `output/message-sequences-20261029.private/`. Não copiar manifests privados, identidades ou credenciais para o documento público.

## Estado da primeira rodada — superado pelos adendos abaixo

- ✅ Revisão independente do delta manager e rascunhos, conferência de 14+10 hashes e reexecuções focadas concluídas; finding reproduzido, não corrigido.
- ✅ Readback dos receipts de staging apply/native 47/híbrido terminal aceito nas fronteiras descritas; sem operação remota deste QA.
- ✅ Evidência anterior 89 backend/29 frontend preservada, sem rerun integral. Manager-only 67 foi reexecutado; contagens sobrepostas não somadas.
- ✅ Build da raiz: `output/message-sequences-20261029.private/canonical-build.log` lido até `✓ built in 30.18s`, postbuild/sanitizer/performance concluídos no log. SHA-256 `7c1fa81522449edc4d0335ccdce9258323c72fb6b27a70822639d3e443fd0521`. Execução/exit code pertencem à raiz; este QA não rodou build nem alterou dist.
- ❌ Correção P2 de novo contato por JID equivalente **(aguardando)**: executor/raiz deve corrigir, acrescentar regressões e congelar novamente somente os arquivos alterados para QA. Não aprovar o fluxo inteiro de novo contato enquanto falhar.
- ❌ Browser integrado de novo contato/rascunho/retomada/ACK **(aguardando)**: owner raiz; os testes manuais de componente/helper não montam o fluxo completo.
- ❌ Prova nativa específica de lease/owner de flow/intercycle **(aguardando)** se exigida para fechar A10 como nativo: owner raiz; os recibos desta rodada cobrem scope null e não permitem essa extrapolação.
- Produção/deploy/envios reais não executados, fora do escopo desta revisão. O zero de produção/provider é a declaração dos recibos lidos, sem auditoria remota independente.

## Adendo vigente — correção P2, fixture coerente e regressões persistidas

**P2 fechado localmente.** Manager revisado e testado no SHA-256 `51c8de430728705378390991650871aa8e076503a6ef775dae9f7a4077077985`. A raiz é owner da implementação; este QA não editou o handler. Após resolver `boundChat`, ele verifica o destinatário, fixa `sequenceRemoteJid` pela rota retornada pelo helper e usa essa mesma rota no snapshot/provider. Cada `beforeSend` exige igualdade exata da rota persistida, aluno e instância e exige que a revalidação do helper retorne a rota fixada. Isso corrige equivalência na resolução sem permitir troca de destino após snapshot. Tenant, acesso ativo e live instance continuam verificados.

Diagnóstico das falhas do `/tmp` antigo após a correção de produto:

- Provider falso ainda esperava `NUMBER` canônico global, mesmo quando a conversa válida resolvida usa JID legado. O handler chega a um POST correto para a rota legada; a asserção do fake lança depois de registrar o POST. O sender classifica a exceção como `dispatch_uncertain`. Isso explica POST=1/uncertain, sem demonstrar novo defeito de roteamento.
- O fake de insert preservava o JID criado, mas não preservava `student_id`. O row retornado pelo insert continha aluno, enquanto o readback seguinte devolvia `chatStudentId:null`. O fence correto detectava essa divergência antes do POST e devolvia 422. Na cópia inspecionada, telefone/country já eram BR (`+55 48 99999 0001`, `BR`); a hipótese de telefone US residual não se confirmou.
- Houve ainda rodada intermediária de 66/67 porque a primeira versão da correção devolvia 409 para conflito de aluno onde o teste existente esperava 422. A raiz restabeleceu `sequence_not_completed`/422 nessa fronteira; a rodada final passou sem relaxar a asserção existente.

Com o ownership explicitamente autorizado pelo usuário, `supabase/functions/whatsapp-manager/whatsappSignature.integration.test.ts` recebeu campos opcionais do fixture (`storedJid`, `studentPhone`, `studentCountryCode`), persistência de JID/aluno no fake insert/readback e expectativa do fake provider pela rota persistida. Defaults originais US continuam iguais. `Fixture` e `equal` foram exportados para evitar cópia e transformação de centenas de linhas em QA.

As **duas regressões duráveis** estão no próprio integration test: (1) conversa BR legada reutilizada a partir de request canônico e (2) conversa nova de aluno BR criada pela rota canônica a partir de request legado. Ambas exigem HTTP200, sequenceComplete, chatId, destinatário exato do snapshot/provider e replay do mesmo requestId sem segundo POST; também conferem que a primeira reutiliza sem insert e a segunda cria exatamente uma conversa com aluno preservado.

`qa/message-sequences-jid-regression.test.ts` agora importa esse módulo e acrescenta **duas negativas**: mudança real de rota após snapshot bloqueia antes de qualquer claim/POST, e request com número realmente diferente não pode usar chat explícito. O entrypoint registra os 69 casos de integração + 2 negativos = **71**, sem somar novamente o módulo original como segundo entrypoint.

```sh
deno test --cached-only --no-lock --allow-read --allow-env qa/message-sequences-jid-regression.test.ts
```

Resultado final: **71 passaram, 0 falharam**, com typecheck, 134ms. Log `/tmp/sett-independent-manager-jid-sharedfixture-20261029.log`. Typecheck separado offline do manager também passou: `/tmp/sett-independent-manager-jid-typecheck-20261029.log`. Diff whitespace focado passou. Não foram repetidos 89 backend, 29 frontend, 66 manuais ou qualquer operação remota.

Hashes finais desta entrega:

```text
51c8de430728705378390991650871aa8e076503a6ef775dae9f7a4077077985  supabase/functions/whatsapp-manager/index.ts
ce10a5a665dfba8d93a1a8e9e4bd4b9d0d914d4ab8f56f6d828d2349038a82a4  supabase/functions/whatsapp-manager/whatsappSignature.integration.test.ts
0e60a622a4cdb1005bd57c042ecce280d3db6ce58d7b05fd5e2c01563b042f71  qa/message-sequences-jid-regression.test.ts
```

✅ Delta manager aprovado localmente; duas regressões persistidas, replay e fences negativos passaram. ✅ Recibos de staging/native/híbrido e build anterior mantêm os limites da primeira revisão. A pendência então existente de atualizar o manifesto foi concluída pela raiz e reconferida no adendo seguinte. Este QA não operou browser. A eventual alegação de lease/owner nativo continua limitada como descrito anteriormente. Nenhum novo finding funcional permanece neste delta revisado.

## Adendo vigente — browser informado pela raiz e gate de publicação coordenada

**Manifesto backend atualizado: 14/14 OK**, incluindo manager `51c8de43…` e integration test `ce10a5a6…`, rechecados independentemente após atualização pela raiz. Nenhum rerun amplo ou deploy foi feito por este QA.

A raiz informou recuperação da extensão, uso de aba própria de QA em background, sem tocar a aba de produção, e o seguinte fluxo na UI real: imagem enviada/salva em v7; áudio e vídeo enviados pelo file chooser; save em v8 e reload preservando texto + imagem + áudio + vídeo; áudio/vídeo com `readyState:4`, duração de 1 segundo e `error:null`; adicionar parte 5 e removê-la devolve quatro partes e Salvar desabilitado. Esses dados de interação/DOM são **relato de execução da raiz**, não reexecução deste QA. O screenshot local `output/message-sequences-20261029.private/editor-four-formats.png` foi inspecionado independentemente: mostra versão 8, contador 4/10, os quatro tipos e arquivos, preview textual e controles de áudio/vídeo. Pixels estáticos não demonstram sozinhos reload, readyState, bytes nem ACK de envio. O gate de editor/upload/save possui essa evidência; não confundir com browser do envio manual de novo contato/retomada.

**Dependências de runtime para release: nove Edge Functions, não apenas os entrypoints de envio.** Conferido no JSON da raiz `output/message-sequences-20261029.private/release-function-closure.json`, SHA-256 `f5816b853f1b345411ab559c117faa1a22d96a9e021c5a429ab38e355347ca69`, e por caminhada independente dos imports relativos dos entrypoints `supabase/functions/*/index.ts` até os módulos compartilhados alterados. Imports/exports exclusivamente `type` foram excluídos: eles explicam os falsos positivos `ai-coach-pack` e `ai-validate-prescription` de uma busca textual ingênua. A closure de runtime coincide com o JSON:

1. `ai-prescribe-workout`
2. `asaas-integration`
3. `asaas-webhook`
4. `process-automation-sessions`
5. `public-payment-context`
6. `public-registration`
7. `push-send`
8. `whatsapp-manager`
9. `whatsapp-webhook`

Motivo do gate: o normalizador antigo estrito rejeita a seção nova `message_sequences`, conforme diagnóstico informado pela raiz; a versão local atual a aceita explicitamente antes do guard de seção desconhecida. Mesmo consumidores que não enviam sequências precisam aceitar as settings completas. Portanto, aplicar somente SQL e usar aliases QA antigos não demonstra compatibilidade desses nove bundles quando há `message_sequences` persistido. Native SQL/Auth/Storage, híbrido com sender local e editor conectado a staging são evidências distintas da aceitação de todos os Edge bundles publicados.

**Gate obrigatório para uma futura release autorizada:** preparar e publicar coordenadamente as nove funções compatíveis no mesmo alvo, verificar revisão/bundle e aceitação das settings em cada consumidor, e só então habilitar/salvar configurações novas com `message_sequences` para tenants operacionais. Durante rollout parcial, manter a ativação e a UI de salvar a nova seção indisponíveis nesses tenants; não salvar primeiro para depois atualizar funções. A fixture staging própria já usada no QA deve permanecer isolada de consumidores/aliases antigos. Em rollback de bundle, não reintroduzir parser antigo enquanto a nova seção continuar ativa; coordenar remoção/restauração via CAS e readback ou manter bundles compatíveis. Não apagar histórico/recibos como rollback.

Estado acumulado vigente: ✅ P2 fechado e 71/71 focados; ✅ rascunhos manuais 66/66 anteriores; ✅ evidências anteriores 89/29 preservadas; ✅ manifesto atualizado 14/14; ✅ migration staging/native 47/híbrido seis POSTs simulados aceitos nos limites documentados; ✅ build e editor/UI com as evidências acima. ❌ Publicação coordenada/validação remota das nove funções **(bloqueado para release)**: owner raiz, depende de janela e autorização explícita futura; nenhuma Edge Function nem produção foi deployada nesta tarefa. ❌ Browser do envio manual/novo contato/retomada **(aguardando raiz)** se incluído no aceite final; upload/save do editor não o substitui. Prova nativa específica de lease/owner permanece limitada ao que os recibos efetivamente exercitam. Nenhuma autorização de deploy/envio foi inferida deste adendo.
