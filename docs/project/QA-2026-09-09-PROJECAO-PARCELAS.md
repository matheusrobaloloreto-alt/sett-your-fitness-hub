# QA independente: projecao de parcelas

## Veredito atual

GO final: QA funcional independente local concluida; release e canario de producao aprovados
conforme evidencias da root registradas abaixo. Os quatro blockers foram corrigidos e
retestados independentemente. Nenhuma pendencia de gate desta entrega permanece aberta.
O primeiro patch frontend permanece rejeitado e foi substituido. Ownership desta QA: este documento e,
por autorizacao posterior da root, src/pages/admin/FinancialDashboard.test.tsx.
Nenhuma alteracao de codigo de produto, banco ou commit feita pela QA.

Worktree: /Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc.
HEAD de partida: 25bb75316d8624ce1164060467768e0988c80780.
Executor: tarefa 01a08803-d8c2-72d2-8190-7ca6649d95f4. Root coordena backend/schema.

## Fechamento de producao: evidencia da root

Recebido da root em2026-09-09; nao representa nova consulta PROD ou inspecao de browser
realizada por esta QA. A QA independente local e os resultados reportados pela root
permanecem separados para rastreabilidade.

- Edge asaas-integration v75 ACTIVE; chamada sem JWT retorna401.
- Deploy Netlify:6aa1d3a7b9c96039394ee73d. Chunk FinancialDashboard-y2NczZ2q com
  SHA256 local/remoto identico:2d6d4d913724199a5f500d1e6d22e64e2410a70fe9495a690e54a6d94215e947.
- Canario autenticado: Browser POST200; snapshot local124/provider106/grupos17;
  entries126/unique126, zero IDs duplicados; unresolved18, todos missingid.
- Nove grupos validados com seis parcelas230, total1380 e ordinais1..6.
- UI real: caixa de setembro460 versus4378.47 anterior, que misturava previsao/erro;
  previsao de outubro2516.66. Valores informados no canario, nao extrapolados para outros meses.
- SQL pos-canario:143payments,125providerIDs,2lifecycle; hash
  4398b37b9f99676f56a6c29372e296a6 identico ao baseline. Nenhum Sync ou acao fiscal clicado.
- Root:37/37testes focados PASS; TypeScript36erros preexistentes e ZERO novos;
  build PASS. Nao equivale a tsc total sem erros.

Encerramento: correcao entregue e gates fechados. As18linhas sem ID continuam pendentes de
conciliacao autoritativa e explicitamente excluidas, nao corrigidas por heuristica nem
apagadas. Essa pendencia de dados nao e falha de completude silenciosa do novo snapshot.
Esta QA nao fez commit, deploy, Sync, emissao fiscal ou qualquer escrita no banco.

## Fechamento dos blockers

1. RESOLVIDO: count=null retorna HTTP503; index.ts:1303-1313. Fixture do adapter real passou.
2. RESOLVIDO: grupo com seis ordinais corretos, mas ID da ancora substituido, nao emite entries
   e retorna unresolved. Helper asaas-financial-projection.ts:253-267 verifica IDs das ancoras
   locais impactadas. Nao depende apenas do contador/ordinal nem do fallback GET individual.
3. RESOLVIDO: falha total nao mostra caixa R$0, historico falsamente vazio ou chart numerico;
   preserva linhas locais como indisponiveis e bloqueia fiscal. Dashboard:419-437,546-555,1075.
   Teste RTL reforcado passou; nenhum fallback ao total1380.
4. RESOLVIDO: SELECT e count CREDIT_CARD nao filtram mais asaas_payment_id nulo;
   helper:194-197 emite missing_asaas_payment_id. Fixture adapter retorna18unresolved+6entries,
   total1380; RTL percorre paginas20+4, encontra18pendentes+6parcelas230, aviso parcial e
   fiscal desabilitado. Nenhum total desconhecido entra nos indicadores.

Sem blocker funcional residual reproduzido nestes gates. As18linhas permanecem SEM valor
autoritativo conciliado, nao foram corrigidas no banco. Root informou agregado PROD:
124CARD (18semID),13PIX,6UNDEFINED; dados nao reconsultados por esta QA.

TypeScript: fixture dateCreated required corrigida. Root informou baseline CompilerHost/HEAD
de36erros em8arquivos nao editados; criterio de release e ZERO erros novos, nao tsc total PASS.
Compiler/build e canario PROD foram concluidos pela root, conforme secao de producao acima;
nao foram executados por esta QA.

### Ultimo ajuste UI fail-closed

A root encontrou, apos o primeiro congelamento, Pendentes/Atrasados ainda com0/R$0 e
Caixa por aluno vazio sem ressalva de falha Asaas. Esse achado reabriu o gate de falha;
Ampere ajustou apenas esses estados. QA reforcou o teste do componente real para exigir:
Pendentes/Atrasados sem zero/valor zero e com indisponibilidade ou parcial explicito;
Caixa detalhe por aluno sem "Nenhum recebimento previsto" e com ressalva de conciliacao.
Reexecucao final:17/17RTL+helperUI PASS. GO funcional/DOM restabelecido neste snapshot.
Os outros cinco hashes da tabela permaneceram identicos; nove cenarios adapter e10Deno
foram repetidos com sucesso apos o primeiro congelamento, antes desse ajuste apenas UI.

Evidencia visual informada pela root (nao inspecao visual independente desta QA):390px e1440px,
faturamento1380, ticket1380, caixa230, futuro230. Root confirmou tambem o visual final de
falha: cinco KPIs principais/secundarios com traco e caixa por aluno pendente. Nesta QA,
validacao independente por RTL/DOM; canario autenticado concluido pela root conforme acima.

Ultima revisao copy-only pela root: rotulo "Parcial conciliado" substitui a referencia
restritiva a valores sem cartao; aviso de erro do provider preservado. Reexecucao17/17PASS
com Dashboard hash1b7327d5 abaixo. Testes ja verificam indisponibilidade/parcial sem fixar
o rotulo antigo, portanto nenhuma mudanca adicional nas expectativas foi necessaria.
Fixtures e valores esperados permanecem iguais; os seis outros hashes nao mudaram.

## Gates ja aprovados no patch substituto

- UI/RTL: dez testes + sete testes helper UI passaram (17/17), incluindo falha total e18semID.
  Inclui ticket 1380 por uma compra, seis parcelas 230, datas civis, ordinal, fiscal pay_2 exato,
  parcelas provider-only bloqueadas, forecast CONFIRMED futuro separado de caixa, exclusao de
  ambiguidade, troca master A/B e resposta A atrasada sem sobrescrever B.
- Adapter real com mocks: nove cenarios passaram; sucesso6x230,18missingIDs preservados,
  countnull503, pagina curta hasMore=true, hasMore ausente, pagina2com erro,
  paginas de grupo duplicadas, ancora exata ausente e customer divergente fail-closed.
  A nova funcao financialProjectionAsaasGet foi incluida com fetch mock GET-only, sem rede.
- Auth real com mocks: sem auth=401; trainer=403; admin empresa forjada=403;
  admin propria empresa e master empresa selecionada preservam escopo exato.
- Helper backend Deno: 10/10 passaram; cobre countnull de sibling, semID e ancora porID.
- ESLint do arquivo RTL: PASS. Nenhuma escrita PROD, deploy ou commit nesta QA.

### SHA256 do snapshot validado

| Arquivo | SHA256 |
| --- | --- |
| src/pages/admin/FinancialDashboard.tsx | 1b7327d51f8ec9276b997ab94c2513ce6118fa901b93f4ad4a1afe81ee8b8525 |
| src/pages/admin/FinancialDashboard.test.tsx | effe7f136a398df5071f19190542408d5a404db5f86db0c092d88c798fefa890 |
| src/lib/financialProjection.ts | 6a5d2fb3a649b206b84e1b64cb6260b065c83bbafb76151b058b169236c805ea |
| src/lib/financialProjection.test.ts | a2307e661335048b5922992ecb34a3381069c41b16e21c7c5c430e019718cdb8 |
| supabase/functions/asaas-integration/index.ts | bfc676e8c47f756398b25336eb305151d5d345f4d4018a41c40b2e3daf755d3b |
| supabase/functions/_shared/asaas-financial-projection.ts | 0f4323f2ff337e8748d6ae5badffc74c6f39e197a09fe56851c9202b5e59df4e |
| supabase/functions/_shared/asaas-financial-projection.test.ts | 4ccd3fcfa12a6e75e81584dee0a597791bbe6c7312bb01b5be931b7e57739132 |

Os achados abaixo sao historicos com evidencias de reproducao; nao sao blockers adicionais.

## Achados confirmados primeiro

1. P1 - Dupla divisao no codigo original.
   FinancialDashboard.tsx no HEAD de partida, linhas 129-143, divide toda linha CREDIT_CARD com
   installment_count>1 e distribui em meses. syncPayments, asaas-integration/index.ts:1183-1193,
   insere ap.value de cada cobranca individual com contador de grupo. Portanto uma parcela de
   230/6 e reduzida a 38,33 por mes; 208,33/12 vira aproximadamente 17,36. Os exemplos de PROD
   foram informados pela root; a QA confirmou os caminhos de codigo, sem consultar dados privados.

2. P1 - O legado nao tem discriminador seguro de TOTAL vs PARCELA.
   git show 23bf009:supabase/functions/asaas-integration/index.ts, funcao createCardPayment,
   grava value=Number(value total), asaas_payment_id=payment.id e installment_count, sem plan_id
   ou checkout_request_key. A mesma revisao syncPayments grava ap.value por cobranca.
   O commit 23bf009 introduziu contagem por grupo sem normalizar o valor das linhas existentes.
   Hoje o checkout grava total em amount/value (index.ts:711-727) e envia totalValue (764-765);
   sync existente (1167-1174) altera status/url/count, preservando value antigo.
   getPaymentStatus (1068-1079) e webhook (asaas-webhook/index.ts:191-197) tambem nao
   reconciliam a base do valor. Logo pay_, plan_id ausente, checkout key ausente, status,
   preco ou amount=value NAO provam a origem.

3. Evidencia adicional limitada: seed manual total.
   Migration 20260421204814_753caeeb-41cc-4df7-a010-ba25451de6ff.sql:61-74 insere
   amount=value=1380 e installment_count=6, sem marcador de base e sem asaas_payment_id.
   Prova que existiu importacao manual de totais; nao prova que alguma linha pay_ atual e
   exatamente esta linha. Nenhum dado identificador pessoal do seed foi copiado aqui.
   Migration 20260730184500_reconcile_payment_amount_columns.sql:3-15 copia value para amount;
   igualdade dos dois campos tambem nao e metadado de origem.

4. P1 - Primeiro patch desloca a distorcao para o caixa atual.
   financialCashProjection.ts (primeiro WIP):64-70 devolve valor inteiro para origem desconhecida;
   FinancialDashboard consome a entrada nos KPIs, grafico e detalhes. Assim 1380 desconhecido
   entra como 1380 no mes; total+parcelas individuais segue duplicado. Teste inicial que espera
   esse resultado documenta a regressao, nao uma garantia financeira. Root acatou NO-GO.

## Criterio seguro e novo escopo

A resposta do provider identifica cobrancas individuais; installment identifica o grupo,
enquanto id identifica uma cobranca. A criacao parcelada retorna a primeira cobranca e
o ajuste de centavos do total fica na ultima parcela.
Fonte primaria consultada: https://docs.asaas.com/docs/criar-uma-cobranca-parcelada
e https://docs.asaas.com/reference/listar-cobran%C3%A7as-de-um-parcelamento.

O novo caminho autorizado pela root e somente leitura: carregar todas as cobrancas dos
customers autorizados, com paginacao completa e validacao de grupo/customer; produzir DTO
com valor individual, grupo, status e datas. Usar ID da primeira cobranca/grupo para
reconciliar representacao do pai local, sem somar pai total e filhas. Nao alterar pagamentos
nem acionar lifecycle. Falha do provider nao permite fallback aos totais ambiguos locais.

O XLSX nao fornece diretamente o ID pay_ conforme apuracao da root; identificador numerico
nao e chave de reconciliacao comprovada. Nao foi aplicado join por preco/nome/email/datas.

## Gates do novo patch

- Tenant: acao autenticada no guard admin; empresa resolvida obrigatoriamente; queries locais
  filtradas; customer/grupo provenientes do escopo autorizado, sem aceitar IDs arbitrarios.
- Completude: erros de pagina/customer/grupo, pagina repetida ou inconsistente nao produzem
  sucesso parcial. Paginacao de students locais tambem precisa cobrir todo o escopo.
- Semantica: uma entrada por cobranca, dedupe por identidade do provider; total local nao
  entra no agregado. dueDate e vencimento/projecao, nao prova de repasse disponivel.
- UI: falha/completude desconhecida deve mostrar indisponibilidade, nunca total legado ou
  zero apresentado como resultado completo. KPI/grafico/detalhes devem usar a mesma fonte.
- Testes: pai 1380 + seis parcelas 230; 12 parcelas com arredondamento real; tenant forjado;
  pagina 2 falha; grupos/customer inconsistentes; status e datas; UI sucesso/falha sem fallback.

## Historico de validacoes intermediarias (superado pelo fechamento acima)

### Testes independentes do componente real

Arquivo: src/pages/admin/FinancialDashboard.test.tsx, com React Testing Library.
Mocks limitados a I/O Supabase, auth/contexto, navegacao, chart e tabs; dashboard real e
controles fiscais reais renderizados. Dados exclusivamente sinteticos; nenhuma emissao real.
O teste fiscal clica na segunda parcela local e verifica create-invoice com paymentId=pay_2;
nao reutiliza pay_1 do pai. Parcelas sem linha local ficam desabilitadas com motivo.

Rodada intermediaria: 6/8 RTL PASS + 7/7 helper UI PASS (13/15 no comando conjunto).
PASS: seis parcelas de 230 sem total legado na tabela; falha provider sem fallback;
unresolved excluido; fiscal exato/desabilitado; CONFIRMED futuro preservado no grafico/detalhe
sem contaminar caixa recebido; troca sequencial de empresa master.
FAIL a corrigir: data civil 09/09 exibida 08/09 e primeira parcela como A vista;
resposta atrasada da empresa A sobrescreve a empresa B selecionada (race reproduzida).
Lint do arquivo de testes passou. Rodada final pendente de correcoes do executor.

CSV: nao existe exportador CSV em FinancialDashboard no HEAD-base nem no WIP examinado.
Logo nao ha evidencia de exportacao para afirmar PASS; nao foi criado recurso novo pela QA.
Harness visual qa-financial e IAB pertencem a root, sem auth/Asaas real; nao tocados aqui.

### Testes do adapter com funcoes reais e I/O simulado

As funcoes do adapter foram compiladas em memoria com esbuild, preservando corpo real e
injetando somente Supabase/GET sinteticos. Escritas/RPCs no mock lancam erro; nenhuma ocorreu.
PASS: pai total e grupo completo => seis entries / 1380; short page hasMore=true,
customer estrangeiro e falha na pagina 2 => zero entries / unresolved.
Ainda FAIL nessa rodada: grupo com hasMore ausente => uma entry / 230 / unresolved=0;
count local null => snapshot aceito; grupo sem primeira pay_ consultada => cinco entries /
1150 / unresolved=0. Casos enviados ao executor para fail-closed.

### Revisao do primeiro adapter em disco

NO-GO intermediario, comunicado ao executor. Gates concretos ainda presentes nessa revisao:

- Paginacao: fetchAsaasPaymentsByCustomer/fetchAsaasInstallmentPayments encerram quando
  hasMore=true mas data.length<100; payload sem data vira array vazio. Nao prova completude.
  Query local limitada a 250 sem deteccao de truncamento tambem pode omitir linhas.
- Owner: normalizeAsaasFinancialPayment descarta customer. GET individual nao compara id/customer
  retornados com o pedido/vinculo local; grupo nao valida customer/installment de cada membro.
- Deduplicacao/completude de grupo: array duplicado emite a mesma cobranca duas vezes; array
  vazio e aceito sem unresolved. Fixtures independentes provaram os resultados abaixo.
- Semantica de data: projectionCreditDate substitui creditDate real por estimativa ou data de
  confirmacao/pagamento, fazendo estimativa virar data de caixa para status RECEIVED.

Resultados do deno eval independente (sem arquivo de codigo novo e sem rede):

| Fixture | Resultado observado incorreto |
| --- | --- |
| Grupo com pay_1 duplicado, cada valor 230 | 2 entries, total 460, unresolved 0 |
| Grupo vazio | 0 entries, unresolved 0 |
| Membro com outro customer e outro installment | 1 entry, total 230, unresolved 0 |
| RECEIVED apenas com estimatedCreditDate | Campo creditDate recebe data estimada |

Os 3 testes Deno do executor passaram, mas nao cobriam estes contraexemplos.
Root informou baseline PROD 143 payments / 125 provider IDs / 2 lifecycle, hash
4398b37b9f99676f56a6c29372e296a6; nao foi reconsultado por esta QA.
Root tambem informou v74 ACTIVE/verify_jwt=false, index remoto igual ao HEAD-base,
drift apenas em funcao nao importada de sales-funnel. Sao evidencias da root, nao nova
autorizacao de deploy nem substituto dos gates funcionais acima.

- npm test -- src/lib/paymentInstallments.test.ts src/lib/paymentCheckoutContract.test.ts:
  20 testes passaram em 2 arquivos. Cobrem regras do checkout; nao provam a nova projecao.
- Achados e blockers enviados diretamente ao executor; patch do adapter ainda aguardando
  estabilizacao para teste independente.
