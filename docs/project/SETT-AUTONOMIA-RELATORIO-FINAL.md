# Escopo confirmado pelo Matheus — 28/10/2026

Esta secao prevalece sobre escopos anteriores abaixo. Infraestrutura de homologacao separada, gratuita e sem dados reais autorizada; producao continua sem autorizacao. Entrega disponibilizada para teste neste Mac: http://127.0.0.1:57650/admin/settings. Acessos ficticios no arquivo local privado output/hosted-staging-preflight-20261028/SETT-ACESSO-HOMOLOGACAO.private.md; nao usar login de producao.

- Papeis atuais suficientes; sem papeis arbitrarios ou ampliacao da agenda.
- Titularidade financeira/legal adiada; preparar tokens por empresa com sigilo e sem ativacao financeira.
- Studio EXCLUSIVO Master BN: a ampliacao local para clientes foi restringida no candidato. Nenhuma nova integracao paga/social nesta entrega.
- Regras tecnicas anteriores suficientes; nenhuma regra clinica livre nova.
- Contato de teste anterior autorizado para mensagens controladas; nunca usar alunos.

Concluido neste ciclo: compatibilidade e candidato no SETT Staging Free existente, QA nativo e preview conectado. Studio restrito e preparacao segura de integracoes implementados no candidato de homologacao. Resultado de testes anteriores nao certifica estas mudancas. Matriz acumulada e estados: [SETT-AUTONOMIA-ENTREGA.md](SETT-AUTONOMIA-ENTREGA.md).

## Resultado desta rodada — pronto para teste do usuario, sem producao

- ✅ SETT Staging existente reativado em organizacao Free; estado ACTIVE_HEALTHY e catalogo/ledger PostgreSQL lidos. Nenhum projeto/branch/plano pago criado.
- ✅ Duas tarefas cron antigas do staging pausadas por `cron.alter_job`, com retorno `active=false`, sem alterar comandos. Tentativa anterior de UPDATE direto foi recusada por ACL e revertida; nao se enfraqueceram permissoes.
- ✅ Studio corrigido localmente: sem menu/rota/edicao/RPC/Storage para clientes, inclusive master no candidato empresarial. BN Content Master canonico preservado. Revisao independente local aprovada.
- ✅ Integracoes Asaas/Evolution: preparacao local por empresa em Vault, UI write-only/status mascarado/CAS; consumidores desativados, conta atual intacta. Revisao independente local aprovada; ensaio Vault REAL passou (criptografia/decriptacao, tenant/roles, CAS, troca/remocao), terminou em rollback e nova conexao confirmou ausencia de fixtures/chaves.
- ✅ Agenda operacional: 34 testes focados aprovados; sem reservas/capacidade nova.
- ✅ TypeScript final, build local sintetico e 66 testes focados aprovados; nao e preview conectado nem publicacao.
- ✅ Auth e Storage reais responderam HTTP200 no staging; prova de saude, nao de upload/Auth de usuario.
- ✅ Compatibilidade minima: fonte revisada e ensaio DDL nativo passou; preflight inteiro repetido apos rollback confirmou schema/ledger anteriores. Aplicado de forma persistente SOMENTE no staging apos QA. Nova conexao confirmou 182 versoes do ledger e contagens anteriores intactas, quatro tabelas novas vazias, tres colunas presentes e cron pausado. Candidato completo foi instalado posteriormente somente no staging, apos reconciliacao canonica, ensaio e QA independente.
- ✅ Candidato com36 migrations instalado somente no staging apos reconciliar a funcao canonica de agenda, ensaiar e revisar. QA em nova conexao confirmou37 relacoes com RLS, nove contratos RPC, quarentena Studio, seis corpos de funcoes, ledger e contagens antigas preservados. Nenhuma producao alterada.
- ✅ Aceite funcional inicial hospedado:30/30 gates Auth/REST/RPC com fixtures novas, incluindo login GoTrue, salvamento/releitura, isolamento entre empresas, negativas por papel, publicacao de formulario, agenda, operacao comercial e conversao atomica de Lead/replay. Concorrencia de configuracoes com duas sessoes e sobreposicao HTTP resultou200/409; nao equivale ainda a ensaio concorrente de conversao Lead.
- ✅ Preview conectado neste Mac: http://127.0.0.1:57650/admin/settings, login ficticio Auth real. Mensagem semanal salva e recarregada com versao3; formulario publicado/recarregado versao1; chave ficticia preparada/oculta/recarregada/removida no Vault pela interface; agenda consumindo disponibilidade real. Rebuild confirmou zero atalhos Studio empresarial. Gateway revisado25/25 e14 testes focados de link/settings/scope aprovados pela raiz.
- ✅ Quatro aliases Edge isoladas inicializam apos reparo do bootstrap;16 gates passaram, incluindo cadastro/anamnese autenticados e negativas de tenant. Vinte handlers antigos preservados. Apenas quatro aliases sao encaminhadas; outros handlers/WhatsApp/Asaas pelo preview recusados.
- ✅ Conversao Lead concorrente final aprovada em QA independente:16/16 gates, duas sessoes Auth reais com janelas HTTP sobrepostas, mesma identidade/link nas respostas e apenas um aluno/historico/link/evento no readback. Falha SQL22P02 no caminho canonico apos insert reverteu sem orfao e permitiu retry valido. Nao houve instrumentacao de espera de lock PostgreSQL; o aceite comprova o resultado concorrente observado.

- ❌ Entrega WhatsApp/push e recovery com provedor real (aguardando): destino de teste autorizado, mas staging esta sem credencial/conexao de provedor e com automacoes desligadas. Nao copiar credenciais de producao nem criar sessao concorrente para forcar teste. Proxima acao: conectar um provedor dedicado de homologacao ou executar teste controlado de release apos aceite; nenhum envio real nesta rodada.
- ❌ Producao (aguardando teste do Matheus): nao publicar automaticamente.

---

# Atualizacao — proximos passos implementados, sem deploy

Esta secao e um checkpoint HISTORICO, superado pelo escopo e resultado da rodada no topo. O relatorio anterior abaixo tambem e historico;
o seu preview nao esta mais disponivel e seus resultados nao certificam o codigo
novo desta rodada.

## Entregas novas

- ✅ **Conversao atomica de Lead e preparacao de link:** duas RPCs de servico com
  ator autenticado novamente autorizado no banco, locks, controle de versao,
  politica comercial/transicoes e reutilizacao do link. Novo aluno, anamnese,
  historico inicial, associacao do Lead, link e evento fazem parte da mesma
  transacao. Nao ha envio ou ativacao financeira incidental.
- ✅ **Preservacao de identidade e historico:** telefone ambiguo recusado; pais e
  formato confirmados pelo professor em seletor com nomes de paises; numero
  estrangeiro nao recebe55 por tamanho. Perfis existentes conservam peso, altura,
  anamnese, dados fiscais e estagios financeiros. Associacao conferida novamente
  sob lock do perfil; telefone alterado enquanto o dialogo estava aberto e
  divergencia da resposta/rascunho bloqueiam a operacao, inclusive no replay. Concorrencia contra qualquer escrita arbitraria do app e
  unicidade global de telefone NAO sao garantias desta implementacao.
- ✅ **Studio com imagens e logo:** PNG/JPEG privados por empresa, referencias
  imutaveis, autorizacao de administrador/membro/modulo, limites de tamanho e
  pixels, URL assinada curta e nova leitura por renderizacao. Previa, PNG e ZIP
  usam os mesmos arquivos. Falha de midia bloqueia a exportacao; troca de empresa
  invalida operacoes pendentes. Documentos antigos continuam aceitos.
- ✅ **Revisao independente:** defeitos de pais/formato, regressao de etapa
  financeira, resposta anterior ao update e CASE do validador SQL foram corrigidos.

## Evidencia atual e limites

- Raiz:49 testes focados iniciais de biblioteca/contratos;56 testes na primeira
  suite integrada de confirmacao/esteira/RPC; fluxo de midia7/7. Apos o guard final
  de telefone confirmado, os14 testes do adapter e26 testes da confirmacao UI
  foram reexecutados:40/40 aprovados. Existem sobreposicoes e revisoes distintas;
  nao somar os totais nem transferir o resultado antigo para um hash novo.
  Duas falhas de timeout sob carga foram conservadas no log inicial e a suite
  correspondente passou isolada depois.
- TypeScript do app final e Deno check do handler final:exit0. Build em modo de
  producao com configuracao SOMENTE sintetica/local aprovado; hashes de fontes
  iguais antes/depois. BackendAvailable=false explicito: nenhum login ou preview
  conectado foi fornecido como funcional. Empacotamento:8/8 testes aprovados.
- Scanner de sigilo:416 textos de418 fontes, sem truncamento;8 alertas genericos
  revisados (referencias de sessao/variavel de ambiente, sentinela sintetica de
  teste e3 UUIDs de fixtures). Nenhum segredo real nesses alertas. Nao e prova
  universal de ausencia de segredos.
- QA de midia:13/13 regressões independentes e8/8 testes SQL PGlite em memoria.
  O SQL testa a migration real com catalogo Storage sintetico, politicas amplas
  legadas, isolamento/roles/feature, refs envenenadas, preservacao do validador,
  compatibilidade, estado/historico e conflito sequencial. Nao e Storage HTTP real.
- Uma revisao anterior da transacao de conversao passou no PostgreSQL isolado,
  incluindo falha injetada no ultimo passo/rollback, replay, perfil existente,
  pais/aliases e etapa financeira. Hash nativo aprovado:
  f7ad1792b295f901d645aa8b4ad77db506fbcea29eaf9ccaaa40b366bfab706f.
  Os guards adicionais de perfil selecionado e telefone confirmado foram incluidos depois: o codigo final
  possui revisao de fonte, MAS NAO aceite PostgreSQL nativo final.
- ❌ **Concorrencia real:** a tentativa com duas sessoes falhou ANTES da instalacao
  e dos fixtures; nenhum PASS. O harness nao aprovado foi retirado do candidato.
  O roteiro independente de locks observados/commit/rollback permanece no parecer.
- ❌ **Storage/browser com upload real:** a migration inicial revelou42601,
  corrigido e comprovado no PGlite; o Auth do ambiente retornou502 e a unica
  reconstrucao falhou no baseline. Nenhum upload real/assinatura/pixel de imagem
  nova foi certificado. O PNG/ZIP SEM imagens do candidato anterior continua como
  evidencia historica daquele candidato, nao substitui o novo teste.
- ✅ Os dois runtimes ficticios foram encerrados/removidos por identidade exata;
  containers, redes e servicos ausentes confirmados. Shared57422 e producao
  permaneceram intocados. Nenhum restart global de Docker/Colima, deploy, envio,
  cobranca ou geracao paga foi executado.

## Pendencias e alternativas

| Item | Estado e motivo | Proxima acao / alternativa |
|---|---|---|
| Aceite nativo final de conversao e concorrencia | ❌ Bloqueado pelo ambiente local | Recriar em instancia nativa saudavel e verificar duas sessoes realmente sobrepostas, contagens e rollback; staging somente com autorizacao |
| Storage real e browser com imagens/logo | ❌ Bloqueado pelo mesmo ambiente | Executar upload PNG/JPEG, sign/read/deny, save/reload, expiracao e PNG/ZIP visual; manter editor textual/exportador anterior ate esse gate |
| Preview conectado | ❌ Bloqueado: backend encerrado apos falhas | Restaurar o ambiente isolado; build sozinho nao disponibiliza login/persistencia |
| Publicacao/provedores/scheduler/cobranca/IA paga | ❌ Aguardando: restricao de nao deploy continua vigente | Fechar gates e receber autorizacao especifica para efeitos externos |
| Papeis arbitrarios, titularidade financeira/legal, reservas/capacidade, regras clinicas livres e publicacao social | ❌ Aguardando contratos e integracoes especificos | Manter controles tipados existentes; decompor por capacidade real sem elevar permissoes, alterar historico ou misturar cobranca |
| Diagnostico PostgreSQL historico | ❌ Bloqueado: causa nao demonstrada e frente restrita | Suporte/ambiente diagnostico independente; nao inferir causa nem tentar probes de crash nesta entrega |

Nao repetir a instalacao nativa em loop. Para recuperar a homologacao, usar um
ambiente dedicado saudavel; se for necessario reiniciar Docker/Colima compartilhado,
coordenar antes porque outras tarefas podem depender dele. Nao publicar estas duas
melhorias como homologadas antes dos gates acima.

Pareceres: `docs/superpowers/2026-10-28-atomic-conversion-review.md` e
`docs/superpowers/2026-10-28-studio-images-review.md`. Fontes, testes e migrations
novos preservados num checkpoint LOCAL separado, sem substituir o candidato
anterior nem alterar HEAD/indice da branch. Identidade exata no artefato
`output/self-service-next-candidate/checkpoint.json` apos fechamento.

---

## Relatorio anterior — historico do candidato a90213bb

# SETT — implementação da autonomia e homologação local

Objetivo: permitir que cada empresa configure os fluxos de negócio dentro do
SETT, preservando isolamento entre empresas, histórico, permissões comerciais e
proteções de envio/pagamento. A matriz acumulada A01–A33 está em
[SETT-AUTONOMIA-ENTREGA.md](SETT-AUTONOMIA-ENTREGA.md).

## Estado da entrega

Trabalho local na branch `codex/sett-self-service-local-20261026`, baseline
`45b6c3af4f99766c69bc9f1dbb8bd177b6ce634c`. Sem push, staging, deploy, alterações
no banco remoto, envio de WhatsApp/push real, cobrança ou consumo de IA paga.
O ambiente de teste usa contas e dados fictícios e serviços locais com o schema
real reconstruído. Não é cópia de dados dos alunos nem certificado de produção.

Preview compilado: http://127.0.0.1:57632 . Funciona neste Mac enquanto os
processos locais estiverem ativos. Acessos fictícios ficam somente no arquivo
privado `output/self-service-local-20261026/sett-complete-2bc6d1bf8461b6a0.private/preview-access.private.json`.
Não usar senha de produção nesse ambiente. Nenhum segredo é incluído no pacote.

## O que foi acrescentado nesta rodada

1. **Metodologia executável no painel da empresa.** Semana por semana: fase,
   RIR, percentual de volume, métodos permitidos e progressão entre ciclos.
   O motor determinístico consome a configuração. Deload, limites clínicos e
   prescrições históricas são preservados. Extras da anamnese inicial versionada
   podem mapear objetivo, frequência, duração e equipamentos enumerados.
2. **Governança da empresa.** Convite nominal com aceite, expiração, auditoria e
   controle de versão para trocar o titular cadastral entre administradores
   existentes da mesma empresa. Perfis nomeados agrupam a permissão de dashboard
   existente sem apagar concessões manuais.
3. **Operação e relatórios.** Edição dos rótulos, ordem, visibilidade e transições
   operacionais da esteira, com consumo na esteira real e triggers no banco.
   Relatórios de contagem e participação por status no dashboard. Transições de
   pagamento e ativação continuam nos fluxos verificados.
4. **Disponibilidade na agenda.** Janelas semanais e exceções por data/fuso,
   com validação de sobreposição, editor próprio e visualização na agenda.
5. **Conteúdo e padrões no Master.** Edição versionada da landing, rodapé,
   suporte, XP e conquistas. Cada empresa confirma explicitamente a adoção dos
   padrões de gamificação; isso não recalcula o histórico.
6. **Studio editorial por empresa.** Identidade, paleta, publicações, slides,
   legenda, estado editorial, datas, prévia e exportação PNG/ZIP. Persistência
   e isolamento empresarial, com formatos carrossel e story.
7. **Envios e recuperação.** Revisão/suspensão de ocorrências incertas sem botão
   de reenvio inseguro. Ledger, leases e recibos no webhook. O aluno, destinatário,
   consentimento e autorização são revalidados antes do envio, inclusive após
   esperas e após o início durável da tentativa. Sessão antiga sem identidade
   confiável falha de forma conservadora.
8. **Integração e empacotamento.** Rotas, menus, atalhos de configuração,
   convite empresarial de pré-cadastro, validação de link/empresa, ambiente local
   compilado com quatro handlers reais e manifesto explícito de fontes.

## Correções encontradas na validação

- SQL do funil concatenava pares de transição com precedência incorreta. Uma
  migration forward corrige a expressão; salvar/reler com transições não vazias
  passou no PostgreSQL real isolado e na regressão independente.
- Mudança apenas de status podia escapar da política operacional; o trigger
  passa a observar status e etapa. Campos ausentes são normalizados no servidor.
- Chat reassociado ou desvinculado durante um envio podia reutilizar contexto
  privado do aluno anterior. Agora a identidade original é imutável no contexto e
  verificada novamente nos dois caminhos de envio/retomada.
- Convite de pré-cadastro legado usava texto BN fixo. Agora usa template e marca
  empresariais e recusa resultado assíncrono de outra empresa/link.
- CMS Master excedia a largura de 390px no celular. A linha de ações agora permite
  quebra, com limites de largura adequados; validação compilada final registrada
  abaixo.
- Fixtures antigas foram adaptadas às novas dependências; os contratos estáticos
  de catálogo verificam o loader da biblioteca, não o `limit(1)` legítimo de uma
  consulta de formulário. A negativa de log de corpo bruto do provedor foi mantida.

## Evidência e critérios de aceite

- Sete grupos com autenticação GoTrue, REST e PostgreSQL reais locais: metodologia
  salvar/reler/conflito; titularidade ida/volta e perfil de permissão; funil e
  métricas; disponibilidade e exceções; CMS/adoção XP preservando metodologia;
  rascunho Studio; negações de outro tenant/aluno e projeção de reconciliação.
  **7/7 aprovados**. Nenhum provedor externo participou.
- Webhook/comunicações/identidade: **37/37**. Retomada cron e identidade na fronteira
  durável: **26/26**. Há sobreposição; não somar como testes únicos.
- Testes focados dos cinco arquivos que falharam na primeira suíte geral:
  **50 aprovados, 1 opt-in SQL não executado**. A primeira suíte geral foi mantida
  como evidência de falha, não convertida em sucesso retroativamente.
- TypeScript do app: `tsc -p tsconfig.app.json --noEmit`, exit 0. Deno check dos
  handlers de cadastro/prescrição, exit 0. Lint focado e diff-check aprovados.
- Navegador compilado: login real fictício; configuração salvar/recarregar/restaurar;
  rotas novas desktop/mobile; Studio salvar/reler e downloads reais. PNGs 1080×1350
  e 1080×1920, ZIP com duas imagens, legenda e metadados. Inspeção visual dos
  arquivos e isolamento de rede fazem parte do gate independente.
- Suíte geral final: **280 arquivos aprovados, 2.086 testes aprovados, zero falhas;
  2 arquivos/9 testes opcionais não executados**. O teste SQL opt-in de metodologia
  não foi rotulado como aprovado; a validação Auth/REST nativa está registrada à parte.
- Rechecagem compilada do CMS Master mobile: **1/1**, largura 390/390px, sem
  elementos excedentes. Somada aos outros onze casos únicos já aprovados,
  encerra os doze aceites de navegador desta rodada, sem repetir os que passaram.
- Revisão determinística de sigilo: 398 arquivos de texto examinados no snapshot
  explícito de 400 arquivos, sem truncamento. Cinco alertas genéricos revisados:
  três referências a `session.access_token`, uma string de teste sintética e uma
  referência `import.meta.env` à chave pública. Nenhum literal secreto real nesses
  alertas. O scanner não oferece prova universal de ausência de segredo.
- O build final verificou os mesmos hashes de fontes do app/Edge antes e depois
  da compilação. O snapshot local não altera HEAD/índice da branch nem publica.

## O que permanece e como atingir a meta

| Pendência | Estado / por que não foi encerrada | Caminho concreto |
|---|---|---|
| Provedores reais, scheduler hospedado, mensagens, pagamentos e IA paga | ❌ Aguardando: a ordem vigente exige validação local sem deploy/efeitos reais | Homologar este candidato; depois usar staging e destinatário fictício/autorizado, com recibos, custos e rollback explícitos |
| Publicação | ❌ Aguardando: não autorizada nesta etapa | Publicar app e migrations como um único candidato após aceite; conferir consumidores e permissões no destino |
| Titularidade legal/financeira | ❌ Aguardando contrato: `owner_id` cadastral não equivale a `owner_user_id` do checkout nem titular do provedor | Fluxo separado de transferência com verificação de cobrança, aceite e auditoria; até lá, titularidade cadastral e administração existente |
| Permissões arbitrárias por módulo | ❌ Aguardando ampliar contrato: perfis novos agrupam apenas `company_dashboard_full`, a permissão existente suportada | Enumerar capacidades realmente executáveis, introduzir verificação server-side por capacidade e migrar concessões atuais antes de expor novos controles |
| Reservas, capacidade e cobrança na agenda | ❌ Aguardando contrato: disponibilidade civil não cria agendamento | Definir duração, profissional, conflitos, fuso e cancelamento; implementar reserva atômica. Hoje usar agenda atual e camada de disponibilidade |
| Mapeamentos clínicos/texto livre e extras legados | ❌ Aguardando contrato seguro: não há execução arbitrária de respostas como regra clínica | Usar anamnese inicial versionada e quatro destinos suportados; avaliação/prescrição clínica continua profissional |
| Studio com geração paga, uploads editoriais e publicação social automática | ❌ Aguardando integração específica: esta entrega é editor manual/exportador | Hoje criar/exportar no Studio; conectar mídia/modelo/publicação posteriormente com autorização por empresa e orçamento |
| Conversão inteira de lead como transação única | ❌ Aguardando: preflight e triggers existem, mas múltiplas chamadas HTTP não são uma única transação | RPC atômica abrangendo as mutações autorizadas, preservando versão da política; não prometer atomicidade global neste candidato |
| Diagnóstico das interrupções PostgreSQL anteriores | ❌ Bloqueado: causa não demonstrada; investigação anterior restrita e excluída desta frente | Suporte do provedor/ambiente diagnóstico independente. Manter evidência histórica; o novo PASS não prova correção causal |

Essas limitações estão registradas como pendências, não como implementações
completas nem dependências ocultas do Codex. As tarefas operacionais suportadas
acima já possuem controles dentro do SETT; credenciais, infraestrutura e reparos
sensíveis continuam administrativos/técnicos por desenho.

## Reprodução e reversibilidade

- `scripts/qa/autonomy-product-preview.mjs`: cria exclusivamente seu runtime
  fictício e aguarda o operador; não reutiliza o postmaster compartilhado.
- `scripts/qa/autonomy-product-rpc.mjs`: aceite autenticado com dados fictícios.
- `scripts/qa/autonomy-product-release.mjs <arquivo-privado-de-acessos>`: handlers
  em loopback sem rede externa, build estável e preview compilado.
- `scripts/autonomy-candidate.mjs write|verify|checkpoint`: fontes explicitamente
  permitidas e hashes; checkpoint usa índice Git temporário e ref local, sem
  alterar HEAD/índice da branch, sem push/deploy. Evidências privadas ficam fora.
- Encerramento: SIGTERM somente nos PIDs exatos registrados pelos drivers. O
  driver compilado aguarda os próprios filhos e registra cleanup; o driver do
  backend remove apenas seus recursos identificados. Não limpar por prefixo,
  não resetar o banco compartilhado nem remover outros ambientes.

Revisões independentes: `docs/superpowers/2026-10-28-autonomy-product-review.md`
e `docs/superpowers/2026-10-28-governance-operations-review.md`. Os handoffs de
metodologia, governança, operações, agenda, conteúdo e comunicações conservam as
etapas históricas; esta síntese e a matriz única representam a fila corrente.

## Fechamento do candidato

✅ Candidato com manifesto explícito em `output/self-service-local-candidate/manifest.json`
e identidade Git em `output/self-service-local-candidate/checkpoint.json`.
Checkpoint local auditável, com readback dos blobs, sem alterar branch/índice,
sem push/deploy. Validação de empacotamento e encerramento de filhos próprios:
**12/12 testes aprovados**. Fontes do preview permanecem congeladas e o ambiente
foi deixado ativo para teste; não afirmar que esses recursos ativos foram removidos.
Os quatro handlers do preview anterior foram encerrados por identidade exata
antes da reconstrução final. O backend fictício continuou intacto.
