# RELATORIO - 2026-08-20 - Curadoria P0 QA Independente

## Veredito

A revisao inicial dos 16 P0 esta tecnicamente correta no ponto principal: nenhuma linha deve ir para upsert agora. Eu concordei com 16/16 achados, com zero `ready_for_upsert=true`.

O problema real nao e falta de coragem para decidir. E falta de evidencia suficiente para transformar nomes de exercicio em matriz anatômica de volume semanal. Os casos se dividem em: alvo unico incompleto, taxonomia funcional usada como musculo, e alvos claramente copiados/errados.

## Escopo e fontes

- Worktree: `/Users/macbookpro/.codex/worktrees/bn-app-20260814/training-volume`
- Branch: `codex/bn-training-volume`
- HEAD verificado: `08d2e34`
- Fonte avaliada: `docs/prescription/curation-v2/library-curation-v2-p0-biomechanics-review.csv`
- Snapshot vivo versionado: `docs/prescription/curation-v2/library-curation-v2-catalog-snapshot.json`
- Revisao/base P0: `docs/prescription/curation-v2/library-curation-v2-p0-review.csv`
- Clusters de midia: `docs/prescription/curation-v2/library-curation-v2-video-clusters.csv`
- Artefato gerado: `docs/prescription/curation-v2/library-curation-v2-p0-independent-qa.csv`

Snapshot: schema v2, gerado em `2026-08-20T13:25:00.000Z`, modo `read_only_sanitized`, `contains_pii=false`, 926 exercicios e 1390 linhas de alvo.

Consulta externa read-only: metadados publicos via YouTube oEmbed para os 16 `youtube_video_id`; HEAD read-only dos 2 videos CloudFront presentes no snapshot.

## Contagens

| Medida | Total |
|---|---:|
| Linhas P0 avaliadas | 16 |
| Verdict `agree` | 16 |
| Verdict `disagree` | 0 |
| Verdict `insufficient` | 0 |
| `ready_for_upsert=true` | 0 |
| `ready_for_upsert=false` | 16 |
| `targets_review_status=needs_more_info` | 16 |
| Prioridade QA P0 | 12 |
| Prioridade QA P1 | 4 |
| Prioridade QA P2 | 0 |

## Achados por classe

### P0 - Bloqueio de upsert

1. `Kettlebell swing`, `Mobilidade Sapinho` e `Prancha com pes no TRX` usam `Performance`, `Mobilidade` ou `Estabilidade` como se fossem grupamentos anatômicos. Isso mistura taxonomia funcional com volume muscular e nao pode entrar no motor sem uma decisao de schema.
2. `Remada Alta Barra` e `Rosca Scott Barra` tem alvos incompatíveis com o nome, o grupo muscular do snapshot e a midia publica. Parecem heranca/copia de um template de puxada/costas.
3. `Pulldown barra` e `Pulldown Corda` continuam ambiguos: se forem pulldown de braços estendidos, `Biceps` secundario e suspeito; se forem puxada com flexao de cotovelo, o nome precisa desambiguar.
4. Variantes de step-up com alvo unico em `Quadriceps` subcontam possivel extensao de quadril. A exposicao de gluteo/posterior depende de altura, carga, tronco, apoio e tecnica.

### P1 - Plausivel, mas nao aprovado

1. `Graviton Pronado` e `Serrote Banco`: primario atual e plausivel, mas alvo unico provavelmente subconta acessorios; faltam politica de coeficientes e metadados de seguranca.
2. `Step Up Halteres` e `Step Up Smith`: a matriz atual e plausivel, mas os coeficientes `0.5` seguem heurísticos. Nao ha evidencia suficiente para aprovar.

### P2 - Higiene e metodologia

1. O catalogo mistura escala de `volume_percentage` (`100` em alvos unicos versus `1`/`0.5` em alvos multiplos). A curadoria precisa explicitar se isso e legado tolerado, normalizacao pendente ou contrato real do motor.
2. Muitos itens P0 têm `safety_metadata_gap` mesmo quando o padrao tecnico tem risco previsivel de ombro/lombar/joelho.
3. Midia publica via YouTube confirma nomes/familias de movimento, mas raramente resolve coeficiente anatomico. Usar titulo do video como prova final seria erro metodologico.

## Revisao linha a linha

| # | Exercicio | Verdict | Prioridade QA | Decisao |
|---:|---|---|---|---|
| 1 | Afundo Step Up com elevacao de joelho | agree | P0 | Incompleto; manter needs_more_info. |
| 2 | Crucifixo na Maquina | agree | P0 | Parcialmente inconsistente; triceps suspeito. |
| 3 | Flexao de braco | agree | P0 | Incompleto; media duplicada precisa revisao. |
| 4 | Graviton Pronado | agree | P1 | Primario plausivel; acessorios e seguranca pendentes. |
| 5 | Kettlebell swing | agree | P0 | Taxonomia funcional nao e alvo anatomico. |
| 6 | Mobilidade Sapinho | agree | P0 | Mobilidade nao deve virar volume muscular sem regra. |
| 7 | Prancha com pes no TRX | agree | P0 | Estabilidade e categoria funcional, nao musculo. |
| 8 | Pulldown barra | agree | P0 | Ambiguo; depende de cotovelo/trajetoria. |
| 9 | Pulldown Corda | agree | P0 | Ambiguo; corda nao prova flexao de cotovelo. |
| 10 | Remada Alta Barra | agree | P0 | Alvos atuais inconsistentes. |
| 11 | Rosca Scott Barra | agree | P0 | Alvos atuais claramente errados. |
| 12 | Serrote Banco | agree | P1 | Primario plausivel; alvo unico incompleto. |
| 13 | Step Up Halteres | agree | P1 | Matriz plausivel, coeficientes nao aprovados. |
| 14 | Step Up Smith | agree | P1 | Matriz plausivel, equipamento/coeficientes pendentes. |
| 15 | Step-up com elevacao de joelho | agree | P0 | Alvo unico incompleto; revisar com cluster step-up. |
| 16 | Subida no caixote (step-up) | agree | P0 | Alvo unico incompleto; revisar com cluster step-up. |

## Blockers

- Nao ha evidencia suficiente para transformar os 16 registros em manifesto aprovado.
- O revisor inicial deixou campos `ready_for_upsert=false`; esta QA confirma essa decisao.
- A midia publica confirma familias de movimento, mas nao fornece por si so alvos e coeficientes.
- A curadoria precisa separar tres camadas antes de aprovar: anatomia, taxonomia funcional e metadados de seguranca.
- A escala dos coeficientes no snapshot precisa de regra explicita antes de gerar qualquer SQL.

## Validacao executada

- Conferencia do worktree/branch/HEAD: `codex/bn-training-volume`, `08d2e34`.
- Leitura de `AGENTS.md`, `CLAUDE.md`, `docs/project/HANDOFF-CODEX.md`, `HANDOFF-CLAUDE-TO-CODEX.md` e `docs/project/ERROS-2026-07-28-PARA-CODEX.md`.
- Comparacao dos 16 IDs contra `library-curation-v2-catalog-snapshot.json`.
- Consulta read-only dos 16 titulos YouTube por oEmbed.
- HEAD read-only dos 2 videos CloudFront com `video_url` local.
- Validacao CSV: 16 linhas, 16 IDs unicos, zero `ready_for_upsert=true`.
- `git diff --check`: sem whitespace error.
- Scan sanitizado dos novos artefatos: sem padrao de service-role/JWT/API key/token/secret.

## Proximo passo

1. Definir regra de schema: alvos anatômicos versus tags funcionais (`Performance`, `Mobilidade`, `Estabilidade`).
2. Definir escala canonica de `volume_percentage`.
3. Revisar por clusters: step-ups; pulldowns; rows/curls copiados; mobilidade/estabilidade.
4. So depois gerar um manifesto aprovado, ainda com segunda revisao independente antes de SQL.
