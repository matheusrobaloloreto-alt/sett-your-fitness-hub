# RELATORIO - 2026-08-20 - Outliers de assinatura de alvos

## Veredito

O snapshot de 926 exercicios contem 64 candidatos em que uma assinatura completa de alvos, repetida em pelo menos 10 exercicios, aparece fora do grupamento de origem dominante do cluster. Esta e uma fila de deteccao de possivel copia/template, nao uma correcao anatomica automatica.

Todos os 64 permanecem `needs_review` e `ready_for_upsert=false`. O lote P0 original de 16 e sua QA independente continuam preservados; esta fila e uma segunda camada de integridade que encontrou defeitos potenciais fora daquele recorte manual.

## Metodo fail-closed

1. Normaliza somente a escala historica equivalente (`1`/`0.5` para `100`/`50`) e aliases triviais do grupamento de origem.
2. Agrupa matrizes completas e identicas de alvo, papel e percentual.
3. Considera apenas clusters com 10 ou mais exercicios e um grupamento de origem dominante com pelo menos 50% do cluster, sem empate.
4. Enfileira os registros cujo grupamento de origem diverge do dominante.
5. Nao propoe alvo substituto, nao altera coeficiente e nunca marca item pronto.

## Sinais de maior risco para o proximo lote tecnico

Entre os 64 candidatos, 22 formam familias nomeadas com incompatibilidade especialmente forte e devem ser revisadas primeiro:

| Familia | Candidatos | Assinatura suspeita observada |
|---|---:|---|
| Flexao de punho/antebraco | 6 | matriz dominante de peitoral |
| Cadeira flexora | 2 | matriz dominante de peitoral |
| Coice/extensao de gluteo na polia | 3 | alvo unico dominante de triceps |
| Remada alta | 5 | matriz dominante de remadas/costas |
| Crucifixo invertido | 4 | matriz dominante de peitoral |
| Rosca Scott | 1 | matriz dominante de remadas/costas |
| Extensao de quadril no banco romano | 1 | matriz dominante de peitoral |

Essas contagens sao candidatos de revisao, nao conclusoes biomecanicas. Exercicios compostos e classificacoes operacionais podem explicar parte dos demais 42 outliers; aprovar em massa seria metodologicamente errado.

## Artefatos e validacao

- Fila: `docs/prescription/curation-v2/library-curation-v2-target-signature-outliers.csv`.
- Lote tecnico prioritario de 22: `docs/prescription/curation-v2/library-curation-v2-target-signature-high-signal-review.csv`.
- Gerador principal: `scripts/prescription/generate-library-curation-v2.mjs`.
- Refresh deterministico a partir do snapshot sanitizado: `scripts/prescription/refresh-library-signature-outliers.mjs`.
- Testes do gerador: 3/3 aprovados, incluindo escala mista e garantia de zero autoaprovacao.
- `contains_pii=false`; apenas identificadores e metadados tecnicos de exercicios.

## Proximo gate

Revisor de biomecanica/cinesiologia deve avaliar primeiro os 22 itens de maior sinal, usando demonstracao real e metadados do exercicio. Um segundo QA independente deve confirmar qualquer manifesto proposto antes de upsert. Os outros 42 permanecem como triagem de integridade, nao como erro confirmado.
