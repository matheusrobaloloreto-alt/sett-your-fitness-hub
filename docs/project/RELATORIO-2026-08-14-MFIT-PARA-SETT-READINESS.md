# MFIT → SETT/BN — relatório sanitizado de prontidão

**Data:** 2026-08-14
**Modo:** Chrome autenticado em leitura + dry-run local contra o banco canônico. Nenhum `--apply`, INSERT/UPDATE/DELETE remoto, migration, deploy ou push foi executado.

## Decisão executiva

**NO-GO para aplicar.** A extração das fichas ativas e o dry-run real foram concluídos e são reproduzíveis, porém somente **131 de 313 nomes distintos de exercícios (41,85%)** encontraram correspondência exata e inequívoca no catálogo SETT. O catálogo tem 926 exercícios, mas 180 nomes MFIT ainda precisam de aliases auditados e 2 nomes têm correspondência ambígua. O migrador falhou fechado, como projetado: **46 planos bloqueados, zero operações candidatas e zero escrita**.

Não é seguro trocar a regra por fuzzy match: sem um mapa revisado, exercícios semanticamente diferentes podem ser associados silenciosamente.

## Escopo SETT/BN confirmado

| Métrica | Total |
|---|---:|
| Alunos na empresa | 69 |
| Alunos com status ativo | 53 |
| Matrículas operacionais ativas | 61 |
| Alunos elegíveis (aluno + matrícula ativos) | **48** |
| Ativos sem matrícula operacional | 5 |
| Matrículas ativas cujo aluno não está ativo | 9 |
| Exercícios visíveis (globais + BN) | 926 |

O contrato de elegibilidade usado foi `students.status IN ('active', 'awaiting_renewal')` e `enrollments.status IN ('active', 'awaiting_training', 'awaiting_renewal')`, sempre limitado à BN Performance Training. Nenhuma PII foi persistida no repositório ou neste relatório.

## Matching de alunos

Dos 48 elegíveis:

- **37 matches determinísticos**: 14 por telefone+e-mail, 21 por telefone e 2 por e-mail;
- 4 casos ambíguos, bloqueados;
- 7 sem correspondência;
- zero fuzzy match.

Os arquivos-fonte permaneceram fora do Git, com permissão local restrita. Hashes de integridade:

- clientes MFIT: `07933bfd5a61c8ecc6c32d15ce5704bcf30af9ecccb164e281083bb4606b5c2b`;
- matching consolidado: `18a09eaae22d3d1786fb58bbc180ee126ffa722233de04681646bc1d588941b9`;
- fichas ativas consolidadas: `6376f8576828a77a5848d58301cb7f6b2a34bfe95d87aec3b13538d94ec4b5f7`.

## Extração das fichas ativas

A navegação usou exclusivamente o Chrome já autenticado e ações read-only. A inspeção final recuperou sessões que inicialmente pareciam vazias porque a interface exigia `Expandir todos` antes de expor os exercícios.

| Métrica | Total |
|---|---:|
| Clientes com alguma ficha encontrada | 24 |
| Clientes com plano utilizável | 21 |
| Planos brutos | 47 |
| Planos ativos normalizados | 46 |
| Sessões | 164 |
| Ocorrências de exercícios | 1.269 |
| Sessões comprovadamente vazias após retry | 2 |
| Erros técnicos | 0 |
| IDs de cliente duplicados | 0 |

Somente prescrições ativas foram coletadas. Histórico concluído não foi incluído.

## Dry-run real e determinismo

O migrador foi executado duas vezes, sem `--apply`, com data de referência fixa `2026-08-14` e as mesmas fontes:

| Resultado | Dry-run 1 | Dry-run 2 |
|---|---:|---:|
| Alunos SETT elegíveis | 48 | 48 |
| Clientes MFIT no matching | 37 | 37 |
| Planos ativos | 46 | 46 |
| Nomes distintos necessários | 313 | 313 |
| Matches exatos no catálogo | 131 | 131 |
| Nomes ausentes | 180 | 180 |
| Nomes ambíguos | 2 | 2 |
| Cobertura | 41,85% | 41,85% |
| Planos bloqueados | 46 | 46 |
| Operações candidatas | 0 | 0 |

Removido apenas o timestamp `generated_at`, os dois relatórios geraram o mesmo SHA-256: `b669fe21d52c97b71eaacb58bcef7a068078edc11c63997422f94e3bed2da268`.

## Garantias já implementadas no migrador

1. Tenant e atividade validados de forma fail-closed.
2. Matching determinístico por telefone/e-mail/nome exato único; contradições e ambiguidades bloqueiam.
3. Somente fichas explicitamente ativas; status ausente/desconhecido ou histórico concluído não entra.
4. Preserva sessões, ordem, séries, repetições, carga, descanso, cadência, observações, métodos, grupos/bi-sets, alternativas e mídia.
5. Exige 100% de cobertura determinística do catálogo para o lote; não cria exercícios.
6. Append-only com IDs determinísticos; não sobrescreve treino SETT materializado.
7. Idempotência e divergência parcial cobertas por testes.
8. Relatórios sanitizados, sem PII.
9. Imediatamente antes de qualquer escrita, o migrador relê aluno e matrícula no banco vivo e bloqueia mudança de status, empresa ou ownership.

## Validações

- `node --test scripts/mfit-active-workouts-migration.test.mjs`: **26/26 aprovados**.
- Dois dry-runs reais idênticos no conteúdo operacional.
- Extração reaberta e verificada após o falso bloqueio de sessões recolhidas pela interface.
- Nenhuma mutação remota foi solicitada pelo migrador.

## Riscos e próxima ação

Risco principal: os nomes usados no MFIT diferem do catálogo SETT apesar de os movimentos provavelmente existirem. O próximo passo é produzir um **mapa explícito de alias MFIT → exercício SETT**, com revisão humana/técnica para os 180 ausentes e decisão manual para os 2 ambíguos. O mapa deve ser testado, versionado e manter bloqueio para qualquer item não resolvido.

Somente depois de obter 100% de cobertura e repetir o dry-run devem ser avaliados backup e aplicação em lotes pequenos. Qualquer `--apply` continua condicionado a autorização explícita.
