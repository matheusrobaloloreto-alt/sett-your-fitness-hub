# Review independente — frontend Mill e harnesses da raiz

Inspeção local em 2026-10-29; HEAD `45b6c3a`, branch `codex/sett-self-service-local-20261026`. Nenhum arquivo de implementação ou harness da raiz alterado. Somente arquivos próprios em `qa/`. Não houve execução remota, Auth remoto, banco, Docker, 54322, build, envio ou deploy. Backend ainda em integração: este documento não aprova staging apply.

## Frontend: veredito local

As duas alterações do Mill foram reconferidas: `src/lib/companyMessageSequences.ts` agora usa aliases de `MessagePart`/`WhatsAppEvent` do contrato compartilhado e `editMessageSequence` preserva integralmente `messages`. O teste independente agora compara também o payload exato enviado ao save, usando texto BN sintético existente, além de identidade/profissional.

Reexecução independente focada:

```sh
./node_modules/.bin/vitest run --config qa/message-sequences-frontend.vitest.config.ts --testTimeout 20000
```

**29/29 passaram, 3 arquivos, exit 0, duração 61,47s.**

- 14 testes `src/pages/admin/ProductSettings.sequences.test.tsx` do Mill.
- 12 testes `src/lib/companyMessageMedia.test.ts` do Mill.
- 3 testes próprios `qa/message-sequences-frontend-races.test.ts`: sair/voltar à aba durante upload e mudar evento; unmount da página durante upload; preservar legado BN/brand no payload exato de save.

A primeira execução desses 29 testes teve 28 passes e um timeout de 5s no teste de adicionar até dez blocos. Na repetição, o mesmo teste passou em 19,16s com timeout de 20s. Isso é uma limitação de tempo/custo de renderização no runner atual; não equivale a validação de performance no browser. Nenhum teste foi relaxado ou pulado.

Proteções revisadas: `ProductSettings.tsx:180` usa key por empresa/evento; troca de empresa limpa draft e invalida resultado de save por epoch; `WhatsAppSequenceEditor.tsx:41-62` tem ref síncrona de upload e invalidação de retorno após unmount; seletor/save ficam bloqueados durante upload; URLs de preview têm guarda de efeito; paths são imutáveis e não há remoção de objeto no Storage pelo editor. Navegar para outra seção desmonta o editor e libera busy; retorno tardio foi testado sem contaminar evento ou gravar dados. Upload remoto já iniciado não é cancelado, podendo deixar objeto órfão privado, sem torná-lo referência salva.

Hashes após a reexecução, iguais aos registrados imediatamente antes da segunda execução para ProductSettings/editor/media/shared aliases:

```text
1911a6afe28e47238891c07075fd13e2f5f6cb4ec352f9f182881dbebe04d0e7  src/pages/admin/ProductSettings.tsx
15c7e2c99deb35a9c711dda8c267fd0d92defd2ccd14f3d9aa99a0420d293fd6  src/components/admin/WhatsAppSequenceEditor.tsx
e135b4097f1a7302bca2fea7ddaa2123e16d150918c8c428b8b56ce405a9439c  src/lib/companyMessageSequences.ts
213944876383867886e588dc934cb5e75cea6b37dffda60be12249b75a3673b1  src/lib/companyMessageMedia.ts
8da0a4112092bde41330f8896946df100c7a8121d8ee1abc28448755bd7cce1b  src/pages/admin/ProductSettings.sequences.test.tsx
```

Não foi identificado bloqueio novo de frontend nesses caminhos após as correções do Mill. Contrato TS/backend/migration frozen continuam gates separados; o resultado anterior de `type: ["image"]` não foi reexecutado neste gate frontend.

## Harness Python: achados antes do uso como evidência

Arquivo `scripts/qa/message-sequences-hosted-native.py`, hash observado `9ed05ab9de0d32a2fb6f32e07b2c381b74c96a244086c99c3b5f6a51e326c3cc`. Somente leitura e parse AST, sem importar/executar. O helper `hosted-fixture.private.py` foi inspecionado: `create_fixture()` está sob `if __name__ == '__main__'`; `runpy.run_path` sem run_name main não dispara essa criação. Projeto/fixture estão fixados, chamadas diretas restritas ao projeto de staging. O harness deixa mídia/chat/journal intencionalmente inventariados; restaura apenas settings.

1. **P1 — restore pode sobrescrever alteração concorrente.** Linhas 85–88: o `finally` lê `latest=current()` e usa `latest.version` para salvar todo o baseline original. Se alguém editar o mesmo fixture após a última escrita do harness, a restauração passa no CAS e apaga a edição. Ação da raiz: trackear a última versão/payload efetivamente escritos por esta execução; restaurar somente se o estado ainda é esse. Conflito exige registro e parada, sem adotar versão alheia. Não confundir rollback com nova gravação incondicional.
2. **P2 — negações podem ser falsos positivos.** Linhas 35/41/42/63/77/78/80 aceitam `status >= 400`. HTTP 500 de trigger quebrado, tabela ausente ou indisponibilidade é contado como prova de RLS/imutabilidade/validação/ordem. Ação: exigir status/código semântico esperado por gate e verificar estado/ausência da escrita; para Storage, distinguir deliberadamente ocultação de existência de falha de infra. O caso de foreign media também aponta a um objeto inexistente em B: adicionar mídia válida pertencente a B separa isolamento de simples missing-object.
3. **P2 — prerrequisitos e evidência por execução.** `.mp3/.mp4` são lidos só após upload PNG. Validar os assets antes de qualquer mutação evita escrita parcial por arquivo local ausente. `native-acceptance.private.json` só começa a ser atualizado no primeiro `current()`; falha anterior de login/fixture pode deixar sucesso de execução passada. Inicializar runId/status running antes dos acessos, persistir failed em exceção e vincular sucesso a hashes/manifest da execução atual.

## Harness híbrido: achados antes do uso como evidência

Arquivos `qa/message-sequences-hosted-runtime.native.ts` (hash `64686882bdb71f5ad61d10452835a959072db114d6a43c5b300e4e357ca68e49`) e `qa/message-sequences-native.vitest.config.ts` (`81b07f7fd099cd91b73bf3edaf9af9aa3bc180a628e0bf5df67261f06ff0c94e`). Não executados.

Opt-in está dentro do teste antes de leitura de keys/I/O remoto. Fixture/projeto e claims da key são conferidos; destino do provedor `.invalid` é interceptado; Supabase client usa transporte permitido e o fetch global é restaurado em finally. A configuração está separada dos testes locais próprios e não é coletada pelas configs de QA local aqui criadas. Não há chamada de Edge/provider real explícita nesses arquivos.

1. **P1 — recibo verde anterior sobrevive a falha atual.** Linha 54 grava `runtime-acceptance.private.json` somente no sucesso. Falha de login/key, insert, snapshot ou assertion não invalida `passed:true` de uma execução anterior no mesmo diretório. Há inclusive `runtime-fixture.private.json` novo antes de terminar os testes. Ação da raiz: recibo running/false com runId único no início, failed no catch e passed somente ao final, todos com mesmo runId/hash do candidato. Gate deve exigir esse vínculo.
2. **P2 — Native Storage cobre assinatura, não download/entrega de todas as mídias.** O dispatcher cria signed URLs reais, mas o provedor fake não as busca. O Python compara bytes apenas do PNG; áudio/vídeo têm upload/save. Registrar escopo exato e, se o gate pretender provar leitura de todos os assets, baixar URLs no alvo permitido e comparar hash de cada arquivo. Não chamar este gate de entrega real no WhatsApp.
3. **P2 — concorrência e lease têm cobertura parcial.** `Promise.allSettled` inicia dois envios, mas sem barreira na fronteira do POST não garante sobreposição efetiva; `_scope` está ausente, logo lease/owner das automações não são exercitados. Para o gate de owners, incluir ensaio específico com fixture de owner e barreira antes de liberar o provedor fake; não promover a checagem atual a prova de fencing/ausência de deadlock.
4. **P2 — metadados de evidência incompletos.** Validar `mediaManifest.projectRef`, empresa e runId antes de inserir chat; registrar manifest/hash do sender/migration e os erros em recibo privado. Os caminhos de mídia são posteriormente validados pelo sender, mas sem esses vínculos o artefato pode misturar duas execuções do mesmo fixture.

## Pendência para Bacon/raiz

Solicitado freeze explícito da migration com SHA-256 e dependências mínimas antes do narrow staging apply. Prioridade da próxima rodada: conferir correção da ordem de locks, grants/validator wrapper, privateStorage, snapshot/ACK/uncertain e compatibilidade dos dois harnesses com o schema frozen. Nem esta revisão estática nem 29 testes de frontend aprovam a migration ou autorizam remoto.
