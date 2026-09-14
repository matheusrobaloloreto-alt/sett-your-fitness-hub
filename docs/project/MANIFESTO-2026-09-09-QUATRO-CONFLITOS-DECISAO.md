# Manifesto: quatro conflitos decididos pelo proprietario - 09/09/2026

## Decisoes

| Caso pseudonimo | Matricula ref. | Ciclo canonico preservado ref. | Ciclo nao canonico retirado ref. |
| --- | --- | --- | --- |
| Caso C-01 | `d735907ca436` | ciclo canonico preservado `311f71c93012` | ciclo nao canonico retirado `b41fde29a9c4` |
| Caso C-02 | `5f9de190f3c7` | ciclo canonico preservado `cf75bbafaa2b` | ciclo nao canonico retirado `d48b4ada7cfa` |
| Caso C-03 | `467cc79d6c5b` | ciclo canonico preservado `ebf991044552` | ciclo nao canonico retirado `3f3ba457e7d0` |
| Caso C-04 | `7975a4d98a88` | ciclo canonico preservado `8f758b912507` | ciclo nao canonico retirado `8d56a0f1060d` |

As decisoes e vigencias individuais foram aplicadas conforme a autorizacao privada do dono. Nomes, datas individualizantes e o vinculo pessoa-caso permanecem exclusivamente na evidencia privada protegida por RLS.

Fonte nominal protegida: tabela privada `training_cycle_owner_decision_repair_audit` em PROD; este manifesto conserva apenas referencias tecnicas pseudonimas.

## Politica de preservacao

- Nenhum treino, exercicio, cardio, bundle, log ou sessao e apagado ou movido.
- O ciclo perdedor recebe `status=superseded` e aponta para o ciclo canonico.
- O portal e a agenda ja excluem ciclos superseded da visao operacional.
- Before-images, after-images, hashes e contagens de dependencias ficam em
  tabela privada com RLS e acesso somente do `service_role`.
- O rollback restaura as oito linhas envolvidas apenas se seus hashes atuais
  ainda forem exatamente os after-images auditados.

## Gates

- Resolver exatamente os quatro pares no tenant `bn-performance-training`.
- Exigir datas, estados, entrega, ordem de criacao e conteudo esperados.
- Falhar se existir residuo da mesma chave de reparo ou alteracao concorrente.
- Preservar integralmente as dependencias de ambos os lados de cada par.
- Pos-flight agregado confirmou o estado esperado e a ausencia de sobreposicoes operacionais;
  evidencias nominais e o vinculo pessoa-caso permanecem apenas na auditoria privada protegida por RLS.
- Encerrar com zero pares atuais/futuros sobrepostos nas matriculas operacionais
  do tenant BN.

## Operacao

Dry-run exato: executar o arquivo de apply trocando apenas o `commit` final por
`rollback`. Aplicar somente apos GO independente.

Apply:

```bash
supabase db query --linked --workdir /tmp/sett-prod-link.8YYGzw \
  --file scripts/repair-bn-four-owner-cycle-decisions-apply.sql
```

Rollback fail-closed:

```bash
supabase db query --linked --workdir /tmp/sett-prod-link.8YYGzw \
  --file scripts/rollback-bn-four-owner-cycle-decisions.sql
```

## Resultado em producao

- Dry-run do apply exato com `rollback`: aprovado, `4/4` pares e preservacao
  de conteudo em todos.
- QA independente pre-apply: `GO`, sem achados criticos, altos ou medios.
- Apply em `zshrcgbyhzxpnlccssyz`: concluido em 09/09/2026.
- Pos-audit read-only: `4/4` after-images exatas, `4/4` dependencias preservadas,
  `0` pares atuais/futuros sobrepostos e `0` matriculas operacionais afetadas.
- QA independente pos-apply: `GO`, com nova consulta read-only e `pass=true`.
- Auditoria privada: RLS ativa, `anon_select=false` e
  `authenticated_select=false`; QA tambem confirmou ausencia de `insert/update`
  para ambos os papeis clientes.
- Ensaio do rollback exato, com apenas o `commit` final substituido por
  `rollback`: `4/4` pares restaurados dentro da simulacao e nenhuma mudanca
  persistida.
- A primeira chamada de apply com caminho relativo falhou antes de ler o SQL;
  a repeticao com caminho absoluto executou a unica aplicacao efetiva.

O rollback permanece disponivel, mas nao deve ser executado sem uma nova
auditoria: qualquer mudanca posterior em um dos oito ciclos o fara falhar
fechado pelos hashes gravados.
