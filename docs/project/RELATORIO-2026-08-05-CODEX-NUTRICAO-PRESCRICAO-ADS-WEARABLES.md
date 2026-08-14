# Relatorio Codex - Nutricao, Prescricao, BNITO, Anuncios e Wearables

Data: 2026-08-05

## Coordenadas canonicas

- Repositorio: `matheusrobaloloreto-alt/sett-your-fitness-hub`
- Branch de trabalho: `codex/claude-compat`
- Supabase ativo: `zshrcgbyhzxpnlccssyz` (Bn-app)
- Producao: `https://www.settapp.com.br`

## Estado executivo

O nucleo solicitado foi implementado e passou por validacao estatica e automatizada. A importacao de cardapio externo agora preserva a fonte, o motor de musculacao materializa periodizacao e metodos no contrato consumido pelo app, o BNITO recebe contexto de prescricoes e wearables, e foram preparados os modulos de anuncios e integracoes de dispositivos.

Nem tudo esta publicado. A migration de nutricao ja consta no banco remoto e `ai-nutrition-meals` ja foi publicada. As migrations de anuncios e wearables, a nova edge `wearable-connect`, o redeploy da versao atual de `ai-student-bnito` e o frontend ainda precisam de autorizacao explicita para publicacao.

## 1. Cardapio externo do nutricionista

### Implementado

- O PDF importado e tratado como **plano do nutricionista**, nao como dica produzida pelo SETT.
- O texto integral extraido e armazenado como fonte de verdade, mantendo ordem, secoes e proveniencia.
- A apresentacao usa a mesma linguagem visual organizada do plano nutricional do app, sem reescrever ou substituir o conteudo do profissional.
- Kcal, macros, horarios, agua e meta hidrica so aparecem quando estao efetivamente presentes no documento.
- O contador de agua usa a meta encontrada no cardapio; na ausencia dela, nao inventa uma meta.
- As refeicoes deixaram de ser condensadas em etiquetas que perdiam informacao. Blocos extensos permanecem legiveis e completos.
- O motor nutricional deterministico passou a considerar orcamento, restricoes, rotina, micro-ondas, sono, prontidao, agua e agenda de treinos.

### Banco/backend

- Migration aplicada: `20260805130000_preserve_external_nutrition_documents.sql`.
- Edge publicada: `ai-nutrition-meals`.

## 2. BN Prescription Engine - musculacao

### Contrato executavel

- Periodizacao de seis semanas permanece no plano publicado.
- O app resolve a semana vigente em vez de exibir somente uma descricao generica do ciclo.
- Metodos suportados e materializados: bi-set, tri-set/circuito, drop-set, rest-pause e cluster-set.
- Tipos de serie suportados: aquecimento, trabalho/normal, aproximacao, falha tecnica e drop.
- Bi-sets, tri-sets e circuitos persistidos sao agrupados visualmente na experiencia do aluno.

### Regras metodologicas verificadas

- Ordem das fases: mobilidade -> controle motor -> ativacao geral/core -> ativacao especifica -> pliometria -> forca geral/base -> forca isolada.
- Mobilidade, liberacao, alongamento e fisioterapia sao agrupados em circuitos quando ha itens suficientes.
- Pliometria so entra para intermediario/avancado sem dor ou restricao conflitante.
- Hipertrofia aumenta a participacao de maquinas e trabalho isolado.
- Performance aumenta controle motor, core, ativacao especifica e pliometria elegivel.
- Dor, anamnese e avaliacao funcional continuam sendo restricoes do gerador e do validador.
- O catalogo e carregado por paginacao, evitando limitar a prescricao ao primeiro lote. O ambiente de producao possui 917 exercicios disponiveis no catalogo consultado durante esta auditoria.

### Prova automatizada adicionada

- O teste de integracao acompanha o plano deterministico ate o contrato de `workouts`.
- Semana 3 comprova `rest-pause` e serie de falha.
- Semana 5 comprova agrupamento visual de bi-set/tri-set/circuito.
- As seis semanas sobrevivem a geracao, publicacao e resolucao por semana.

## 3. Prescricoes integradas

O Studio envia para os motores o pre-cadastro/anamnese, avaliacao funcional, plano anterior e contexto das demais modalidades.

- Musculacao: objetivo, nivel, disponibilidade, dores, lesoes, avaliacao, equipamentos, endurance e historico anterior.
- Corrida: objetivo/prova, volume e unidade, dias, experiencia, idade, FC, prontidao/TSB/EVA, musculacao e plano anterior.
- Ciclismo: objetivo, volume/unidade, tipo de bicicleta, potencia/FTP, disponibilidade, prontidao, musculacao e plano anterior.
- Natacao: objetivo, nivel, piscina, volume, pace/tempos, disponibilidade, recuperacao e plano anterior.
- Nutricao: objetivo, rotina, numero/horarios das refeicoes, restricoes, preferencias, orcamento, treino, sono, hidratacao e cardapio externo quando existente.

Cada motor permanece deterministico. A IA generativa e opcional para explicacao/orquestracao, nao e a fonte primaria da prescricao.

## 4. BNITO do aluno

### Identidade

- Para a empresa BN Performance Training, o fallback no backend e `BNITO`.
- `Setty` continua somente como fallback white-label generico para empresas sem personalizacao.
- A interface do aluno passou a aceitar a identidade retornada pelo backend como fonte autoritativa, em vez de iniciar visualmente com `Setty`.

### Contexto e atualizacao

- O hash de contexto considera prescricoes, avaliacao, treino atual e dados de wearable.
- O assistente atualiza ao ganhar foco, ao voltar para a aba e periodicamente.
- O contexto inclui treino da semana, progressao, metodos, avaliacao, alertas e sinais recentes de recuperacao.
- Sinais de wearable sao complementares: o BNITO pode orientar reducao conservadora e contato com a equipe, mas nao diagnostica nem altera clinicamente uma prescricao.

### Pendente

- A versao atual de `ai-student-bnito` ainda precisa de redeploy para refletir integralmente estes ajustes em producao.

## 5. Anuncios da plataforma

### Implementado localmente

- Painel master para criar, editar, ativar e segmentar anuncios.
- Segmentacao para app profissional ou aluno, todas/empresas especificas/alunos especificos.
- Posicoes: banner e rodape, com suporte a prioridade e janela de exibicao.
- O espaco nao e renderizado quando nao existe anuncio ativo elegivel.
- RPC valida empresa informada contra master/membership para evitar vazamento cross-tenant.

### Pendente de publicacao

- Aplicar `20260805140000_platform_ads.sql`.
- Publicar o frontend que contem `MasterAds` e `PlatformAdSlot`.

## 6. Oura, Apple Health, Garmin, Strava, Polar e WHOOP

### Implementado localmente

- Aba `Integracoes` no app do aluno.
- Cartoes de conexao, status, sincronizacao e desconexao.
- Painel unificado com sono, prontidao/recuperacao, FC, HRV, carga e treinos recentes.
- Edge `wearable-connect` com OAuth para Oura, Strava, Polar e WHOOP.
- Estados OAuth expiram e sao associados ao aluno/empresa/usuario.
- Garmin aparece como integracao que depende de aprovacao do programa do fornecedor.
- Apple Health aparece como integracao que depende de app iOS/HealthKit; navegador web nao possui acesso direto ao HealthKit.

### Pendente de publicacao/configuracao

- Aplicar `20260805150000_wearable_connections.sql`.
- Publicar `wearable-connect`.
- Cadastrar client IDs, secrets e callbacks de cada fornecedor.
- Obter aprovacao Garmin e implementar a ponte nativa iOS para Apple Health.
- Definir webhooks/rotina incremental para evitar que sincronizacao dependa apenas de clique manual.

## 7. Validacao executada

- `npm run lint`: aprovado com 0 erros e 50 warnings historicos.
- `npx tsc --noEmit`: aprovado.
- `npm run test`: 44 arquivos e 311 testes aprovados.
- `npm run build`: aprovado; backend canonico confirmado no build.
- `deno check` em `wearable-connect`, `ai-student-bnito` e `ai-nutrition-meals`: aprovado.
- `git diff --check`: aprovado.

Avisos nao bloqueadores:

- O bundle ainda possui chunks acima de 500 kB; recomenda-se divisao por rota, especialmente Studio, WhatsApp e paineis master.
- Permanecem 50 warnings de lint, principalmente dependencias de hooks e Fast Refresh antigos. Nao ha erro de lint.
- O controle do Chrome ficou instavel durante o QA visual final. A validacao automatizada passou, mas anuncios e wearables ainda precisam de uma rodada visual em desktop e mobile apos publicacao em preview.
- Nao foram disparadas mensagens reais, pagamentos reais nem conexoes OAuth reais durante a auditoria.

## 8. Ordem segura de publicacao

1. Aplicar `20260805140000_platform_ads.sql`.
2. Aplicar `20260805150000_wearable_connections.sql`.
3. Publicar `wearable-connect` no projeto `zshrcgbyhzxpnlccssyz`.
4. Republicar `ai-student-bnito` no mesmo projeto.
5. Configurar secrets/callbacks dos provedores disponiveis.
6. Publicar o frontend em preview e executar smoke test profissional/aluno.
7. Promover o preview para producao somente depois do smoke test.

## 9. Melhorias recomendadas

1. Criar um painel unico de recuperacao com tendencia de sono, HRV, carga e aderencia, em vez de uma aba separada por marca.
2. Gerar alertas para o treinador por mudanca sustentada, nao por leitura isolada, reduzindo falso positivo.
3. Registrar impressoes, cliques, conversao e limite de frequencia dos anuncios.
4. Exibir sempre a proveniencia do plano alimentar externo, data do documento e arquivo original, mantendo-o imutavel.
5. Medir aderencia e resposta por metodo de treino para o motor aprender quais dinamicas funcionam melhor por perfil sem depender de IA generativa.
6. Adicionar fila/webhooks de sincronizacao de wearables, consentimento granular e trilha de revogacao.
7. Dividir os bundles pesados por rota antes de ampliar o white-label para muitas empresas.

## Conclusao

O codigo esta consistente e os testes estao verdes. Nutricao externa e sua migration ja estao ativas; o restante desta rodada esta pronto localmente, mas anuncios, wearables e a atualizacao completa do BNITO ainda nao devem ser considerados ativos ate a sequencia de publicacao acima ser autorizada e executada.
