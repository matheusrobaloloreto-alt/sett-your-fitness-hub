# Asaas staging/sandbox — runbook fail-closed

## Objetivo

Validar checkout, idempotência e lifecycle de pagamento sem chamar a API de produção nem movimentar dinheiro real.
Este runbook não autoriza deploy, cobrança ou alteração de secrets; ele define os gates para uma execução coordenada.

## Isolamento implementado no `asaas-integration`

A Edge Function exige `ASAAS_BASE_URL` e aceita somente um dos valores exatos abaixo:

| Ambiente | Valor permitido |
|---|---|
| produção | `https://api.asaas.com/v3` |
| sandbox | `https://api-sandbox.asaas.com/v3` |

Ausência, barra final, HTTP, subdomínio semelhante, query string ou qualquer outro host retornam `503` antes da chamada ao provedor.
O endpoint `check-connection` retorna apenas `production` ou `sandbox`; nenhum valor de chave é registrado ou devolvido.

## Estado de paridade em staging

- Projeto de staging: `ifymocggowdlqqcxugko` (`sett-bn-staging-20260815`).
- Frontend de staging: `https://wondrous-sunflower-10fc8f.netlify.app`.
- Em 01/09/2026, as migrations `harden_payment_checkout_orders` e `atomic_payment_lifecycle` foram aplicadas e verificadas no banco de staging. No ledger remoto elas receberam, respectivamente, as versões `20260901185404` e `20260901185409`; colunas de idempotência/lifecycle, índice único e RPC atômica estão presentes.
- `public-payment-context`, `asaas-integration` e `asaas-webhook` foram implantadas em staging a partir do mesmo HEAD aprovado (`34f586b9d0ae6d4b6bd32033f7a17730d8cc3a8c`).
- `ASAAS_BASE_URL` foi fixada na base oficial de Sandbox e `PUBLIC_APP_URL` na URL do frontend de staging.
- O canário continua bloqueado até existirem `ASAAS_API_KEY` de uma conta Sandbox separada e `ASAAS_WEBHOOK_TOKEN` exclusivo de staging, com o webhook correspondente cadastrado no Asaas Sandbox.

## Secrets por nome

Configurar no projeto correto, sem copiar valores entre ambientes:

- staging: `ASAAS_BASE_URL` com a base oficial de Sandbox, `ASAAS_API_KEY` de uma conta Sandbox separada e `ASAAS_WEBHOOK_TOKEN` exclusivo de staging;
- produção: `ASAAS_BASE_URL` com a base oficial de produção, mantendo a chave e o token exclusivos de produção;
- `PUBLIC_APP_URL` deve apontar para a URL do frontend correspondente ao ambiente.

Nunca reutilizar a chave de produção no staging. A conta e os dados do Sandbox são independentes dos de produção.

## Gates antes do deploy de staging

1. Confirmar que as migrations de checkout e lifecycle atômico estão aplicadas em staging, incluindo:
   - `20260831193000_harden_payment_checkout_orders.sql`;
   - `20260901123000_atomic_payment_lifecycle.sql`.
2. Confirmar que `asaas-integration` e `asaas-webhook` vêm do mesmo HEAD aprovado.
3. Confirmar apenas a presença dos nomes dos secrets, nunca seus valores:

   ```bash
   supabase secrets list --project-ref ifymocggowdlqqcxugko --output json \
     | jq -r '.[].name' \
     | sort \
     | rg '^(ASAAS_BASE_URL|ASAAS_API_KEY|ASAAS_WEBHOOK_TOKEN|PUBLIC_APP_URL)$'
   ```

4. Rodar os gates locais:

   ```bash
   npx -y deno test --no-config supabase/functions/_shared/asaas-environment.test.ts
   npx -y deno check --no-config supabase/functions/asaas-integration/index.ts
   npx -y deno check --no-config supabase/functions/asaas-webhook/index.ts
   npx vitest run src/lib/paymentCheckoutContract.test.ts src/lib/paymentInstallments.test.ts
   npx tsc --noEmit
   ```

## Canário Sandbox após paridade

1. Invocar `check-connection` em staging com uma sessão administrativa de staging. Aceitar somente `connected: true` e `environment: "sandbox"`.
2. Criar no staging apenas fixture fictícia de empresa, aluno, plano e checkout; não copiar PII de produção.
3. Usar os cartões oficiais de teste do Asaas para um caso aprovado e um recusado. Sandbox não movimenta dinheiro real.
4. Confirmar que o webhook de Sandbox chega somente ao projeto staging e que repetição do mesmo evento não duplica matrícula, ciclo, invoice ou mensagem.
5. Confirmar que o lifecycle usa o snapshot imutável do plano e a RPC atômica já publicada.
6. Remover fixtures somente conforme política aprovada de staging; não executar limpeza em produção.

## Sem juros para o pagador

- Para 1x, o backend envia somente `value` com o preço autoritativo do plano.
- Para 2x ou mais, o backend envia `installmentCount` e `totalValue` com o mesmo preço total; não envia `installmentValue` majorado nem campo de juros.
- Portanto, o total pago pelo aluno permanece igual ao preço do plano. A diferença de arredondamento, quando houver, fica na última parcela conforme a regra do Asaas.
- A tarifa de processamento do cartão é custo da empresa e reduz o valor líquido recebido; ela não deve ser anunciada como "taxa zero". O texto permitido no checkout é especificamente `Sem juros para você`.
- Se futuramente houver repasse de tarifa, preço diferente por número de parcelas ou qualquer acréscimo no payload, remover essa mensagem e exigir novo teste contratual e de Sandbox.

## Gate de produção e rollback

- Antes de qualquer nova versão de `asaas-integration` em produção, cadastrar `ASAAS_BASE_URL` com o valor oficial de produção. Sem isso, a nova versão falha fechado com `503` e não chama o Asaas.
- Validar `check-connection` autenticado e exigir `environment: "production"` antes de liberar checkout.
- Se o gate falhar, restaurar a versão anterior da Edge Function; não trocar a base para Sandbox em produção como contorno.
- Não executar cobrança real, estorno ou teste de valor mínimo como smoke de deploy.
