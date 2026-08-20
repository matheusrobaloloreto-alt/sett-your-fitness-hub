# Wearables SETT/BN — Oura e WHOOP

Status em 2026-08-20: implementação concluída e infraestrutura validada no staging; **nenhuma conexão OAuth real foi executada porque não há conta/dispositivo de teste nem credenciais de provedor disponíveis**.

## Arquitetura e segurança

- `wearable_devices` contém apenas estado operacional e escopos.
- `wearable_credentials` contém envelope AES-256-GCM (`ciphertext`, IV de 96 bits, `key_id`) e não concede acesso a `anon` nem `authenticated`. O AAD vincula cada token ao `device_id`.
- `WEARABLE_TOKEN_KEYS` é um JSON de chaves base64 por identificador; `WEARABLE_TOKEN_ACTIVE_KEY_ID` seleciona a chave usada em novas gravações. Ambos são secrets exclusivos da Edge Function. Nunca colocar valores reais no Git, frontend, logs ou documentação.
- A conexão OAuth só é finalizada pela RPC transacional `commit_wearable_connection`, que revalida imediatamente `actor_user_id -> student ativo -> company`, grava device + credencial cifrada + consentimento ou não grava nada.
- A finalização OAuth participa da mesma ordem global de locks do sync/maintenance. Se houver lease ativo de sync, refresh ou manutenção — inclusive retomado enquanto o callback aguardava — retorna `device_busy`; a Edge entra no caminho já existente de revogação compensatória do token emitido.
- O state OAuth tem 256 bits, expira em 10 minutos, registra ator/tenant/provedor/escopos e é consumido por `DELETE ... RETURNING` uma única vez. Oura e WHOOP documentam o fluxo server-side com state, mas não anunciam PKCE nesse contrato; não foi inventado um parâmetro não documentado.
- Refresh tokens rotativos/single-use são protegidos por lease atômico e compare-and-swap de versão. O sync tem lease próprio, renovado a cada página. Aquisição, renovação, release e os RPCs de lifecycle usam a mesma ordem global por device: advisory lock → row lock do lease → row locks de device/aluno → revalidação com `clock_timestamp()` → DML. Um holder antigo nunca persiste depois que o lease expira e é retomado.
- Disconnect e exclusão usam lease de manutenção incompatível com sync/refresh. Persistência/finalização do sync, disconnect e exclusão são RPCs transacionais que revalidam lease, aluno e device.
- A autorização de staff deriva sempre de `students.company_id` no momento da leitura; ela nunca confia no `company_id` denormalizado do registro wearable. Se um aluno mudar da empresa A para B, a equipe A perde acesso imediatamente e a equipe B passa a ver também o histórico desse aluno.
- A migration reconcilia todos os `company_id` divergentes em devices, métricas, workouts e consentimentos. Uma transferência posterior invalida qualquer sync iniciado em A: `commit_wearable_sync` trava e reconsulta aluno/device, compara ator, status e tenant com o snapshot do início e falha com `sync_tenant_changed` antes de gravar. O device precisa de reconciliação explícita para B antes do próximo sync; não há correção silenciosa cross-tenant.
- Métricas e workouts são idempotentes. Quando há vários sleeps/naps no mesmo dia, a normalização escolhe explicitamente registro `SCORED`, sono principal e maior duração; pending/unscorable continua `null`, nunca zero.
- WHOOP strain usa escala `0..21`; recovery relaciona `cycle_id`/`sleep_id` para obter data local e offset do evento.
- Webhooks permanecem fail-closed (`webhooks_disabled`). Não há endpoint ativo até existir implementação comprovada de assinatura, timestamp, replay e deduplicação para o contrato vigente de cada provedor.

## Configuração necessária

Secrets server-side, sem valores neste documento:

- `WEARABLE_TOKEN_KEYS`
- `WEARABLE_TOKEN_ACTIVE_KEY_ID`
- `OURA_CLIENT_ID` / `OURA_CLIENT_SECRET`
- `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET`
- já preservados: `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`, `POLAR_CLIENT_ID` / `POLAR_CLIENT_SECRET`
- `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

Callback único esperado pelo código:

`https://<project-ref>.supabase.co/functions/v1/wearable-connect/callback`

Não registrar apps, alterar redirect URIs ou preencher secrets sem aprovação explícita. Ausência ou keyring inválido retorna `config_required` e não inicia OAuth.

Escopos mínimos:

| Provedor | Escopos | Uso |
|---|---|---|
| Oura | `daily workout` | scores diários, sono detalhado (RHR/HRV/duração) e workouts |
| WHOOP | `read:recovery read:cycles read:workout read:sleep offline` | recovery/RHR/HRV, strain, sono, workouts e refresh |
| Strava | `read activity:read_all` | preservação das atividades existentes |
| Polar | `accesslink.read_all` | preservação AccessLink |

O callback valida os escopos retornados. Strava pode devolvê-los no callback; o token Polar documentado não ecoa `scope`, então o único escopo solicitado é registrado como concedido. Oura/WHOOP sem confirmação ficam `partial_scope`.

## Ordem segura de ativação futura

1. Fazer backup e produzir relatório dos devices legados que ainda possuem tokens em texto, sem exportar os tokens.
2. Criar o keyring fora do repositório e cadastrar os secrets aprovados.
3. Revisar a migration `20260814120000_wearables_secure_foundation.sql` em staging. Ela não aplica automaticamente nada.
4. Aplicar a migration em janela aprovada e validar grants/RLS/RPCs antes do deploy da edge.
5. Deployar `wearable-connect` e `ai-student-bnito`; validar `config_required`, OAuth negado/expirado/replay, uma conta de teste autorizada e disconnect.
6. Solicitar reautorização dos devices legados. As antigas colunas plaintext ficam em quarentena por grants de coluna e não são lidas pelo código novo.
7. Somente após confirmar que todos os devices ativos possuem registro cifrado, criar uma migration separada, aprovada e com rollback, para remover as colunas legadas. Não executar esse passo junto da migration foundation.

Os tipos gerados de Supabase não foram editados nem regenerados: nenhuma migration foi aplicada a um banco local/remoto nesta frente. Regenerar apenas a partir do schema aprovado depois da aplicação.

A migration histórica de julho agora condiciona as policies de wearable à existência das tabelas, que só são criadas em agosto. `node scripts/check-wearables-migration-order.mjs` valida essa ordem sem aplicar SQL. Um replay comportamental completo ainda precisa ser executado em um projeto Supabase efêmero aprovado; ele não foi feito nesta frente porque a autorização proíbe aplicar migrations, inclusive localmente.

### Rotação segura do keyring

1. Inventariar apenas contagens por `key_id` em `wearable_credentials`; nunca exportar ciphertext, IV ou tokens para relatório.
2. Adicionar a nova chave ao `WEARABLE_TOKEN_KEYS` e mudar `WEARABLE_TOKEN_ACTIVE_KEY_ID` somente após confirmar que a Edge consegue ler chaves antiga e nova.
3. Reembrulhar cada credencial no servidor: ler e decifrar com a chave antiga, cifrar com a ativa e atualizar com compare-and-swap em `version`. Conflito de versão deve ser reprocessado, nunca sobrescrito.
4. Repetir o inventário até a cobertura da chave nova ser 100% para todos os devices que ainda podem sincronizar ou concluir revogação pendente.
5. Executar um sync e um disconnect de teste em staging. Remover a chave antiga somente depois desses testes e de uma segunda confirmação de cobertura por `key_id`.

Não existe remoção automática de chave antiga nem job silencioso de rewrap nesta entrega; ambos exigem gate operacional e trilha de auditoria.

## Operação, revogação e retenção

- `sync`: pull incremental com sobreposição de 24h, paginação, timeout, retry exponencial para 429/5xx e falha fechada em 401.
- Strava usa `after` em epoch, `page`/`per_page=100`, heartbeat por página e upsert idempotente por atividade.
- `disconnect`: tenta a revogação oficial. Para Strava usa `POST /oauth/revoke`, Basic auth do cliente e corpo form-urlencoded `token`, sem registrar o token. Em sucesso apaga a credencial cifrada e registra consentimento revogado. Em falha bloqueia uso local, marca `revocation_pending`, preserva ciphertext apenas para retry e define `credential_delete_after` em 30 dias. Hoje o retry é manual pela UI; não existe cron oculto.
- Ao atingir o prazo com revogação ainda pendente, a decisão de apagar a última credencial e aceitar uma autorização externa possivelmente órfã é um gate de operador, com registro do incidente.
- `delete_data`: exige usuário autenticado dono e confirmação explícita `EXCLUIR DADOS`; apaga métricas, workouts, cursores e eventos daquele provider. Mantém ledger de consentimento e estado da conexão para auditoria.
- Disconnect e `delete_data` continuam disponíveis para o aluno dono após inativação; o RPC trava e revalida a linha atual de aluno, status e company, mas não exige `status=active` para impedir que inativação elimine o direito de revogar ou apagar dados.
- Desconectar não apaga automaticamente histórico já importado. O aluno escolhe a exclusão separadamente.
- BNITO só considera métricas `SCORED`, não nulas e com no máximo 48h. Dados antigos/pending/unscorable nunca viram zero recente.

## Validação local

```bash
npx -y deno@latest test --no-lock supabase/functions/_shared/wearables/*.test.ts
npx -y deno@latest check --no-lock supabase/functions/wearable-connect/index.ts supabase/functions/ai-student-bnito/index.ts
node scripts/check-wearables-migration-order.mjs
npm run test -- --run src/lib/wearablesMigration.test.ts src/lib/wearables.test.ts
npx tsc --noEmit
npm run lint
npm run test
npm run verify:backend
npm run build
```

Não executar migration, OAuth real, deploy ou push como parte desses checks.

Última execução local desta branch:

- testes dedicados: Deno `17/17`, Vitest `23/23`;
- Deno check das duas edges, TypeScript, lint dos arquivos alterados, backend guard e build: aprovados;
- suíte global: `343/344`; a única falha é o teste preexistente de RIR do deload em `prescription/engine.test.ts`, reproduzido sem esta branch no checkout canônico `2a2a9f9` (`49/50`);
- lint global: 8 erros preexistentes em `supabase/functions/ai-nutrition-meals/*` e 50 warnings históricos; os arquivos desta frente passam isoladamente.

Não corrigir esses dois baselines dentro da branch de wearables; pertencem às frentes de prescrição/nutrição.

## Referências oficiais consultadas

- Oura OAuth/authentication: https://cloud.ouraring.com/docs/authentication
- Oura API v2/scopes/resources: https://cloud.ouraring.com/v2/docs
- WHOOP OAuth/refresh/revoke: https://developer.whoop.com/docs/developing/oauth/
- WHOOP API v2 (cycle, recovery, sleep, workout e revoke): https://developer.whoop.com/api/
- WHOOP paginação: https://developer.whoop.com/docs/developing/pagination/
- WHOOP recovery: https://developer.whoop.com/docs/developing/user-data/recovery/
- WHOOP sleep: https://developer.whoop.com/docs/developing/user-data/sleep/
- WHOOP cycle: https://developer.whoop.com/docs/developing/user-data/cycle/
- WHOOP workout: https://developer.whoop.com/docs/developing/user-data/workout/
- Polar AccessLink OAuth, registro e DELETE de usuário: https://www.polar.com/accesslink-api/
- Strava List Athlete Activities (`after`, `page`, `per_page`): https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities
- Strava OAuth/revogação (`POST /oauth/revoke`, Basic auth e formulário): https://developers.strava.com/docs/authentication/

## Checkpoint vivo de staging — 2026-08-20

Estado confirmado no projeto `ifymocggowdlqqcxugko`:

- migration `20260814121000 wearables_secure_foundation` e follow-ups `20260815170922`/`20260815174923` aplicados;
- Edge `wearable-connect` ativa, versão 3;
- os seis arquivos do bundle baixado do staging têm SHA-256 idêntico ao código desta branch;
- `WEARABLE_TOKEN_KEYS` e `WEARABLE_TOKEN_ACTIVE_KEY_ID` presentes;
- credenciais cifradas: 0; devices: 0; estados OAuth: 0;
- `wearable_credentials` não possui colunas plaintext e não concede acesso a `anon`/`authenticated`;
- secrets OAuth ausentes: Oura, WHOOP, Strava e Polar;
- testes locais repetidos: Deno 17/17 e Vitest 23/23; `deno check` e ordem de migrations aprovados.

### Bloqueio externo exato

O código e a fundação de staging estão prontos. Para provar OAuth/sync de ponta a ponta ainda é necessário:

1. cadastrar ao menos um app OAuth de provedor com o callback de staging;
2. cadastrar client ID/secret desse provedor somente no staging;
3. disponibilizar uma conta wearable de teste com consentimento explícito;
4. validar `connect → callback → sync → refresh → disconnect → delete_data` e confirmar ausência de tokens em logs;
5. repetir com cada provedor antes de liberar sua integração em produção.

Como o usuário informou que atualmente não há Oura, WHOOP, Strava ou Polar disponível, essa etapa permanece **bloqueada por dependência externa**, não por código. Não comprar dispositivo, criar conta em nome de terceiro ou inventar credenciais para contornar o gate.
