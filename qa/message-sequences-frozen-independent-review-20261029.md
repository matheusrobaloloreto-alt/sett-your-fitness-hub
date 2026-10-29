# Parecer independente após freeze do Bacon

## Decisão migrations-only

**APROVADO para narrow staging apply somente de `20261029122806_company_whatsapp_message_sequences.sql`, SHA-256 `b26eb3f2a2640502cb9bd90a40757a45e8d87a3feade8f05be0a92f6e5f5f438`.** Freeze declarado pela raiz e conferido em `docs/superpowers/plans/2026-10-29-message-sequences-backend.md`.

Antes da escrita, a raiz confirma assinaturas/definições de apoio no alvo pelo preflight read-only `qa/message-sequences-migration-preflight.review.sql`. Dependência ausente ou validator alvo divergente do baseline revisado exige parar e revisar. Não ampliar para feature migration ou outra pendência. Revisão detalhada: `qa/message-sequences-migration-review-current-20261029.md`.

Não é aceitação de produção, deploy, provider, browser ou runtime nativo. Este QA não executou remoto, banco nativo, Docker, 54322, envio, build ou alteração de implementação.

## Evidência independente local

- **5/5 SQL/PGlite**: reexecução do contrato específico, com fixtures sintéticas e funções locais reais de recovery. Uma suíte principal e quatro subtestes; não somar a runs anteriores. Não comprova Storage Auth/RLS nativo nem concorrência PostgreSQL com conexões separadas.
- **89/89 Deno**: reexecução da combinação exata do handoff, com `--cached-only --no-lock --allow-read --allow-env`, sem `--allow-net`, exit 0. Inclui runtime/contrato, funil Lead/aluno, semanal worker/webhook, interciclo e handler manual/assinatura/tenant.
- **64/64 QA próprios**: `./node_modules/.bin/vitest run --config qa/message-sequences.vitest.config.ts`, exit 0, 5,27s. As duas falhas anteriores (tipo array e overwrite legado) agora passam após correções dos executores.
- **29/29 frontend**: reexecução registrada em `qa/message-sequences-frontend-harness-review-20261029.md`; 3 races próprios e testes novos do Mill. Timeout 20s necessário para o caso de dez blocos neste runner; limite original 5s excedido na primeira tentativa.
- `sha256sum -c docs/superpowers/plans/2026-10-29-message-sequences-backend-files.sha256`: **14/14 arquivos OK**, reconferidos após Deno. O inventário fixa arquivos inteiros que também contêm dirty anterior; não atribui todo o diff à feature.

## Harnesses atualizados: rechecagem estática

As observações anteriores de harness referiam-se aos hashes antigos. Na rechecagem atual, sem execução remota:

- Python passou a registrar running/false com runId/hash antes de Auth, finalizar em failed no atexit quando necessário e marcar passed somente no final. Restore usa o último envelope efetivamente escrito pelo próprio run, inclusive o vencedor de CAS concorrente; compara latest com written e não adota versão de terceiro.
- Negativas não aceitam mais 500: conjunto explícito 400/401/403/404. Continuar interpretando cada resposta de acordo com o gate, pois status isolado não explica a negação.
- Python baixa mídia assinada e compara hash dos arquivos de imagem/áudio/vídeo. Híbrido atual também chama o sender frozen que verifica bucket, metadados, download e assinatura de bytes.
- Híbrido grava running/false com runId/hash antes de obter keys, confere projeto/empresa/runId do manifest e vincula mediaRunId ao sucesso. Catch grava failed para a fase runtime; falha no setup anterior ao try permanece running/false e não deve ser aceita pelo gate terminal.
- Concorrência no híbrido agora segura o primeiro provider fake com barreira enquanto o segundo tenta a mesma ocorrência e precisa parar como incerto, sem segundo POST. Isso prova esse cenário de journal/parte; owners com scope/lease ainda exigem gate específico nativo para claim/authorize.
- Na leitura inicial, foreign_media_reference apontava a objeto aleatório inexistente. Posteriormente a raiz informou que implementou mídia válida pertencente a B, negativas com código semântico 22023 e restore guard. Essas alterações finais ainda não foram relidas/reexecutadas por este QA; o resultado nativo segue pendente, sem manter a implementação do fixture B como pendência conhecida.

Hashes observados dos harnesses atualizados:

```text
d6636a6ed7b2799b1e63bf3ff8f9d301f2a62f3e67cf2250aee91543b39256c4  scripts/qa/message-sequences-hosted-native.py
22dcc7f688703e94a2ed5f3815d345b44889ddb2bcdf1fe8abc1dcb375a1a6d1  qa/message-sequences-hosted-runtime.native.ts
```

Python AST parse passou sem executar o script. Nenhum sucesso de harness remoto é afirmado por este documento. Fixar novos hashes se a raiz acrescentar o fixture B ou outro ajuste.

## Estado acumulado

- Inventário, matriz de aceitação e QA local independente concluídos para o candidato frozen descrito.
- Migration única aprovada nas condições acima; raiz mantém o apply transacional e o preflight alvo.
- Native Auth/Storage/CAS/restore, híbrido, validação do fixture B implementado e browser: aguardam execução/evidência da raiz. IAB/extension indisponíveis não são prova negativa do produto; fallback nativo em avaliação pela raiz.
- Correção factual da raiz: `migration_not_yet_applied` consultava somente a tabela nova `company_message_sequences`, não licença nem Feature RPC. Não há ausência de feature/license migration constatada. Assinatura da Feature RPC será verificada pela raiz; somente sua ausência efetiva bloquearia runtime em `company_feature_unavailable`. Ledgers recebidos: staging 146 + 36 = 182; produção 235 + 36 = 271, baselines distintos, sem equivalência de schema inferida desses totais.
- Produção, deploy e envio real permanecem fora do escopo.
