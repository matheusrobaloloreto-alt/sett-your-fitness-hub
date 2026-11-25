# Foreign payer checkout (local implementation, staging authorization only)

Verified official documentation 2026-11-25:
- https://docs.asaas.com/reference/create-new-customer (foreignCustomer=true, account capability required)
- https://docs.asaas.com/docs/payments-via-credit-card (POST /payments without card data, redirect invoiceUrl)
- https://central.ajuda.asaas.com/hc/pt-br/articles/31972902909851-Como-receber-pagamentos-internacionais (no installments, Pix/boleto or paymentLinks)
- https://central.ajuda.asaas.com/hc/pt-br/articles/31974412639131-Quais-moedas-s%C3%A3o-aceitas-no-recebimento-de-cobran%C3%A7as (BRL)

Required SERVER environment: ASAAS_FOREIGN_CUSTOMERS_ENABLED=true and
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3. Unset/false capability or unknown environment
returns 503 FOREIGN_PAYERS_NOT_ENABLED. The helper supports either allowlisted sandbox or production URL with the explicit
capability enabled; this task does not authorize production configuration or deployment.
Enabling this environment variable does not enable the account capability at Asaas. No production rollout authorized.

Authenticated checkout request:

    { "action": "create-foreign-card-payment", "checkoutToken": "<UUID>",
      "planId": "<plan UUID>", "billingType": "CREDIT_CARD", "installmentCount": 1,
      "currency": "BRL" }

billingType/installmentCount/currency may be omitted; the route fixes card/one/BRL.
`installments: 1` is also accepted; any supplied count must be numeric 1.
`checkoutMode: "hosted"` is optional and informational: this action always uses hosted.
Never send creditCard, creditCardHolderInfo or creditCardToken; these are rejected.
Never trust a supplied amount. The server derives student/company from the token and
price from the tenant-scoped active standard plan. An authenticated admin may supply
studentId/companyId instead of checkoutToken, using the existing tenant checks.

Response: { paymentId, status, invoiceUrl, reused?: true, reconciled?: true }.
Redirect only to the returned HTTPS Asaas invoiceUrl. Poll through the existing
{ action: "get-payment-status", checkoutToken, paymentId } contract. PENDING is not
paid; activation/renewal uses the existing immutable order snapshot and lifecycle.

Persisted fields required: billing_country_code (non-BR), billing_name, billing_email.
Name/email may fall back to full_name/email only when contact country equals billing
country. Foreign documents, postal codes, addresses and phones stay local and are
never digit-stripped or sent as CPF/CEP/domestic phone. Additional fiscal fields
owned by the profile-registration implementation are independent of this API.
NFS-e remains domestic-only in this handler; webhook invoice policy is a separate owner.

Errors: { error, code? }. Capability errors: 503 FOREIGN_PAYERS_NOT_ENABLED.
Validation: 422 FOREIGN_PAYER_REQUIRED, FOREIGN_PAYMENT_METHOD_UNSUPPORTED,
FOREIGN_CARD_HOSTED_ONLY, FOREIGN_PAYER_INCOMPLETE. Identity/order conflicts: 409.

Orders reserve their unique checkout key BEFORE customer creation. Customers use
externalReference sett-foreign:<company>:<student>, looked up before any POST. The
provider customer identity must match and cannot be silently converted from BR.
An existing invoice is verified against its provider customer before replay, preventing
country changes from reusing the wrong payer's invoice. New customer IDs are linked
to the reserved payment before the payment POST, preserving webhook matching.

Inconclusive payment POST: retry looks up sett-payment:<local-order-id>, reconciles
without another payment POST. Inconclusive CUSTOMER POST or failed student link:
the order stays RECONCILIATION_PENDING; retries return 409 until manual reconciliation.
Do not clear its key or automatically retry writes. The existing student_funnel_events unique (student_id,event_key) provides a durable
customer-creation claim across different checkout tokens/plans and Edge instances.
A lost claim returns409 before POST; inconclusive claims remain processing for manual
reconciliation. Duplicate scoped-reference matches fail closed.

Tests use the actual Edge handler with mocked HTTP; no real account, support contact,
charge or deployment. Sandbox external refusal canary is unverified: the root reported
that the documented refusal card unexpectedly confirmed. Fixture refusal tests do not
prove provider refusal behavior. Root's external customer/invoice/card probes are
separate evidence, not end-to-end app/webhook validation.
