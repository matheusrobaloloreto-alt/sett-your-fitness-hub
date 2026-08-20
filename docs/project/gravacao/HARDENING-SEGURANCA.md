# Hardening do artefato de gravação — runbook de release

## Contrato de segurança

- A página pública contém somente a chave **publicável** do projeto. Não contém token de modelo,
  segredo de webhook, service role nem credencial de operador.
- `authorize-recording` e `sign-recording` exigem JWT Supabase válido. O usuário deve ser `master`
  ou constar em `RECORDING_OPERATOR_USER_IDS` **e** ter vínculo em `company_members` com
  `RECORDING_COMPANY_ID`. Metadado editável do usuário não participa da autorização.
- CORS devolve a origem exata somente para a allowlist `RECORDING_ALLOWED_ORIGINS`; não há `*`.
- O par código/exercise ID precisa existir no mapa versionado de 926 exercícios e no banco vivo.
- A assinatura exige UUID v4 único, MIME de vídeo permitido e no máximo 64 MB. Há limite de rajada,
  limite persistente por operador e limite global da fila. Cada tentativa reserva de forma atômica
  `_requests/<hash-operador>/<request-id>.mp4` no bucket privado; replays e conflitos retornam 409
  mesmo quando outra instância da Edge atende a repetição.
- A remoção de um take publicado não apaga a reserva: o ledger persiste por oito dias, preservando
  as janelas de uma hora/um dia mesmo depois de a fila bruta ser drenada. Reservas expiradas são
  limpas separadamente pela ação administrativa `prune-recording-ledger`.
- O arquivo cru entra em `exercise-video-staging`, bucket privado com restrições reais de MIME e
  tamanho. A edge falha com 503 se a configuração do bucket estiver mais permissiva.
- Listagem, remoção, assinatura dos arquivos finais e commit continuam fora do browser de gravação:
  JWT `master` ou `VIDEO_INGEST_SECRET` server-to-server sem cabeçalho `Origin`.
- Publicação continua manual: gravação → triagem privada → `--staging --dry-run` → QA → publicação →
  remoção somente do take exato cujo download/processamento e commit **individual** foram confirmados.
  O nome local preserva o request ID remoto; cache de um take anterior não pode substituir regravação.
- O hosting aplica a `/gravacao/*` proteção anti-iframe por header (`frame-ancestors 'none'` e
  `X-Frame-Options: DENY`), além de `nosniff`, `no-referrer` e `no-store`. Meta CSP não é tratada
  como proteção contra clickjacking.

## Arquivos HTML que devem ser regenerados

1. `docs/project/gravacao/gravacao-modelo-1.html`
2. `docs/project/gravacao/gravacao-modelo-2.html`
3. `docs/project/gravacao/gravacao-modelo-3.html`
4. `public/gravacao/modelo-1-67698060b9.html`
5. `public/gravacao/modelo-2-57d17ab40a.html`
6. `public/gravacao/modelo-3-13b57ff210.html`

O gerador sincroniza os seis arquivos e `recording-exercise-allowlist.json` numa única execução.

## Preparação sem escrita em produção

1. Congelar o commit, registrar a versão remota da edge e contar os objetos existentes em
   `exercises-videos/_staging`. Não imprimir nomes de pessoas, tokens ou URLs assinadas.
2. Fazer backup criptografado dos objetos pendentes e registrar hash/contagem. Se houver gravações
   pendentes, preferir drená-las pelo fluxo antigo com dry-run e QA antes do corte. Não apagá-las.
3. Criar em staging o bucket `exercise-video-staging` com:
   - `public = false`;
   - `file_size_limit = 67108864`;
   - `allowed_mime_types = video/mp4, video/quicktime, video/webm, video/x-m4v, video/3gpp`.
4. Configurar em staging, sem registrar os valores no Git ou no log:
   - `RECORDING_COMPANY_ID` com a empresa BN validada;
   - `RECORDING_OPERATOR_USER_IDS` com UUIDs mínimos dos operadores aprovados;
   - `RECORDING_ALLOWED_ORIGINS` com origens HTTPS exatas de staging/produção;
   - `VIDEO_INGEST_SECRET` server-to-server, preservado nesta fase.
5. Manter `RECORDING_TOKENS` apenas até terminar o corte; o código novo não o lê.

## Deploy e validação em staging

1. Rodar os gates locais:

   ```bash
   deno fmt --check supabase/functions/library-video-ingest/{index,security,security.test}.ts
   deno check supabase/functions/library-video-ingest/index.ts
   deno test supabase/functions/library-video-ingest/security.test.ts
   node scripts/test-recording-hardening.mjs
   node --test scripts/video-ingest-safety.test.mjs
   node scripts/test-recording-http-headers.mjs
   node --check scripts/video-ingest.mjs
   python3 -m py_compile scripts/gerar-material-gravacao.py
   ```

2. Deployar **somente** `library-video-ingest` no projeto de staging.
3. Confirmar, com contas sintéticas:
   - sem token, token inválido e token expirado → 401;
   - origem não allowlisted → 403 sem `Access-Control-Allow-Origin`;
   - usuário comum, operador fora da allowlist e operador no tenant errado → 403;
   - `master` e operador allowlisted no tenant correto → `authorize-recording` 200;
   - código/ID divergentes, MIME inválido e arquivo >64 MB → bloqueados;
   - request ID repetido/conflitante → 409;
   - rajada acima do limite → 429;
   - upload válido cria uma única reserva e um único objeto na triagem privada;
   - repetição do mesmo request ID em outra instância continua bloqueada;
   - URL pública direta do objeto não permite leitura anônima;
   - `node scripts/video-ingest.mjs --status` e `--staging --dry-run` funcionam sem escrita.
   - após drenar um lote, uma nova tentativa ainda respeita as reservas da janela diária;
   - `node scripts/video-ingest.mjs --prune-ledger <hash-operador>` remove somente reservas com
     oito dias ou mais e preserva reservas recentes.
4. Regenerar e publicar os seis HTMLs em staging. Fazer login, enviar um vídeo sintético curto,
   validar a fila e remover somente esse objeto de teste. A reserva recente permanece no ledger.
   Validar os headers reais do hosting, sem aceitar redirecionamento silencioso:

   ```bash
   curl -fsSI https://<host-staging>/gravacao/modelo-1-67698060b9.html
   ```

   Exigir `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`,
   `X-Content-Type-Options: nosniff` e `Referrer-Policy: no-referrer`.
5. QA independente deve aprovar o diff, os logs sem segredo e o fluxo completo antes de produção.

## Corte de produção e rotação

1. Repetir backup/hash/contagem da triagem antiga e criar o bucket privado com a mesma política.
2. Configurar as três variáveis de autorização com IDs/origens previamente revisados.
3. Deployar a edge nova. As páginas antigas deixam de assinar upload; isso é intencional e fecha o
   token exposto antes de publicar a interface nova.
4. Publicar o frontend com os seis HTMLs regenerados e verificar os três links conhecidos.
5. Executar um upload canário por operador aprovado, depois `--staging --dry-run`. Não publicar o
   vídeo canário na biblioteca; remova somente o objeto sintético identificado.
6. Remover `RECORDING_TOKENS` dos secrets e invalidar as cópias operacionais antigas. Rotacionar
   `VIDEO_INGEST_SECRET` por canal seguro e atualizar somente o Keychain/arquivo local protegido do
   executor do CLI. Nunca mostrar o valor em comando, chat ou CI.
7. Confirmar que os seis HTMLs de produção não contêm `TOK=`, `RECORDING_TOKENS`,
   `x-webhook-secret` ou o token histórico; confirmar também CORS, bucket privado e logs.

## Rollback seguro

- Não restaurar os HTMLs antigos: eles continham segredo operacional. O fallback seguro é desativar
  temporariamente o botão de gravação e receber os vídeos por arquivo local, mantendo o pipeline
  `--dir ... --dry-run`.
- Se a edge nova falhar, restaurar a versão anterior somente com `RECORDING_TOKENS` já removido, o que
  mantém o upload público fechado; ou redeployar o commit novo após corrigir configuração.
- Não excluir o bucket privado nem objetos de triagem durante rollback. Eles são a fonte recuperável.
- Se a rotação do segredo do CLI falhar, restaurar o valor anterior a partir do cofre/Keychain
  aprovado, nunca do Git. Revalidar `--status` antes de qualquer ingestão escrita.
- Reversão de banco não é necessária: este hardening não cria migration nem altera exercício.

## Estado deste commit

Código, gerador, HTMLs, CLI e testes estão preparados localmente. Nenhuma edge, secret, bucket,
HTML público ou dado de produção foi alterado por este commit.
