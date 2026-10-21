# SETT: preparacao local da recuperacao WhatsApp

Baseline: `codex/sett-load-save-release-20260928`, `f0f8fff`, 2026-10-21.
Escopo: `ops/whatsapp-evolution/` e este documento. Nenhum deploy, upload,
SSH, chave nova, secret, alteracao de DNS, migracao ou escrita remota nesta entrega.
QA independente da preparacao local aprovado em 21/10/2026, sem achados
bloqueantes. Raiz e revisor executaram 15 testes aprovados, 1 teste ignorado
por ausencia do plugin Compose e preflight estatico aprovado. A validacao
real no host continua obrigatoria e ainda nao foi realizada.

## Decisoes e estado

- A raiz informou autorizacao para DigitalOcean 4 GB, base US$24/mes, sem
  adicionais pagos. Login/provisionamento dependem do handoff do usuario.
- A pagina de login da DigitalOcean foi aberta no Chrome. Nao existe sessao
  autenticada disponivel nesta etapa; nenhum recurso foi criado ou cobrado.
- Segundo a verificacao da raiz, `settapp.com.br` usa DNS Hostinger
  `dns-parking.com`; `whatsapp.settapp.com.br` ainda nao tem registro. Esse nome
  e candidato, nao endpoint aprovado/configurado. Nao criar DNS automaticamente.
- A raiz confirmou uma unica linha de `whatsapp_instances`/empresa, desconectada.
  Isso nao prova ausencia de sessao no provedor nem autoriza recriacao.
- Metadata Railway informada: Evolution `evoapicloud/evolution-api:v2.3.7`,
  PostgreSQL `ghcr.io/railwayapp-templates/postgres-ssl:18`, Redis `8.2.1`.
- A raiz leu somente nomes das variaveis Railway: `AUTHENTICATION_API_KEY`,
  `CACHE_REDIS_ENABLED`, `CACHE_REDIS_URI`, `DATABASE_CONNECTION_URI`,
  `DATABASE_PROVIDER`, `PORT`, `SERVER_URL`. Nao havia `WEBHOOK_GLOBAL_*`.
  Preservar a API key existente; a nova senha de DB sera criada pela raiz
  em canal privado. Este pacote nao gerou chave alguma. `PORT` e metadata do
  host antigo; a fonte v2.3.7 le `SERVER_PORT`, fixado aqui em 8080.
  Client name/cache prefix nao foram confirmados como overrides antigos;
  em banco novo, a raiz pode escolher identificadores estaveis. Em restore,
  resolver os valores efetivos antigos antes de preencher os placeholders.
- O Compose usa a mesma Evolution e Redis e **Postgres oficial `postgres:18`
  exclusivamente para banco novo**. Nao e a mesma imagem SSL da Railway nem
  garantia de compatibilidade binaria de volumes. Nao montar o volume Railway
  diretamente neste servico. Digests/arquitetura/minor reais ainda precisam
  ser registrados pela raiz antes de qualquer pull no host; tags sao mutaveis.
- Os volumes Railway nao estao acessiveis para backup nesta etapa. O diretório
  privado `output/whatsapp-incident-20261019/backup-v89/` e snapshot de CODIGO
  da Edge Function, nao backup PostgreSQL/Redis/WhatsApp. Nao contem uma sessao
  recuperavel demonstrada. Nao copiar esse diretório para o servidor.
- Banco novo sem dados de sessao restaurados exige novo QR. Historico do SETT
  no Supabase nao deve ser removido para parear. Jamais manter duas copias
  ativas da mesma sessao WhatsApp, inclusive durante rollback.

## Topologia e seguranca

`Internet -> Caddy no host (TLS 443) -> 127.0.0.1:8080 -> Evolution`

PostgreSQL e Redis nao publicam portas e so participam da rede Docker interna.
Evolution participa tambem da rede de saida para WhatsApp e Supabase.
Redis sem senha e restrito a essa rede dedicada; acesso ao host/Docker equivale
a acesso privilegiado. Nao conectar outros containers a ela. O DB usa senha.
TLS interno de banco nao foi replicado: aceitavel aqui apenas no host unico,
rede interna e banco novo; migracao fisica demanda outro plano aprovado.

Volumes nomeados persistem instancias, PostgreSQL e AOF Redis. Para Postgres 18,
o mount e `/var/lib/postgresql`, com `PGDATA=/var/lib/postgresql/18/docker`.
Limites de RAM: Evolution 2 GB, Postgres 1 GB, Redis 512 MB (cache 256 MB,
`noeviction`); sobra aproximada de 512 MB para SO/Caddy. Sao limites iniciais,
nao dimensionamento comprovado: verificar OOM, disco, AOF e carga real.
Logs Docker usam rotacao local. Nao habilitar debug, payloads, access logs,
telemetria ou logs de webhook. Mesmo logs ERROR/WARN exigem revisao privada
antes de compartilhar; URLs de webhook podem conter token.

`Caddyfile.example` e para Caddy instalado **no host** pela raiz, substituindo
o placeholder pelo hostname aprovado. Libere 443 e 80 (ACME/redirecionamento),
restrinja SSH ao operador; nao libere 8080/5432/6379. Confirme A/AAAA, ausencia
de AAAA obsoleto, TLS e renovacao antes do cutover. Nao instalar Caddy aqui.
O exemplo bloqueia manager/docs/metrics/verify-creds. A API usa `apikey`;
frontend continua chamando o manager autenticado do Supabase, nao a Evolution.

## Variaveis e arquivos privados

No host, a raiz prepara `private/` modo **700**, arquivos regulares de seu
usuario modo **600**. Nunca versionar, fazer upload deste repo com `private/`,
incluir em tickets, comandos com valores inline, `set -x`, `docker inspect`
ou `docker compose config` sem `--quiet`. Docker guarda env em metadata local:
limitar membros do grupo Docker e acesso root.

Exemplo de preparacao de permissoes pela raiz, sem criar chaves:

```sh
cd /CAMINHO/PRIVADO/ops/whatsapp-evolution
umask 077
mkdir -p private
chmod 700 private
ENV_FILE="$PWD/private/evolution.env"
cp evolution.env.example "$ENV_FILE"
cp postgres.env.example private/postgres.env
chmod 600 "$ENV_FILE" private/postgres.env
# Preencher em editor privado; nao executar/source os arquivos.
```

Compose >=2.30.0 e necessario pelo `env_file.format: raw`: valores literais,
sem aspas de shell, sem interpolacao de `$`. O password PostgreSQL fica bruto
em `postgres.env` e percent-encoded na URI da Evolution. O preflight confere
igualdade, destino `postgres:5432`, DB/schema e minimos de 24/32 caracteres
(DB/API). Chave existente fora dessa politica exige decisao da raiz, nunca
rotacao silenciosa. Apenas nomes de variaveis e placeholders estao no Git.

Criticas confirmadas no codigo oficial v2.3.7:

| Variavel | Contrato |
| --- | --- |
| `SERVER_URL`, `SERVER_TYPE`, `SERVER_PORT` | Origin HTTPS publico; processo interno HTTP/8080 |
| `AUTHENTICATION_API_KEY` | Igual a `EVOLUTION_API_KEY` no Supabase; sem fallback de exemplo |
| `DATABASE_PROVIDER`, `DATABASE_CONNECTION_URI` | `postgresql`; URI com schema explicitamente verificado |
| `DATABASE_CONNECTION_CLIENT_NAME` | Preservar identificador original se houver restore |
| `DATABASE_SAVE_*` | Persistir instancia, mensagens, updates, contatos, chats, labels e historico |
| `CACHE_REDIS_URI`, `CACHE_REDIS_PREFIX_KEY` | Redis privado DB 6; preservar prefixo se restaurar |
| `CACHE_REDIS_SAVE_INSTANCES=false` | Sessao no banco, Redis como cache; confirmar config antiga antes de restore |
| `DEL_INSTANCE=false`, `DEL_TEMP_INSTANCES=false` | Nao expirar/remover automaticamente instancias |
| `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false` | Nao devolver chaves na listagem |
| `WEBHOOK_GLOBAL_ENABLED=false` | Webhook por instancia definido pelo manager existente |

Flags de seguranca/servicos ficam fixas no Compose; o preflight rejeita
variaveis privadas extras para evitar overrides silenciosos. `WHATSAPP_WEBHOOK_SECRET`
e `SUPABASE_SERVICE_ROLE_KEY` **nao pertencem ao env da Evolution**.

## Preflight e inicializacao manual (raiz)

```sh
node --test ops/whatsapp-evolution/config.test.mjs
node ops/whatsapp-evolution/preflight.mjs static
# Depois de preparar os arquivos privados, no host:
node ops/whatsapp-evolution/preflight.mjs host
```

Testes usam JSON (formato YAML valido aceito pelo Compose), Node nativo e
fixtures temporarias com placeholders. O teste opcional executa somente
`docker compose ... config --quiet`; sem plugin, fica SKIP explicito. Nenhum
daemon e necessario para parser/config. Nesta maquina o CLI existe, mas
`docker compose version` retornou comando desconhecido; instalacao oficial
do plugin, Docker Engine e Caddy pertence a raiz. `host` rejeita placeholders
e permissoes fracas; `status` consulta containers existentes sem iniciar nada.

Antes de subir qualquer container, a raiz decide **banco novo ou restore**,
documenta backup/rollback e confirma o provedor anterior parado. Nao ha script
de deploy, importacao ou limpeza. Com backup ausente, a opcao aceita e banco
novo com pareamento QR, mantendo volumes Railway intactos.

Para banco novo, somente apos esses gates, a raiz pode iniciar manualmente
`docker compose -f compose.json up -d postgres redis` neste diretório no host.
O entrypoint Postgres inicializa seu cluster vazio; isso nao cria o schema
Evolution. **A API nao migra automaticamente**: seu entrypoint foi trocado
por `node dist/main.js` porque o entrypoint oficial chama `db:deploy` e pode
imprimir URL do banco. Banco vazio nao esta pronto para a API.

Requisitos verificados na fonte oficial v2.3.7: o Dockerfile executa
`generate_database.sh` no build, que chama `npm run db:generate`. O schema
PostgreSQL usa `DATABASE_CONNECTION_URI`. A imagem final copia `node_modules`
(incluindo o cliente Prisma gerado), `prisma`, `dist` e `runWithProvider.js`.
`package.json` define `start:prod` como `node dist/main`; seu entrypoint normal
executa `deploy_database.sh`, com `db:deploy` e `db:generate`, antes de iniciar.
Portanto o override so e valido com imagem cujo client PostgreSQL esteja
gerado e banco ja migrado. Nao assumir isso apenas pelo nome da tag.

Ordem manual para **banco novo**, apos autorizacao de escrita no host e
preflight, executada pela raiz dentro de `ops/whatsapp-evolution/`:

```sh
docker compose -f compose.json up -d postgres redis
# Aguardar ambos healthy; a API ainda nao deve ser iniciada.
docker compose -f compose.json run --rm --no-deps --entrypoint npm evolution run db:deploy
# Exigir exit 0 e todas as migrations aplicadas antes de continuar.
docker compose -f compose.json run --rm --no-deps --entrypoint node evolution -e 'const {PrismaClient}=require("@prisma/client"); const c=new PrismaClient(); c.instance.count().then(()=>console.log("Prisma/schema OK")).catch(()=>{console.error("Prisma/schema FAILED");process.exitCode=1}).finally(()=>c.$disconnect())'
# Somente apos ambos os comandos acima terem exit 0:
docker compose -f compose.json up -d evolution
node preflight.mjs status
```

`db:deploy` usa `runWithProvider.js` para selecionar migrations PostgreSQL;
essa etapa escreve exclusivamente no novo DB local. Nao executada nesta
preparacao. Se o client nao corresponder ao provider, parar e revisar a imagem
ou executar `db:generate` num artefato controlado; gerar dentro de um container
descartavel nao corrige automaticamente o proximo container. Nao remover o
override para contornar a falha. Nao usar o entrypoint upstream,
`db:migrate:dev`, reset ou importacao automatica. Saidas de migration/Prisma
podem conter dados de conexao: nao compartilhar logs brutos; se forem retidos,
somente em arquivo privado modo 600, sem streaming para tickets/chats.
Para restore, parar aqui ate existir plano revisado com schema,
SSL, collation, extensoes, versao/digest e integridade confirmados; nao aplicar
migrations sobre dados recuperados por conveniencia.

Os tres servicos usam checks locais; Evolution consulta listagem autenticada
sem imprimir resposta/chave, depois de DB/Redis saudaveis. Dependencias
`service_healthy` ordenam startup, nao reiniciam automaticamente dependentes
em falhas futuras. `restart` trata saida do processo, nao status unhealthy.

## Integracao Supabase e aceite

Ler somente a configuracao pelo operador autorizado, sem anexar valores:
`EVOLUTION_API_URL` deve apontar ao origin TLS aprovado sem barra final;
`EVOLUTION_API_KEY` deve coincidir com `AUTHENTICATION_API_KEY`.
Essas variaveis sao globais e compartilhadas por `whatsapp-manager`,
`whatsapp-webhook`, `student-recovery-whatsapp`, `process-automation-sessions`
e `_shared/sales-funnel`, conforme inventario da raiz. Nao mudar SETT nem esses
secrets antes de HTTPS e autenticacao do novo host comprovados por read-back
e usuario pronto para o QR. O cutover afeta todos esses consumidores;
revalidar seus fluxos, mesmo havendo hoje somente uma empresa/instancia.
`whatsapp-manager` mantem `verify_jwt=true`, validacao de usuario/empresa e
admin/master nos diagnosticos. Nao redeployar ou enfraquecer essas protecoes.
`whatsapp-webhook` usa `verify_jwt=false` por ser callback externo, mas seu
handler rejeita secret ausente/incorreto. Preservar o mesmo
`WHATSAPP_WEBHOOK_SECRET` no manager, webhook e config de cada instancia.
O manager configura `/functions/v1/whatsapp-webhook` com `x-webhook-secret`
e fallback `?token=`; nao copiar a URL completa para logs. Conferir eventos
`MESSAGES_UPSERT`, `MESSAGES_SET`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`,
`byEvents=false`, `base64=false`. Nenhuma mudanca Supabase foi feita aqui.

Gate de aceite a executar pela raiz, sem confundir container com entrega:

1. Imagens/digests/arquitetura e schema conferidos; provedor antigo parado.
2. `preflight.mjs host` e `preflight.mjs status` aprovados; reboot/restart
   preserva volumes. Nao parear sessao real durante teste de infraestrutura.
3. TLS valido; 8080/5432/6379 inacessiveis externamente; listagem Evolution
   sem chave e com chave incorreta retorna 401/403. Com chave correta, lista
   saudavel e nome exato; 404 isolado nunca autoriza criar/remover instancia.
4. Manager sem JWT rejeita chamada; webhook sem secret/incorreto rejeita
   callback antes de gravar. Verificar secret com comparacao privada sem
   imprime-lo. Nao enviar callback sintetico com secret e payload real.
5. Cutover pelo SETT autenticado na empresa certa; se dados nao restaurados,
   ler novo QR com usuario. Confirmar apenas uma instancia ativa.
6. Mensagem canario somente com destinatario e texto autorizados; comprovar
   recebimento no aparelho, callback e atualizacao de entrega no SETT.

Rollback: parar a nova Evolution antes de considerar reativar a antiga.
Restaurar apenas URL/key de integracao previamente guardadas em cofre privado,
se a antiga estiver realmente utilizavel; com Railway indisponivel rollback
e interromper a nova e manter estado desconhecido, nao prometer recuperacao.
Novo pareamento pode invalidar sessao antiga. Nunca `down -v`, prune, apagar
volumes, resetar banco ou recriar instancia para contornar falha do provedor.
Depois do aceite, planejar backup privado consistente de DB, Redis e instancias
e ensaio de restore isolado sem ativar segunda sessao; nenhum adicional pago
esta autorizado e nenhum backup foi criado nesta entrega.

## Fontes e limites

- [Evolution v2.3.7: env e flags](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/src/config/env.config.ts)
  e [exemplo](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/.env.example).
- [Entrypoint upstream](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/Dockerfile),
  [script de migracao](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/Docker/scripts/deploy_database.sh),
  [geracao Prisma](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/Docker/scripts/generate_database.sh),
  [schema PostgreSQL](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/prisma/postgresql-schema.prisma),
  [scripts npm](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/package.json).
- [Imagem PostgreSQL oficial: PGDATA 18](https://hub.docker.com/_/postgres) e
  [diferencas do postgres-ssl Railway](https://github.com/railwayapp-templates/postgres-ssl).
- [Dependencias Compose](https://docs.docker.com/compose/how-tos/startup-order/) e
  [env_file raw](https://docs.docker.com/reference/compose-file/services/#format).
- Contrato local: `supabase/functions/whatsapp-manager/index.ts`,
  `supabase/functions/whatsapp-webhook/index.ts`, `supabase/config.toml` e
  `docs/project/ENTREGA-WHATSAPP-2026-10-19.md`.

Esta preparacao nao comprova compatibilidade em runtime, restauracao, DNS/TLS,
estado remoto atual ou entrega WhatsApp. Esses resultados dependem de acesso
do usuario/raiz e QA independente posterior.
