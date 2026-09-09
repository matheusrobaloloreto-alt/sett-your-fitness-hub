# Conferencia das 22 vigencias com Asaas - 09/09/2026

## Resultado

- Export obtido pela interface autenticada de producao: 826 cobrancas, sem filtro de cliente/data.
- SHA-256 do XLSX: `6a8504811aa2b79efb9aa161ba62f7bc071cbb55a5922d7fc38dbfdf669aac4d`.
- 22 matriculas procuradas. 19 com correspondencia fiscal forte; duas apenas candidatas sem CPF coincidente; uma sem correspondencia.
- Os sete cadastros sem asaas_customer_id no SETT nao significam sete clientes ausentes do Asaas: quatro foram encontrados por CPF, dois por nome/email, um permaneceu sem correspondencia.
- Nove payment_date do SETT coincidem exatamente com repasse posterior de parcela da ultima compra, nao com sua confirmacao inicial.
- Os 22 alertas eram cauda de ciclos, nao prova de 22 contratos duplicados. Ha termos coerentes, somas legadas, divergencia de plano e identidades pendentes.
- Sem alteracao de vigencias, cobrancas, pagamentos, assinaturas, acessos ou mensagens nesta conferencia.

## Metodo e limites

Skill 121, Debugger Sistematico (Causa Raiz), e skill Spreadsheets aplicadas.
Consulta de escopo: scripts/audit-bn-cycle-renewals.sql. Leitura do export: scripts/audit-asaas-export.py.
Dados privados e hashes de identidade ficaram fora do Git. O XLSX apresenta dimensao A1 incorreta; reset_dimensions recuperou 827 linhas incluindo cabecalho, conferindo as 826 cobrancas exibidas na UI.

Agrupamento analitico por cliente, data de criacao, forma/tipo e descricao sem ordinal. Validacao de parcelas 1..N completas, sem ordinais duplicados. O export nao fornece ID de grupo nem contrato assinado: agrupamento nao pode autorizar escrita financeira. Data de confirmacao de compra, vencimento e repasse sao campos distintos. Prazo do plano SETT nao deve ser deduzido do numero de parcelas.

Semantica conferida na documentacao oficial: PAYMENT_CONFIRMED indica pagamento efetuado sem saldo ainda disponivel; PAYMENT_RECEIVED indica valor disponibilizado na conta Asaas. Fonte: https://docs.asaas.com/docs/webhook-para-cobrancas (consulta em 09/09/2026).

| Referencia | Evidencia Asaas | Confirmacao da compra mais recente | Fim atual SETT | Conclusao |
| --- | --- | --- | --- | --- |
| `b7004e616eca` | CPF coincidente | 2026-03-16 | 2027-02-15 | Repasse de parcela em 24/08 confundido com data comercial; compra confirmada em 16/03. Vigencia ampliada sem nova compra localizada. |
| `df14c3d504f6` | CPF coincidente | 2026-03-06 | 2028-01-08 | Repasse em agosto de compra confirmada em marco; termo atual tem 673 dias para plano de 336. |
| `f79808183ac6` | CPF coincidente | 2026-08-04 | 2027-02-08 | Nova compra confirmada em 04/08; vigencia atual ainda usa inicio antigo. Propor substituicao com preservacao do treino. |
| `2d93f08d4f16` | CPF coincidente | 2026-03-08 | 2028-01-10 | Repasse em agosto de compra confirmada em marco; termo atual tem 673 dias para plano de 336. |
| `078e2d2b9409` | CPF coincidente | 2026-01-12 | 2026-12-14 | Compra anual localizada apesar de falta de vinculo no SETT. Termo atual equivale a plano de 336 dias mais fronteira legada de 1 dia, nao duas anuidades. |
| `711a247b40da` | CPF coincidente | 2026-05-25 | 2027-10-11 | Plano SETT semestral, compra parcelada em 12 com valor compativel com anual; parcelamento sozinho nao comprova prazo contratado. Reconciliar plano correto. |
| `2370076329b4` | CPF coincidente | 2026-09-02 | 2027-08-17 | Uma compra de 1440 confirmada em 02/09 em seis parcelas. Fim financeiro 17/08/2027 diverge de ciclos ate 17/02/2027; reparo de vigencia ainda nao aplicado. |
| `2dbfaac06276` | Candidato sem CPF coincidente | 2026-02-11 | 2026-08-29 | Apenas email em comum com pagadora de outro nome; sem CPF coincidente. Nao atribuir contrato automaticamente. |
| `711ab66e14f5` | CPF coincidente | 2026-05-21 | 2027-05-05 | Repasse em agosto de compra confirmada em maio. Conferir data inicial operacional antes de encurtar vigencia. |
| `0f13e58e755f` | CPF coincidente | 2026-06-15 | 2027-05-16 | Repasse em agosto de compra confirmada em junho; termo atual equivale exatamente a dois planos de 168 dias. |
| `8dc8a2580782` | CPF coincidente | 2026-07-14 | 2027-01-12 | Pix confirmado em 14/07; data 29/07 no app nao corresponde ao pagamento. Conferir eventual diferimento antes de alterar datas. |
| `f7047b8d00d2` | Nao localizado | - | 2027-01-31 | Sem correspondencia por nome, CPF fiscal ou email no export. Nao prova falta de pagamento: verificar origem manual/fora do Asaas. |
| `5d281f90c927` | CPF coincidente | 2026-04-21 | 2027-03-22 | Repasse em agosto de compra confirmada em abril; termo atual equivale exatamente a dois planos de 168 dias. |
| `5ae9920ce3fa` | CPF coincidente | 2026-03-30 | 2027-03-01 | Uma compra semestral em marco localizada, sem nova compra posterior; termo de 337 dias sinaliza soma antiga. |
| `241dfb3b3c96` | CPF coincidente | 2026-03-20 | 2027-02-19 | Repasse em agosto de compra confirmada em marco; termo de 337 dias sinaliza soma antiga. |
| `d389bc608edc` | CPF coincidente | 2026-07-29 | 2027-08-14 | Conta identificada como teste, compra de 5. Nao tratar como contrato comercial comum. |
| `868b64104865` | Candidato sem CPF coincidente | 2026-03-30 | 2026-10-15 | Nome/email coincidem, mas CPF diverge e identificador externo nao resolve aluno atual. Nao vincular nem mudar vigencia automaticamente. |
| `c6c818177b56` | CPF coincidente | 2025-12-09 | 2026-11-10 | Compra anual localizada sob outro nome, CPF e email coincidem. Termo atual equivale a 336 dias mais fronteira legada de 1 dia. |
| `14b9857eb992` | CPF coincidente | 2025-07-11 | 2026-06-12 | Compra anual de 2025 localizada; termo atual equivale a 336 dias mais fronteira legada de 1 dia. Sem renovacao mais recente no export. |
| `5f9de190f3c7` | CPF coincidente | 2026-09-01 | 2027-07-23 | Compra nova confirmada em 01/09, seis parcelas. Termo financeiro atual ainda acumulado; conflito de treino auditado separadamente. |
| `572a44e1703c` | CPF coincidente | 2026-04-04 | 2027-03-21 | Repasse em agosto de compra confirmada em abril; validar diferimento inicial antes de corrigir termino. |
| `40d31da36bcf` | CPF coincidente | 2026-01-13 | 2026-12-28 | Compra antiga de janeiro localizada; plano no SETT inicia em julho. Export nao comprova a eventual renovacao manual de julho. |

## Gate para reparo financeiro

Preparar manifesto separado por matricula com compra confirmada, prazo do plano contratado, eventual diferimento/trancamento documentado e treino que deve permanecer. Exigir backup, dry-run, revisao independente e diff exato de datas. Nao reexecutar lifecycle antigo nem disparar sync/get-payment-status como suposta leitura: esses caminhos podem escrever e aplicar lifecycle.

## Achado adicional

QA independente confirmou que 103 pagamentos importados confirmados sem plan_id nao aplicaram lifecycle. O bloqueio de plano ausente protege a renovacao atual. Entretanto, o dashboard divide value por installment_count mesmo quando a linha importada ja representa uma parcela: risco separado de projecao financeira, ainda nao corrigido. Registrar na fila, sem interpretar como cobranca duplicada no Asaas.
