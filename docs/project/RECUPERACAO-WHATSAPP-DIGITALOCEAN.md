# SETT: recuperacao WhatsApp na DigitalOcean

## Checkpoint operacional 2026-10-21

- Usuario aprovou DigitalOcean ate US$24/mes e pediu reducao de custo.
  Criado `sett-whatsapp-01`, Droplet `611262433`, NYC1, Ubuntu 24.04,
  `s-1vcpu-2gb`, 2 GiB/1 vCPU/50 GB, **US$12/mes de base**.
  Sem backup pago, volume extra ou banco gerenciado.
- SSH exclusivo autorizado, chave publica cadastrada; chave privada somente
  no Mac. Acesso SSH e identidade do host confirmados, cloud-init concluido.
- Banco novo: origem Railway continua intacta e indisponivel para backup de
  sessao; novo QR pode ser necessario. Historico Supabase nao foi alterado.
- API key existente preservada em arquivos privados; nova senha PostgreSQL
  gerada, fora do Git. Nenhum valor sensivel integra este documento.
- Bootstrap revisado independentemente apos correcao do marcador UFW `(None)`;
  7/7 testes locais aprovados. SHA-256 aprovado:
  `6b12d9317e399934908e19eabcd6dd8097f945758ae15cd8e291adb511f205a3`.
- Instalacao concluida: Docker 29.9.2, Compose 5.6.1, Caddy 2.11.7.
  UFW permite SSH somente pelo IPv4 do operador e HTTP/HTTPS publicos.
  API em loopback; 8080/5432/6379/2019 bloqueadas em teste externo.
- DNS A `whatsapp.settapp.com.br` criado com TTL 300, sem alterar raiz/www.
  HTTPS valido. API exige chave: correta 200, ausente/incorreta 401.
- Corrigida incompatibilidade CORS do upstream v2.3.7: chamadas sem Origin
  recebiam 500. Proxy e healthcheck agora enviam origem fixa reservada;
  CORS continua restrito, sem wildcard e sem refletir origem do navegador.
- 27/27 testes de configuracao passaram no host, zero skips; 100 consultas
  autenticadas em concorrencia 5 passaram. Reinicio dos tres servicos
  preservou os volumes e 57 migrations; zero OOM. Memoria disponivel acima
  de 1.3 GiB em repouso/ensaio HTTP, nao prova pico de sincronizacao real.
- `EVOLUTION_API_URL` alterada no Supabase para o novo HTTPS. Chave e
  `WHATSAPP_WEBHOOK_SECRET` inalterados. SETT confirmou ausencia no novo
  provedor e criou uma unica instancia. QR exibido ao usuario; banco confirma
  `waiting_qr`, uma linha. Manager sem JWT e webhook sem secret retornam 401.
- Pendentes: usuario escanear QR, validar conexao/sincronizacao, consumo sob
  carga real e envio/recebimento. Nao declarar WhatsApp recuperado antes disso.
- Railway reconsultada antes do cutover: zero deployments ativos nos tres
  servicos; volumes antigos preservados. Nao reativar a origem em paralelo.

As secoes de preparacao abaixo registram o desenho e os gates originais;
nao devem ser lidas como evidencia de recuperacao operacional concluida.

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

## Adendo de orcamento: candidato 2 GB (2026-10-21)

Este adendo atualiza a direcao de orcamento acima, preservada como historico:
o usuario pediu reduzir o custo frente a US$24/mes. A raiz selecionara um
candidato de 2 GB/US$12 por mes; preco/plano final ainda exigem verificacao
pela raiz. A chave SSH foi aprovada, mas nenhum host foi criado nesta entrega
e o pagamento segue pendente. Nao criar recursos pagos nem fazer upgrade
automatico. Esta entrega e somente local, sem SSH, segredos ou acao remota.

`compose.low-memory.json` e um override opcional, sempre APOS `compose.json`:

| Servico | Limite do container | Limite interno |
| --- | --- | --- |
| Evolution | 1 GiB | `NODE_OPTIONS=--max-old-space-size=768` (MiB) |
| PostgreSQL | 384 MiB | sem alteracao de tuning nesta entrega |
| Redis | 128 MiB | `maxmemory 64mb`, `noeviction`, AOF preservado |

Total dos containers: 1536 MiB. Em 2048 MiB nominais restam 512 MiB para
SO, Docker e Caddy, acima do minimo orcado de 400 MiB. Isso e apenas um
orcamento de limites, nao prova de capacidade: RAM utilizavel pode ser menor,
o heap antigo V8 nao inclui toda a memoria do Node e Redis pode consumir
memoria extra para persistencia. `noeviction` recusa escritas quando cheio;
nao transforma pressao de memoria em operacao saudavel.

Semantica conferida na [documentacao oficial de merge Compose](https://docs.docker.com/reference/compose-file/merge/):
mapas de ambiente sao mesclados, escalares `mem_limit` substituidos e
`command` e substituido integralmente (nao concatenado). Por isso o override
repete o comando Redis inteiro, incluindo AOF. O
[limite de old space do Node](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes)
nao e um limite total de RSS; o [mem_limit do Compose](https://docs.docker.com/reference/compose-file/services/#mem_limit)
limita o container. Nao ha mudanca de imagem, dependencia ou arquivo privado.

Validacao local e gate obrigatorio no host, respectivamente:

```sh
node --test ops/whatsapp-evolution/config.test.mjs ops/whatsapp-evolution/low-memory.test.mjs
# No host com Compose >=2.30.0, exigir o teste de merge real, sem skip:
REQUIRE_COMPOSE=1 node --test ops/whatsapp-evolution/low-memory.test.mjs
```

O teste de merge real usa apenas arquivos temporarios com env vazio, sem
ler segredos, iniciar containers ou fazer pull. Os testes Node estaticos
validam o subconjunto exato de merge usado pelo override e rejeitam limites
da base, heap sem teto, comando Redis concatenado e politica com eviction.
O preflight legado continua lendo SOMENTE `compose.json`, inclusive com
flags Docker fixas: passar `host`/`status` nao valida este perfil de 2 GB.
Ele continua necessario para suas verificacoes de seguranca, mas nao pode
ser usado como evidencia de merge, limites efetivos ou saude deste candidato.

Depois dos gates existentes e apenas pela raiz, qualquer comando Compose
do perfil economico (config/up/run/ps/stop) deve usar os DOIS `-f` na mesma
ordem e o mesmo diretorio/projeto. Exemplo somente de validacao silenciosa:

```sh
docker compose -f ops/whatsapp-evolution/compose.json -f ops/whatsapp-evolution/compose.low-memory.json config --quiet
```

Antes de producao, a raiz deve registrar gate de runtime no host de 2 GB:

1. Confirmar RAM utilizavel e limites efetivos dos tres containers por
   campos selecionados de inspecao; nunca despejar env ou `docker inspect`
   completo. Registrar RSS/pico, memoria disponivel do host, OOMKilled,
   contadores de OOM do cgroup/kernel e contagem de reinicios antes/depois.
2. Exercitar inicializacao/migracao controlada, pareamento, sincronizacao
   de historico e carga representativa do pico esperado com margem definida
   pela raiz. Incluir persistencia/restart e rewrite AOF. Fixar e registrar
   volume, duracao, concorrencia e latencia aceitavel antes do ensaio;
   healthcheck verde ou teste ocioso nao substituem esse ensaio.
3. Exigir zero OOM, zero reinicio inesperado, nenhum erro Redis de memoria,
   nenhum crescimento continuo ate o teto e pelo menos 400 MiB disponiveis
   no host durante o pico. Confirmar saude de DB/Redis/API e entrega/callback
   pelo fluxo autorizado, com revisao independente antes do cutover.
4. Se faltar qualquer evidencia ou algum criterio falhar, ABORTAR o cutover,
   manter o estado seguro e levar o resultado a raiz. Nao afirmar que 2 GB
   suporta producao, nao elevar limites para consumir a reserva e nao migrar
   automaticamente para plano mais caro. Preservar volumes e a regra de
   nunca ativar duas copias da mesma sessao, inclusive no rollback.

Capacidade 2 GB, merge real no host, OOM/carga, QA independente e producao
permanecem pendentes; nenhum resultado local deste adendo os aprova.

### Bootstrap do host (preparado, nao executado)

Atualizacao informada pela raiz: host criado em plano US$12/mes, 2 GiB,
Ubuntu 24.04 amd64. Isso substitui a pendencia de criacao acima; o executor
nao acessou nem verificou o host. `bootstrap-host.sh` aguarda revisao da raiz.

Uso posterior, somente apos revisao: `sudo bash bootstrap-host.sh <operatorIPv4>`.
O argumento deve ser o IPv4 de origem do operador, nao o IP do servidor.
Se `SSH_CONNECTION` estiver disponivel, origem e porta 22 devem coincidir.
Verificar o IP efetivo e ter console de recuperacao antes de habilitar UFW;
apos executar, confirmar uma segunda sessao SSH antes de encerrar a primeira.

O script exige root, Ubuntu noble/amd64 e host sem workloads, aplicacoes em
`/opt/sett-whatsapp` ou regras UFW alheias. Recusa pacotes Docker conflitantes
em vez de remove-los. Instala Docker/Compose pelo repositorio oficial Docker,
Caddy pelo repositorio oficial indicado pelo projeto e Node.js via Ubuntu.
Nao executa upgrade geral, reboot, alteracao de sshd ou deploy. Compose menor
que 2.30.0 interrompe o fluxo; nao dispara upgrade automatico.

Prepara `/opt/sett-whatsapp` (root, 750) e `private/` (root, 700), sem criar
segredos. UFW permite 80/443 TCP e 22 TCP somente do IPv4 informado; entrada
padrao negada, saida permitida, IPv6 protegido. Portas publicadas por Docker
podem contornar UFW: manter o binding loopback da Evolution.

O marcador `/var/lib/sett-whatsapp-bootstrap` permite retomar falha parcial
com o mesmo operador, antes de haver aplicacao/dados. Nao remover marcadores,
regras ou dados para forcar o script a prosseguir. Instala com `policy-rc.d`
temporario para evitar inicio automatico de servicos; Caddy fica desabilitado
ate sua configuracao aprovada. Falhas nao fazem rollback de pacotes/repositorios.
Uma interrupcao abrupta pode deixar `policy-rc.d`, exigindo inspecao da raiz.
Pacotes podem habilitar unidades no boot; verificar servicos antes de reboot.
Nenhum bootstrap comprova capacidade, pareamento, TLS ou entrega WhatsApp.

Verificacao local prevista: `bash -n ops/whatsapp-evolution/bootstrap-host.sh`.
Fontes: [Docker no Ubuntu](https://docs.docker.com/engine/install/ubuntu/) e
[instalacao oficial do Caddy](https://caddyserver.com/docs/install#debian-ubuntu-raspbian).
