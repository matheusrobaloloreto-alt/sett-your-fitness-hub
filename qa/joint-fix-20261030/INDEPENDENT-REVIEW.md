> ESTADO ATUAL: gate independente LOCAL aprovado para o manifesto congelado de 14 arquivos. Ver fechamento final ao fim; os achados provisórios abaixo são histórico. Produção e build/browser da raiz não estão aprovados por este gate.

# QA independente adversarial — provisório, sem gate final

Base/HEAD observado: `04c7cd3f7e1bbcf732c017b032f1a21a32b48a46`. Fontes em edição concorrente; não houve freeze SHA da raiz. Nenhuma fonte, índice, commit, push, deploy ou dado remoto foi alterado por este QA. Escrita própria restrita a esta pasta.

## Achado reproduzido

**[P2] Revalidar o rascunho protegido após a nova espera assíncrona.** `src/pages/admin/WhatsAppChat.tsx:1494-1499`: a identidade do rascunho e `studentLoginSendPayload` são conferidos antes de `await assertSendAccess()`. Essa nova espera pode ficar pendente durante a revalidação comercial. Se o rascunho for invalidado durante a espera, o código retoma o POST com `protectedPayload` capturado, sem conferir novamente sua validade. Teste independente `adversarial.test.tsx`, caso “discarding protected login during validation”: iniciar envio, manter getSession pendente, iniciar refresh comercial, resolver sessão, descartar acesso, resolver refresh com grant idêntico. Esperado zero `send-message`; observado **um POST**. Todos os dados/POSTs são mocks sintéticos. O teste monta o chat real diretamente, sem o fieldset inert do provider/route; por isso o clique de descarte durante refresh comprova a falha de cancelamento no handler, mas não prova que o clique é acessível na topologia nativa. Um segundo reprodutor troca `navigationState` para o aluno B durante a espera (simula mudança de navegação mantendo o componente montado), aguarda o novo compositor B e então resolve o refresh: também observa um POST protegido antigo, quando eram esperados zero. Portanto a falha de cancelamento foi reproduzida tanto por descarte quanto por navegação; acessibilidade exata dessas transições no browser nativo continua com a raiz. O POST usa o alvo A capturado; não foi demonstrado envio da senha de A para B. Correção alvo: conferir novamente rascunho/destinatário e geração da operação imediatamente após a espera, antes do POST.

## Verificações já concluídas

- 91/91 testes existentes passaram em 7 arquivos: chat focus, provider/hook focus, loginAccess, sequence, StudentPortal.reads, seletor/loader histórico e UI histórica.
- Arquivo pendente não acompanhou troca de destinatário no teste independente. Durante a revisão, o worker acrescentou limpeza por `selectedChatId` (linha 409); este cenário passou no código então carregado. Não é achado aberto.
- Histórico: leitura separada; owner/tenant/enrollment rechecados; futuro/superseded/archivado excluídos; sem callbacks de sessão/log/save/ACK na nova UI. Elegibilidade operacional não é ampliada pelo seletor histórico. Esses limites são evidência local, não prova de RLS hospedado.

## Em validação / limites

Testes complementares concluídos: 97/97 em 13 arquivos com ambiente sintético; mais 9/9 de prescriptionCoverage. Cobrem Auth/troca de usuário/recuperação, sessão, log-save/extra sets, weekly e conclusão. Reprodutor de navegação concluído: falha confirmada. Três casos independentes: arquivo/troca de destinatário passou; descarte protegido e navegação durante validação falharam (um POST mock em cada).

Build, comparação formal com baseline, browser nativo/file chooser e RLS remoto pertencem à raiz. **Não emitir gate final:** requer freeze SHA, repetir os reprodutores sobre o candidato congelado e fechar os achados aplicáveis. Não há alegação de risco zero.

Comando dos reprodutores: `npx vitest run --config qa/joint-fix-20261030/vitest.qa.config.ts qa/joint-fix-20261030/adversarial.test.tsx --maxWorkers=1`. Logs locais: `adversarial-focused-results.txt`, `compatibility-results.txt`. A primeira tentativa de configuração mesclava includes e iniciou uma seleção ampla; foi interrompida e substituída pela configuração explicitamente restrita à pasta QA.

## Snapshot de fontes lidas (SHA256; não equivale a freeze Git)

- `src/pages/admin/WhatsAppChat.tsx`: `7b18c5d67580cf311ad86c65a333d46984d61f2acdc2b2dbf060a738931e8b79`
- `src/hooks/useCompanyFeatures.tsx`: `01ac72976c883dda881922aef87af1e527bfa2bc6026bdd2f08e0aa1db88a5ae`
- `src/components/FeatureRoute.tsx`: `a0492285f4315e67e00496dbb10bf9943915306f6fb43b0bb7d7bf7ac64549ab`
- `src/components/WhatsAppChatPanel.tsx`: `a1928b2f521d24176882ec49191e6313b64806589eb240252e8c0062c2f65dd2`
- `src/pages/student/StudentPortal.tsx`: `f0b4c39854f0cddf996ced759693a4630e9ee11ebc7d2a80133d742b954d09a8`
- `src/lib/studentPrescriptionHistory.ts`: `d341b4c8f880039677ac0928f655f9d12d0c7203ecc266b019e531468ea164d4`
- `src/components/student/PublishedPrescriptionHistory.tsx`: `3a7649944893310eb9c6a53c6df61641ded821cb0c8422c23bf48d5f1c5cc9c0`

## Primeira execução complementar

49 testes passaram em sete arquivos. Três suites não coletaram sem variáveis de ambiente: weeklyStrengthDraft, StudentPortal.completion e StudentPortal.extraSets (cliente Supabase lança na importação). Reexecução com URL `.invalid` e chave sintética, sem credenciais reais: 97/97 passaram nos 13 arquivos selecionados. Isso não foi classificado como regressão de runtime; baseline formal pertence à raiz.

## Fechamento provisório desta leitura

✅ Revisão restrita ao escopo, relatório e três testes próprios em QA; nenhuma fonte alterada.
✅ 197 testes existentes passaram (91 + 97 + 9); um reprodutor próprio passou.
❌ Cancelamento do envio protegido após espera (aguardando): dois reprodutores próprios falham; executor deve revalidar o rascunho/destino depois da espera, então QA reexecuta.
❌ Gate final (bloqueado): freeze SHA ainda não recebido. Raiz mantém responsabilidade por baseline/build/browser nativo. Os resultados acima não valem como aprovação de um commit futuro.


## Gate sobre freeze final — atualização independente

A raiz entregou `output/joint-fix-20261030.private/source-freeze.json`, base `04c7cd3f7e1bbcf732c017b032f1a21a32b48a46`. O manifesto contém **14 arquivos**, não 16. Conferência exata pré-testes: **14/14 coincidem**; freeze do portal `worker-portal-freeze.sha256`: **6/6 coincidem**. Evidência detalhada em `final-freeze-hash-check.json`.

**Achado anterior resolvido no candidato congelado.** `WhatsAppChat.tsx` agora confere geração do destinatário antes e depois de `waitForWhatsAppValidation`; o envio protegido também confere geração/identidade do rascunho e recalcula seu payload após a espera. Template/sequence revalidam seus escopos após a suspensão; falha de envio comum não restaura texto no compositor de outro destinatário. Os **três testes independentes passaram (3/3)**, sem alteração do arquivo de testes; SHA256 `d984dd8bc9e3eb66270c3798de96266b73ae8d8ebbad4162674c03d73825ef2c`. Os resultados vermelhos anteriores continuam preservados como histórico do defeito, sem serem o estado atual.

**Ajuste da raiz em whatsappRecipientSafety revisado:** `1/2/1/1` por `send-message`, `send-message-sequence`, `send-media`, `edit-message` corresponde às chamadas efetivas nas seções do manager (1036; 1308/1346; 1384; 2199). As duas de sequence são antes da criação de chat e no callback antes de cada parte. A nova asserção por ação evita que uma chamada adicional em outra seção mascare a remoção de uma guarda. Não demonstra sozinha semântica de runtime, mas é um reforço coerente do contrato estático. **9/9 testes passaram.** `git diff --exit-code BASE -- supabase/functions/whatsapp-manager/index.ts` passou: backend permanece idêntico à base para esse arquivo; nenhum diff sob `supabase/` foi observado.

A raiz informou TSC global exit 0 e leitura autenticada de histórico na fixture de staging (owner/cycle/workout 1; foreign 0). São evidências fornecidas pela raiz, não execuções independentes deste QA. Não classificar REST 400 anterior como falha RLS; alinhamento de coluna nullable ocorreu somente na fixture de staging segundo a raiz. Este QA não executou DDL nem acessou produção.

Reexecução adicional dos sete arquivos focados em andamento neste momento; conclusão será anexada abaixo. Build canônico e browser após build pertencem à raiz. O gate independente se limita à revisão de código/hash e testes locais solicitados; não constitui aprovação de produção ou alegação universal de ausência de regressão.


## Fechamento final — LOCAL aprovado no escopo solicitado

✅ Freeze exato da raiz: 14/14 hashes conferidos antes e depois dos testes, zero divergências. Portal: 6/6 hashes conferidos.
✅ Testes QA independentes inalterados: 3/3 passaram; os dois reprodutores anteriormente vermelhos agora estão verdes.
✅ Contrato de segurança do destinatário: revisão do diff e execução 9/9 aprovadas, sem mudança do manager backend.
✅ Regressão focada sobre o freeze: 93/93 testes passaram em sete arquivos (`final-focused-results.txt`). Total reexecutado neste gate: **105/105** (3 + 9 + 93).
✅ Achado de cancelamento protegido encerrado para estes hashes. Nenhum novo achado concreto bloqueante identificado nesta revisão delimitada.
❌ Validação integrada build/browser após build (aguardando): raiz é dona e informou build ativo; este QA não certifica o resultado futuro. Próximo passo: raiz concluir build e browser nativo sobre os mesmos hashes.

**Decisão:** aprovado o gate independente de código/hash/testes locais solicitado. Não é gate de produção, autorização de deploy, validação universal do app ou garantia de risco zero. Alteração em qualquer arquivo do freeze invalida a correspondência deste parecer até nova conferência apropriada. Sem edits de fontes, mudança de testes independentes, index/commit/push/deploy/DDL por este QA.
