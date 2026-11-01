> GATE FINAL MAIS RECENTE: APROVADO no escopo local do freeze ROOT c6c8d831…56933. 49/49 + sonda5/5 PASS; ROOT10/10 e portal4/4 pré/pós. Ver fechamento V3 ao fim. Notas de freezes anteriores abaixo são histórico. Sem aprovação de produção.

> ESTADO MAIS RECENTE: 49/49 adversariais + 13/13 SQL independentes PASS. Freezes dos workers 10/10 e fontes/QA estáveis pré/pós. Manifesto ROOT ainda 9/10 por Portal antigo; gate do pacote/build fica pendente de reconciliação. Ver fechamento abaixo. Sem produção.

# Configuração da continuidade — QA independente

Base 61ab2c8. Implementação examinada: coluna dedicada com JSON settings legado intacto; RPC mínimo para aluno sem membership; defaults keep e hide explícito. Escritas deste QA restritas a esta pasta; sem fonte alheia, commit/deploy ou escrita remota.

## DDL

Parecer específico em DDL-INDEPENDENT-REVIEW.md. Hash a5d09feca803492dc82b35add8a252d44e13c0b263679cb9a8104f5fd65a9964 aprovado para gate técnico de staging após freeze.
Prova independente persistence-cached-caller-results.txt: **13/13 PASS**. Inclui caller SQL legado alcançando helper movido, protegendo modo hide na auditoria pelo trigger BEFORE INSERT. JSON settings/history.settings sem chave virtual; old codec 61ab aceita REST/RPC; CAS/enum/tenant/grants/rollback transacional preservados. PGlite local com identidade/roles/entitlement sintéticos, não prova hosted Auth.

## Homologação nativa da raiz

Resultado lido em output/configurable-continuity-20261101.private/native-policy-result.json: projeto ifymocggowdlqqcxugko; Auth/REST reais; hide lido por aluno; JSON inalterado; old client preserva hide; CAS/enum/foreign writes rejeitados; política original restaurada. Versões 8->9->10->11 deixam auditoria legítima, não são reset à versão 8. A raiz informou adicionalmente foreign read403, trainer/student writes403 e enum400/CAS409. Esta é evidência da raiz, não execução remota independente deste QA. Produção não alterada por este QA; raiz informou igualmente produção intacta.

## Fontes e testes

Settings worker: seis hashes conferem com settings-worker-freeze.json. Portal: três de quatro conferem com worker-portal-freeze.sha256; StudentPortal.reads.test.tsx mudou de 0935a6f177d81db916d0cd76a03728120e3a727145b939e88b48d45fb7553977 para 2f5bf81733162b10a9d444904145434ca3566110198d67a322e6048bf5dd6ca0. Todas as fontes de implementação conferem. Não autorrecongelar o teste alheio; owner/raiz precisam reconciliar o manifesto. Evidência final-pre-freeze-check.json.

Suíte própria tem 49 casos: contrato/default/enum, cliente save/reload, codec exato 61ab, hook real com QueryClient/RPC, portal com hook mockado e UI real com transporte mockado. Fixture UI cobre persistir hide em A, desmontar/remontar/reler, B preservada e CAS mantendo draft. Uma execução combinada sob carga teve timeout de UI (16,3s versus teto15s), sem assertion funcional de produto; caso já passou em reexecução anterior (rpc-ui-reviewed-results.txt:16/16 inclui UI+hook). Reexecução UI isolada com teto30s em andamento, sem mudar expectativas. Logs antigos com múltiplas execuções concorrentes no mesmo destino não são gate; usar arquivos finais únicos.

## Limites de produto

hide é política do novo portal, não revogação de acesso implementada no backend operacional de sessão/cargas. Abas com JS 61ab continuam comportamento antigo até atualizar. Compatibilidade do JSON não torna um cliente antigo conhecedor da nova política. Nenhuma inscrição/datas/UUIDs é alterada pela seleção.

## Checklist

✅ Contrato e ameaça do JSON novo revisados; desenho rejeitado está marcado histórico em BACKCOMPAT-REVIEW.md.
✅ Persistência isolada e ACL/CAS/auditoria: 13 verificações independentes locais.
✅ Evidência hosted Auth/REST de staging da raiz lida; produção fora de escopo.
❌ UI final combinada (em andamento): concluir reexecução após timeout de host; não mascarar erro de produto como timeout.
❌ Gate integral do freeze (bloqueado): manifesto de reads.test diverge. Reconciliar freeze com owner e conferir hashes pré/pós da execução final. TSC/build/browser pertencem à raiz.


## Fechamento final da revisão de comportamento e DDL (freeze dos workers)

- **49/49 PASS em seis arquivos**, reexecução completa sem alteração de expectativas: final-root-49-results.txt. UI save/remount/reload, conflito CAS preservando draft, contrato/default/enum, cliente save/reload, codec 61ab e coluna dedicada, reader RPC do aluno sem membership, null/erro/tenant/refetch fail-closed, portal hide versus current workout e datas preservadas.
- **13/13 SQL independentes PASS**, final-root-13-sql-results.txt: DDL SHA a5d09feca803492dc82b35add8a252d44e13c0b263679cb9a8104f5fd65a9964; inclui caller SQL legado que alcança o helper antigo e preserva hide/audit pelo trigger. Fixture em memória, sem operações remotas deste QA.
- **Workers settings+portal: 10/10 hashes conferem**, incluindo Portal ce8dd00a13084e560398215921288f584b035de84ee5fa618b17e837275963b7. Todos os arquivos de implementação/testes dos workers e todos os arquivos QA permaneceram idênticos entre pré e pós desta execução. Evidência final-root-post-hashes.json.
- **Manifesto ROOT: 9/10**. output/configurable-continuity-20261101.private/source-freeze.json ainda espera Portal fc92d210c19ae70541e88098fe3d818828f9cc5927d8a8195349a1894a68c9ac. A diferença lida é o guard awaitingDigitalPrescription que também considera ciclo selecionado expirado, impedindo bypass da política por coverage atual de outro ciclo. O arquivo atualizado está no freeze do worker; não foi alterado por QA. Raiz deve reconciliar manifesto e recibo do build com ce8...; não usar o manifesto antigo como se representasse o candidato testado.

### DDL metadata e adoção

Artefato nativo native-metadata-verification.json da raiz informa legacySaveBodyUnchanged/legacyOwnerUnchanged/tableRlsUnchanged/anonDenied/privateHelperDenied = true e productionChanged=false. Junto ao native-policy-result.json e sequência Auth/REST informada, cobre o caminho hosted em staging como evidência da raiz (não reexecução remota independente).

A adoção de defaults de plataforma é um consumidor SQL concreto (migration 20261028123147, public.adopt_platform_experience_defaults). Sua chamada ao save pode manter referência/estado preparado do objeto anterior ou resolver o nome novo. O trigger de captura de histórico preserva a política mesmo no caminho do helper legado; teste independente simula explicitamente esse acesso e o contrato do Pauli testa caller aquecido antes do move. Não copiar modo da coluna para o JSON durante adoção. Não restaurar JSON/histórico completo para rollback de UI; policy/audit e novas versões devem permanecer. O DDL a5d já contempla a mitigação; não há achado bloqueante restante de segurança/DDL nesta revisão delimitada.

### Decisão e limites

✅ Comportamento e DDL aprovados no escopo local testado, hashes dos workers estáveis; nenhum novo defeito funcional bloqueante identificado.
✅ Evidência nativa de staging da raiz lida; JSON legado e leitores antigos permanecem compatíveis sem necessidade de edge deploy por este campo.
❌ Gate do pacote/build (bloqueado): reconciliar manifesto ROOT 9/10 com o freeze Portal atualizado e garantir recibo de build sobre esses hashes. Não requer mudar fontes ou expectativas QA; depois conferir novamente os manifestos.
❌ Produção (aguardando): nenhuma aprovação/deploy/DDL de produção por este QA. TSC/build/browser final permanecem com a raiz. hide regula o novo portal, não é nova revogação de execução no backend ou em abas com JS antigo.

UI teve timeouts sob carga em tentativas antigas; reexecução completa final 49/49 passou com teto de UI ajustado, sem alterar assertions. Fixtures antigas incompletas (formatTime/version/search_path de helpers sintéticos) foram corrigidas exclusivamente em QA; não eram bugs do produto. Não usar logs WIP antigos como estado atual.


## Fechamento V3 definitivo — último freeze conciliado

Referência: output/configurable-continuity-20261101.private/source-freeze.json, Portal c6c8d831fc9e4581b4ac65a2146816a9b1f12f1725acb7c3762c257e11256933, reads79144bd570646d829e4210d8952aa128c0cd937d19b15140603b813cc282257c. Os quatro hashes do worker Portal e os dez da raiz conferem ANTES e DEPOIS. Manifesto e todos os testes/configurações QA permaneceram inalterados durante as duas execuções finais. Evidência final-v3-pre-hashes.json / final-v3-post-hashes.json. A divergência de manifestos anterior está encerrada.

✅ Seis suítes próprias: **49/49 PASS**, final-v3-49-results.txt, exit0. Sem novos edits de implementação ou expectativas neste gate.
✅ Sonda semântica do executor reexecutada independentemente: **5/5 PASS**, final-v3-probe-results.txt, exit0. Total solicitado neste gate: **54/54**.
✅ DDL a5d mantém aprovação específica; **13/13 SQL independentes anteriores** em final-root-13-sql-results.txt continuam aplicáveis ao MESMO hash, inclusive caller SQL antigo e trigger de captura de auditoria. Não houve novo DDL ou execução hospedada deste QA.

### Semântica final revisada

Portal escolhe continuation válido antes de preferredCycle e registra digitalContinuation quando helper válido e chosen.id coincide, sem depender de coverage.hasCurrentWorkout. Assim keep não é bloqueado pela cobertura atual de outro ciclo/etapa, e hide continua a ocultar selecionado expirado mesmo com coverage em cache. Sonda testa ambos os modos, virada de data e escolha de publicação corrente sobre C99 histórico.

A ação Finalizar sessão em andamento usa o handler existente handleFinishSession, não startSession nem abandonSession. canFinalizeHiddenSession exige sessão ativa resolvida no workout selecionado, aluno e empresa exatos, aluno não inativo, barreiras de remoção/substituição e ciclo iniciado. Ocultar treino não monta o controle de novo início. O handler existente mantém fila de saveCurrentLogs, conclusão confirmada e tratamento de erro antes de celebrar. A sonda verifica presença da ação e ausência de novo início/abandono; NÃO clica para concluir uma sessão real nem prova persistência hospedada dessa nova apresentação. O encaminhamento do botão ao handler foi revisado no código; não fabricar alegação de clique/ACK nativo final sob hide.

### DDL, metadados e adoção

Mantém corpo/owner do helper e RLS conforme artefato nativo da raiz, além de anon/private-helper negados. Adoção de defaults por SQL pode alcançar helper antigo; BEFORE INSERT captura política corrente e impede audit falso hide->keep. O wrapper ajusta política e audit da mesma versão atomicamente. Old writer que omite campo preserva hide; JSON segue válido para 61ab. Rollback mantém colunas/wrapper/trigger e histórico; não dropar estrutura nem restaurar banco por cima de alterações concorrentes. Native Auth/REST staging e metadados são evidências lidas da raiz, não reexecutadas remotamente por este QA.

**Decisão: gate independente local de fontes, revisão de comportamento e testes solicitado APROVADO para o freeze V3.** Sem achado bloqueante remanescente no escopo. Build/TSC/browser e integração final pertencem à raiz; produção exige autorização e verificação próprias. A política de hide do novo portal não é nova regra de revogação no backend nem atualiza por si só abas antigas com JS61ab.
