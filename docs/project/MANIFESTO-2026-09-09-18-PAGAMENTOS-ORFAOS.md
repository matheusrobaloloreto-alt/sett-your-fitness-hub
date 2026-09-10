# Manifesto: 18 pagamentos locais orfaos - 09/09/2026

## Evidencia

Export autenticado `Cobrancas.xlsx`: 826 cobrancas, SHA-256
`6a8504811aa2b79efb9aa161ba62f7bc071cbb55a5922d7fc38dbfdf669aac4d`.

- Isadora Barros Braz: o Asaas registra uma compra de cartao criada em
  02/09/2026, seis parcelas confirmadas de R$ 240, total R$ 1.440. O SETT ja
  possui a linha canonica com ID Asaas e lifecycle aplicado. As 17 linhas sem
  ID sao tentativas locais `OVERDUE`, sem invoice e sem lifecycle.
- Ludmila Queiroz: o Asaas registra uma compra de cartao criada em 21/04/2026,
  seis parcelas de R$ 230, total R$ 1.380. As seis parcelas com IDs Asaas ja
  existem no SETT. A linha total sem ID e um placeholder local redundante.
- Identidade forte nos dois casos: nome, CPF, CPF do pagador e e-mail
  coincidem em todas as parcelas do grupo correspondente.

## Acao

Remover somente os 18 placeholders da tabela operacional `payments`. Preservar
as sete linhas canonicas com ID Asaas, todos os 19 eventos de recuperacao e o
historico integral em `payment_orphan_reconciliation_audit`, tabela privada com
RLS. A exclusao deixa os eventos com `payment_id=null` conforme a FK existente
`ON DELETE SET NULL`; a auditoria privada conserva o vinculo original.

## Gates

- Before-hash exato dos 18 pagamentos, 19 eventos e sete canonicos.
- Contagens, tenant, aluno, valor, parcelas, matricula, estado, payload fiscal,
  checkout, invoice e lifecycle exatos.
- Alunos e matriculas preservados por contagem e hash integral.
- Zero cobranca, webhook, lifecycle, vigencia, matricula ou plano criado.
- Pos-condicao: 125 pagamentos BN, 106 cartoes com ID Asaas e zero cartao sem ID.
- Rollback restaura os 18 pagamentos e seus 19 vinculos de eventos somente se
  after-images e canonicos continuarem intactos.

## Estado

Aplicado em producao no projeto `zshrcgbyhzxpnlccssyz` apos dois dry-runs,
ensaio composto apply/rollback e GO independente. Pos-audit read-only:

- `18/18` placeholders ausentes e `18/18` linhas de auditoria aplicadas;
- `19/19` eventos preservados, com `payment_id=null` conforme a FK;
- sete pagamentos canonicos intactos por hash;
- 125 pagamentos BN, sendo 106 cartoes e `106/106` com ID Asaas;
- zero cartao sem ID Asaas;
- RLS ativa e nenhum `select/insert/update/delete` para `anon` ou
  `authenticated`;
- rollback exato ensaiado sobre os after-images reais: restaurou 18 pagamentos
  e 19 vinculos dentro da simulacao; o rollback externo manteve o reparo
  definitivo aplicado.
