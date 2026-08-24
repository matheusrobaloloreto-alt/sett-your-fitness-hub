# Curation v2 - Evidence review dos 11 excluidos do safe-target-return

**Data:** 2026-08-24  
**Worktree:** `codex/bn-training-volume`  
**Base auditada:** `a6c0327fbb40567cfac2bc16c62dedd5e8564762`  
**Escopo:** 11 IDs em `excluded_from_batch` do artefato `library-curation-v2-safe-target-return-11.json`.  
**Status:** documental/read-only. Nenhum JSON, CSV, target, `ready_for_upsert`, manifest, SQL, migration ou banco foi alterado.

## Veredito

| Classe | Quantidade | Efeito permitido |
|---|---:|---|
| `BLOCK_MEDIA_NAME_MISMATCH` | 2 | Nao avancar. Corrigir/confirmar midia e nome antes de qualquer proposta tecnica. |
| `SAFE_EXTERNAL_NEEDS_LOCAL_CALIBRATION` | 5 | Pode avancar para artefato tecnico separado, sem percentuais e com `ready_for_upsert=false`; exige calibracao local e QA independente. |
| `CALIBRATION_CONFLICT_NEEDS_INDEPENDENT_QA` | 4 | Nao aplicar por precedente local ainda; pode ir para fila de QA tecnico independente porque a evidencia local limpa vem de extensao/pronacao/triset de antebraco, nao de flexao de punho equivalente. |
| **Total** | **11** | **0 linhas prontas para upsert.** |

## Fontes locais

- `docs/prescription/curation-v2/library-curation-v2-safe-target-return-11.json`: registra os 11 excluidos do retorno seguro inicial.
- `docs/prescription/curation-v2/library-curation-v2-visual-22-video-review-record.md`: revisao visual 22/22; reteve `fd207a91` e `479eecd9` por problema de midia/nome.
- `docs/prescription/curation-v2/library-curation-v2-target-signature-high-signal-review.csv`: confirma assinatura contaminada e `ready_for_upsert=false`.
- `docs/prescription/curation-v2/library-curation-v2-catalog-snapshot.json`: snapshot sanitizado, `contains_pii=false`, com precedentes locais e targets atuais.
- `docs/prescription/curation-v2/library-curation-v2-high-signal-manual-remediation-plan.md`: exige revisao manual por variacao, target existente, video/setup, return guard e QA independente.
- `src/lib/exerciseTargetConfig.ts` e `supabase/functions/_shared/prescription/volumeRules.ts`: novas escritas usam escala canonica, mas a regra de volume nao valida plausibilidade biomecanica.

## Fontes externas primarias/autoridades tecnicas

- NCBI Bookshelf - Forearm Compartments: compartimento anterior/flexor atua em flexao de punho e dedos.  
  https://www.ncbi.nlm.nih.gov/books/NBK539784/
- NCBI Bookshelf - Hand Muscles: flexor carpi radialis, palmaris longus e flexor carpi ulnaris permitem flexao do punho.  
  https://www.ncbi.nlm.nih.gov/sites/books/NBK537229/
- NCBI Bookshelf - Flexor Carpi Ulnaris: FCU e flexor potente do punho e tambem participa de aducao do punho.  
  https://www.ncbi.nlm.nih.gov/books/NBK526051/
- McAllister et al. 2013, Journal of Strength and Conditioning Research - upright row grip width: maior largura de pegada aumenta atividade de deltoide/trapezio e reduz biceps braquial.  
  https://pubmed.ncbi.nlm.nih.gov/22362088/
- NCBI Bookshelf - Deltoid Muscle: deltoide participa da abducao do ombro, com segmento lateral elevando o braco de 15 a 100 graus.  
  https://www.ncbi.nlm.nih.gov/books/NBK537056/
- NCBI Bookshelf - Trapezius: trapezio estabiliza/move escapula; fibras superiores elevam e rodam superiormente a escapula.  
  https://www.ncbi.nlm.nih.gov/books/NBK518994/

> Nota metodologica: EMG/atividade muscular externa nao foi convertido em `volume_percentage`. A evidencia externa foi usada apenas para sustentar candidatos qualitativos de grupamento. Coeficientes dependem de regra local e QA independente.

## Matriz 11/11

| ID | Exercicio | Status | Grupamentos sustentados agora | Evidencia/limite |
|---|---|---|---|---|
| `a9307b76-a4e2-4305-b683-d86e59ae80b6` | Flexao de Punho 90 graus Polia Baixa | `CALIBRATION_CONFLICT_NEEDS_INDEPENDENT_QA` | Candidato qualitativo: Antebraco. | Revisao visual avancou, mas os precedentes locais limpos mais proximos sao extensao de punho, pronacao/supinacao e triset antebraco. Anatomia externa sustenta flexores do antebraco, mas falta precedente local especifico para flexao de punho em polia 90 graus. |
| `dcc7c1f8-9e2e-4b4d-a91e-fbc96fd042fe` | Flexao de Punho com a Polia Atras | `CALIBRATION_CONFLICT_NEEDS_INDEPENDENT_QA` | Candidato qualitativo: Antebraco. | Movimento e fonte apontam antebraco, mas a variacao "polia atras" muda direcao de resistencia e exige QA tecnico. Nao usar precedentes de extensao como calibracao automatica. |
| `9c2ad88a-1f2a-4c58-9455-a667d5331d09` | Flexao de Punho Polia Baixa | `CALIBRATION_CONFLICT_NEEDS_INDEPENDENT_QA` | Candidato qualitativo: Antebraco. | Evidencia anatomica externa sustenta flexao de punho por flexores do antebraco; localmente ainda falta precedente limpo de flexao de punho equivalente. |
| `7512d746-8861-45b3-9242-800df83c8810` | Flexao de Punho Unilateral Polia Alta | `CALIBRATION_CONFLICT_NEEDS_INDEPENDENT_QA` | Candidato qualitativo: Antebraco. | Unilateralidade e polia alta exigem conferencia de setup, amplitude e direcao da resistencia antes de aprovar targets. |
| `479eecd9-1642-4c4c-b9eb-b0a14f11af3a` | Flexao de Punho Halteres | `BLOCK_MEDIA_NAME_MISMATCH` | Nenhum aplicavel agora. | Visual review registrou mismatch: nome exige halteres, mas midia/parecer apontam demonstracao em barra/polia. Nao avancar ate substituir ou validar a midia correta. |
| `fd207a91-506b-466d-8d6c-d905e97e690a` | Flexao de Punho na Barra Fixa ou Antebraco na Barra Fixa | `BLOCK_MEDIA_NAME_MISMATCH` | Nenhum aplicavel agora. | Visual review bloqueou: video de barra/muscle-up sem flexao isolada de punho demonstrada. Precisa separar flexao dinamica de punho, sustentacao/isometria de grip e exercicio de barra. |
| `b222ffd2-a90e-47a2-9924-a63381446069` | Remada Alta Barra | `SAFE_EXTERNAL_NEEDS_LOCAL_CALIBRATION` | Candidatos qualitativos: Deltoide Lateral; Trapézio; Biceps como possivel secundario. | PubMed sustenta deltoide/trapezio/biceps modulados pela largura da pegada. A assinatura atual `Dorsal:primary` nao deve ser mantida por cluster. Sem percentuais. |
| `bc77dd8b-8a5b-49da-987b-2653991d1659` | Remada Alta Halteres | `SAFE_EXTERNAL_NEEDS_LOCAL_CALIBRATION` | Candidatos qualitativos: Deltoide Lateral; Trapézio; Biceps como possivel secundario. | Halteres permitem trajetoria/rotacao diferentes da barra; precisa calibracao por setup e amplitude. |
| `ce8529f2-dd0e-4c7c-8110-d2505d84bfe2` | Remada Alta Maquina | `SAFE_EXTERNAL_NEEDS_LOCAL_CALIBRATION` | Candidatos qualitativos: Deltoide Lateral; Trapézio; Biceps como possivel secundario. | Maquina pode fixar trajetoria e pegada; validar se altera alvo ou risco de ombro antes de definir role local. |
| `e2e6d537-a9ba-4feb-bd2d-f6b7591895c2` | Remada Alta no Smith | `SAFE_EXTERNAL_NEEDS_LOCAL_CALIBRATION` | Candidatos qualitativos: Deltoide Lateral; Trapézio; Biceps como possivel secundario. | Smith reduz liberdade de trajetoria; nao copiar barra livre sem confirmar altura final, pegada e posicao do ombro. |
| `6c2e58df-666f-420a-81e2-192929555fdc` | Remada Alta Polia | `SAFE_EXTERNAL_NEEDS_LOCAL_CALIBRATION` | Candidatos qualitativos: Deltoide Lateral; Trapézio; Biceps como possivel secundario. | Cabo muda linha de resistencia ao longo da amplitude. Avanco permitido apenas para proposta qualitativa sem percentuais. |

## Regras de calibracao propostas

### Flexao de punho

1. Manter `479eecd9` e `fd207a91` bloqueados ate resolver midia/nome.
2. Para os outros 4 IDs, QA independente deve confirmar que ha flexao dinamica de punho, nao apenas sustentacao de grip, pronacao/supinacao, extensao ou gesto misto.
3. O target candidato precisa existir no catalogo local. Neste snapshot, `Antebraco` existe como target limpo em exercicios de antebraco, mas os precedentes equivalentes de flexao ainda estao em conflito.
4. Nao criar subdivisoes novas como flexores do carpo sem existir no catalogo de grupos musculares.
5. Nao preencher percentuais nesta etapa. Quando aprovado, usar a convencao local de target primario/secundario apenas apos decisao biomecanica documentada.

### Remada alta

1. Tratar as 5 variacoes separadamente: barra, halteres, maquina, Smith e polia.
2. Em cada video/setup, registrar: largura da pegada, altura final, cotovelo acima/abaixo do ombro, rotacao interna do ombro, linha de resistencia, controle escapular e dor/risco de ombro.
3. Nao manter `Dorsal:primary` por dominancia do cluster de costas. A evidencia externa aponta deltoide/trapezio como alvos principais mais plausiveis, mas a decisao local deve ser calibrada por video e regra do catalogo.
4. Biceps pode ser candidato secundario, especialmente conforme pegada, mas nao deve virar volume fracionado sem regra local.
5. Risco de ombro deve continuar documentado em metadados de seguranca quando a amplitude/rotacao justificarem.

## Gates humanos antes de qualquer aplicacao

1. Criar artefato tecnico separado; nao editar a fonte high-signal original.
2. Conferir contagem: 11 IDs unicos; 2 `BLOCK_MEDIA_NAME_MISMATCH`; 5 `SAFE_EXTERNAL_NEEDS_LOCAL_CALIBRATION`; 4 `CALIBRATION_CONFLICT_NEEDS_INDEPENDENT_QA`.
3. Manter todas as linhas com `ready_for_upsert=false` ate QA independente.
4. Rodar return guard sobre qualquer arquivo de retorno futuro.
5. Approved manifest deve permanecer vazio enquanto nao houver aprovacao humana completa.
6. SQL deve ser noop/dry-run ate autorizacao explicita para apply.
7. Antes de qualquer aplicacao real: backup, diff antes/depois, validacao de schema vivo e plano de rollback.

## Nota sobre skill ATENA

Foi consultada a skill 1125 - Sistema de Curadoria de Conteudo como checklist metodologico: priorizar fontes confiaveis, separar fato consolidado de interpretacao e explicitar lacunas. O template nao foi copiado cru; foi adaptado para auditoria tecnica read-only.
