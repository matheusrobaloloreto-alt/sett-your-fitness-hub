# Correção 2026-09-09 — Financeiro SETT/BN: Parcelas Asaas

## Veredito

O erro era real e tinha dois efeitos: dupla divisão de parcelas já importadas e soma simultânea de total legado + parcelas filhas. A correção segura não usa heurística de preço, plano, chave de checkout, status ou formato do identificador; ela troca o cartão por uma fonte autoritativa read-only do Asaas e falha fechada quando essa fonte não está completa.

## Evidência confirmada

- O dashboard dividia qualquer `CREDIT_CARD` por `installment_count`, mesmo quando `value` já era valor de parcela.
- O sync local salva linhas individuais com `ap.value`; exemplos live confirmaram `230/count=6` e `208.33/count=12` como parcelas individuais.
- Também existem linhas antigas sem marcadores confiáveis contendo o total, como `1380/count=6` e `2500/count=12`.
- O caso live do mesmo aluno tinha `1380/count=6` mais cinco linhas `230/count=6`; somar o local bruto inflava a base.
- O XLSX não trazia `pay_...` nem `installment` autoritativo para dedupe histórico.

## Implementação aplicada

- Novo adapter read-only em `financial-installment-snapshot` dentro de `supabase/functions/asaas-integration/index.ts`.
- O endpoint é protegido pelos guards existentes de auth/tenant/admin e consulta pagamentos de cartão da empresa no servidor.
- A função não grava banco, não altera lifecycle, não sincroniza Asaas e não emite cobrança ou NFS-e.
- Todos os cartões locais são considerados, inclusive sem `asaas_payment_id`; estes viram pendência explícita `missing_asaas_payment_id`.
- Para linhas com provider ID, o adapter busca cobranças Asaas por customer, valida customer/tenant, resolve grupo `installment`, pagina parcelas e valida:
  - grupo presente;
  - IDs sem duplicidade;
  - ordinais `1..N` completos;
  - contagem local coerente;
  - todos os provider IDs locais afetados presentes no grupo;
  - customer do grupo igual ao customer local esperado.
- O caminho read-only tem timeout por request e deadline total; timeout/falha do provider vira indisponível, não número inventado.

## Semântica de indicadores

- Faturamento usa `dateCreated`/`confirmedDate` do provider, preservando mês da compra.
- Caixa recebido usa apenas data real de recebimento/crédito; `CONFIRMED` não é dinheiro disponível.
- Previsão futura usa `estimatedCreditDate` ou `dueDate`, rotulada como previsão e fora do KPI de recebido.
- Ticket médio conta compras únicas por `installmentGroupId || asaasPaymentId`; parcelas do mesmo grupo não multiplicam o denominador.
- Pendentes e atrasados agora usam entries reconciliadas de cartão + pagamentos não cartão; não usam mais o bruto legado de cartão.
- Se a conciliação de cartão fica indisponível, KPIs dependentes de cartão mostram `—` e parciais não cartão quando existirem; a UI não apresenta `R$0,00` como ausência real de dados.

## UI e operação

- A tabela exibe parcelas como `Parcela N`, sem transformar ordinal em `2x/3x`.
- Datas `YYYY-MM-DD` são tratadas como data civil local para evitar drift de `01/09` para `31/08`.
- Parcelas existentes no Asaas sem linha local exata ficam visíveis, mas com ação fiscal bloqueada.
- Cartões sem provider ID ou com provider indisponível aparecem como pendentes de conciliação e não entram nos indicadores.
- PIX, boleto e outros não cartão continuam preservados como parciais identificados.

## Validação local

- `npx -y deno test --allow-read supabase/functions/_shared/asaas-financial-projection.test.ts`: 10/10 passou.
- `npx -y deno check supabase/functions/asaas-integration/index.ts`: passou.
- `npm run test -- src/lib/financialProjection.test.ts`: 7/7 passou.

## Publicacao e verificacao final

- Commit `c138200`, enviado a `origin/codex/sett-release-rc-20260826`.
- Backend `asaas-integration` v75 ACTIVE em `zshrcgbyhzxpnlccssyz`; guard customizado preservado; POST sem autenticacao retorna 401.
- Netlify de producao `6aa1d3a7b9c96039394ee73d`, site `9a061d2e-ee2c-444b-aa69-fe262caf0246`.
- Chunk `FinancialDashboard-y2NczZ2q.js`, HTTP200, SHA256 local e remoto identicos: `2d6d4d913724199a5f500d1e6d22e64e2410a70fe9495a690e54a6d94215e947`.
- Canary autenticado pela interface: POST200, 124 cartoes locais, 106 provider IDs consultados, 17 grupos, 126 entries e 126 IDs unicos. Nove grupos de seis parcelas de 230 somam 1380 cada, com ordinais 1..6. Os 18 unresolved sao exclusivamente `missing_asaas_payment_id`.
- UI real: caixa recebido Set/26 de 460 separado da previsao; aba Out/26 com previsao de 2516,66. Aviso dos 18 registros nao conciliados visivel. Nenhum Sync ou emissao fiscal clicado.
- SQL antes/depois: 143 pagamentos, 125 provider IDs gerais e 2 lifecycle aplicados. Hash integral preservado: `4398b37b9f99676f56a6c29372e296a6`. Nenhuma mudanca financeira ou de vigencia.
- QA independente GO: 17 testes UI/helper, 10 Deno e 9 cenarios do adapter. Root repetiu 37 testes financeiros/checkout com sucesso. Build e lint focado passaram (um warning de hook herdado).
- TypeScript nao passa globalmente: baseline HEAD comprovado por CompilerHost sobreposto, com 36 erros em oito arquivos nao editados. Repeticao final nao acrescentou erros financeiros. Suite geral intermediaria: 917/918; unica falha de desempenho fora do escopo passou isoladamente (305 ms), sem alterar limite.
- QA visual local em 390px e 1440px: compra1380/ticket1380/caixa230 e futuro230; falha mostra indisponibilidade nos cinco indicadores e detalhe, sem falso zero. Fixtures temporarias removidas, servidores encerrados. CSV nao existe nesta tela e nao foi criado.
- Rollback: frontend anterior `6aa18fd8f0efb92020bd0577`; fonte remota exata da Edge v74 preservada em `/tmp/sett-asaas-v74-20260909/functions/`.

## Pendencia de dados

Os 18 registros sem identificador Asaas permanecem aguardando conciliacao individual. A correcao do painel nao cria chaves por nome, valor ou data, nem declara a carteira integralmente conciliada. Asaas nao foi alterado; o defeito comprovado era de representacao no SETT, nao prova de cobranca duplicada no provedor.
