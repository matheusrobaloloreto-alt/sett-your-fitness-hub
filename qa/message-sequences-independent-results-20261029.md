# QA adicional independente — execução anterior ao freeze

2026-10-29. Branch `codex/sett-self-service-local-20261026`, HEAD `45b6c3a`.

Somente testes e documentos próprios em `qa/`. Sem implementação, banco, Docker, probe de 54322, remoto, envio, build ou deploy. Raiz mantém native staging e browser. Resultados são observação do working tree concorrente, não gate do candidato frozen.

## Comando e resultado

```sh
./node_modules/.bin/vitest run --config qa/message-sequences.vitest.config.ts
```

Vitest 3.2.6, ambiente Node sem setup da aplicação, sem credenciais, rede ou banco. Duração 4,15s. Exit 1. **64 testes: 62 passaram, 2 falharam.**

- `qa/message-sequences-invalidpayload.test.ts`: 58 testes, 56 passaram e 2 falharam.
- `qa/message-sequences-consumer-inventory.test.ts`: 6 testes estruturais passaram; isso não prova entrega/runtime/isolamento nativo.

Cobertura: envelope inválido, 11 partes, ID duplicado, shape/chaves desconhecidas, texto vazio/longo, captions e variáveis por evento, bucket/path/traversal/query, MIME e nome de arquivo, quatro push excluídos, 10 partes em cada evento WhatsApp, clone separado e render sem reinterpretação, ausência de migração ao visualizar e preservação de legado ao editar.

## Falhas reproduzidas

1. **P1 — contrato TS aceita tipo não string.** `supabase/functions/_shared/company-product-settings.ts:22` usa `String(part.type)`. Payload JSON `{weekly_contact:[{id:"photo",type:["image"],text:"",media:{bucket:"whatsapp-media",path:"11111111-1111-1111-1111-111111111111/message-settings/22222222-2222-2222-2222-222222222222.png",mimeType:"image/png",fileName:"foto.png"}}]}` é aceito e devolvido com `type` array. O SQL da migration exige `jsonb_typeof(p->'type')='string'`. Teste: `rejects array media type without mutation`. Corrigir o validator é responsabilidade do executor; QA não mudou implementação.
2. **P1 — edição sobrescreve legado.** `src/lib/companyMessageSequences.ts:24` troca `messages[event]` pelo texto do primeiro bloco. Teste `keeps legacy messages intact when editing an explicit sequence` falha ao receber `Nova sequência` no lugar de `messages.weekly_contact` original. Isso viola a instrução recebida de `legacy messages intacto`. O objeto original não sofre mutação, porém o payload editado sobrescreve a cópia legada ao salvar. Executor deve preservar os dois campos conforme contrato ou obter alteração explícita de escopo da raiz.

Hashes SHA-256 dos arquivos reconferidos após a execução (não há pin anterior, portanto não se afirma estabilidade durante o run):

```text
49f3dd9b6edc89c6bff2c0dc047c29b28e5cc43271cc7eff57a18299822a3423  supabase/functions/_shared/company-product-settings.ts
e5d387e46afa31c735910f7b0ef400526ed889196fefcbd4590ae6387e8e42db  src/lib/companyMessageSequences.ts
```

## Migration: alerta estático preliminar, sem aprovação

Arquivo lido: `supabase/migrations/20261029122806_company_whatsapp_message_sequences.sql`, SHA-256 observado `73ed611a5c16ff58df4a977b1add9555d71717663496b49f9cebf05c97b17ddb`.

Há inversão de ordem de locks a verificar antes do staging apply: `snapshot_company_message_sequence` trava o owner via `lock_automation_dispatch_owner` antes de travar a sequence; `claim_company_message_part` e `authorize_company_message_part` travam a sequence antes de travar o owner. Um snapshot concorrente com claim/authorize da mesma ocorrência pode formar espera circular owner→sequence / sequence→owner. É inferência estática; não foi executado ensaio de concorrência. Pedido ao executor: uniformizar a ordem ou demonstrar por que tal interleaving não é alcançável. Não reproduzir agora contra banco instável.

A migration renomeia o validator vigente e cria um wrapper, adiciona trigger de referências privadas e políticas restritivas de Storage, tabelas e RPCs de snapshot/partes. O narrow apply deve incluir preflight de dependências existentes e ownership/grants do validator vigente, políticas permissivas do bucket necessárias para que as restritivas funcionem, fence de owners, compatibilidade do send action manual e reconciliação de partes incertas. Esses itens ainda precisam de revisão sobre o arquivo frozen e evidência nativa pela raiz.

## Próximo gate

Ao Bacon/raiz sinalizar freeze: fixar hashes, revisar migration primeiro e emitir veredito específico antes do narrow staging apply. Depois reexecutar somente esta suíte e os testes novos pertinentes indicados pela raiz. Não rodar suítes antigas extensas nem assumir scripts nativos/browser. Esta entrega não autoriza apply ou release.
