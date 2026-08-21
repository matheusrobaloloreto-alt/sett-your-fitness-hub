# Curation v2 Safe Target Return 11 - Dry-run manifest report

> Offline/noop report. No database, network, approved manifest, upsert SQL, staging, or production action was executed.

## Status

| field | value |
|---|---|
| mode | dry_run_noop |
| status | NO_APPROVED_ROWS_NO_SQL_NO_DB |
| dry_run_rows | 11 |
| approved_rows | 0 |
| ready_for_upsert_true | 0 |
| db_access | false |
| network_access | false |
| approved_manifest_generated | false |
| upsert_sql_generated | false |

## Outputs

- Manifest JSON: `docs/prescription/curation-v2/library-curation-v2-safe-target-return-11-dry-run-manifest.json`
- Dry-run review CSV for return guard: `docs/prescription/curation-v2/library-curation-v2-safe-target-return-11-dry-run-review.csv`
- Report: `docs/prescription/curation-v2/library-curation-v2-safe-target-return-11-dry-run-report.md`

## Counts By Group

| group | count |
|---|---:|
| Bíceps | 1 |
| Deltoide Posterior | 4 |
| Glúteo | 4 |
| Posterior de Coxa | 2 |

## Before/After Diff By ID

| exercise_id | exercise_name | before | after | ready_for_upsert |
|---|---|---|---|---:|
| `ae13d351-7019-4b7d-b0e6-cea4b8fea50d` | Cadeira Flexora com Flexão de Quadril | Deltoide Anterior:secondary:50 \| Peitoral:primary:100 \| Tríceps:secondary:50 | Posterior de Coxa:primary:100 | false |
| `4a8b14bf-d7a8-422d-932a-63a3af07e453` | Cadeira Flexora com Flexão de Quadril Unilateral | Deltoide Anterior:secondary:50 \| Peitoral:primary:100 \| Tríceps:secondary:50 | Posterior de Coxa:primary:100 | false |
| `3bd15908-90de-4c6a-8c64-31ad3c75f845` | Coice Polia Baixa | Tríceps:primary:100 | Glúteo:primary:100 | false |
| `e6058264-060f-4e41-83ee-6810f38ca520` | Coice Polia Média | Tríceps:primary:100 | Glúteo:primary:100 | false |
| `efde85ec-e714-44b9-928c-8db249f06c04` | Extensão de Quadril Banco Romano com Flexão | Deltoide Anterior:secondary:50 \| Peitoral:primary:100 \| Tríceps:secondary:50 | Glúteo:primary:100 | false |
| `258bfac0-5456-462d-8530-a8204af6b8f8` | Glúteo Coice Polia Banco | Tríceps:primary:100 | Glúteo:primary:100 | false |
| `8fece0e9-3907-4f54-86b4-54a088cb0540` | Crucifixo Invertido com Peito no Banco | Deltoide Anterior:secondary:50 \| Peitoral:primary:100 \| Tríceps:secondary:50 | Deltoide Posterior:primary:100 | false |
| `8a461d7f-c174-4488-8dca-b4339ad26c81` | Crucifixo Invertido Cruzado Polia | Deltoide Anterior:secondary:50 \| Peitoral:primary:100 \| Tríceps:secondary:50 | Deltoide Posterior:primary:100 | false |
| `6e9fdaca-5bfb-420c-b5bf-5beddcce6c05` | Crucifixo Invertido Sentado | Deltoide Anterior:secondary:50 \| Peitoral:primary:100 \| Tríceps:secondary:50 | Deltoide Posterior:primary:100 | false |
| `b5265c3f-05a3-4fdc-834a-2b6f0c69d12b` | Crucifixo Invertido Unilateral Polia | Deltoide Anterior:secondary:50 \| Peitoral:primary:100 \| Tríceps:secondary:50 | Deltoide Posterior:primary:100 | false |
| `bf33e722-9da1-4e32-af62-546bb5176c3a` | Rosca Scott Barra | Bíceps:secondary:50 \| Deltoide Posterior:secondary:50 \| Dorsal:primary:100 \| Trapézio:secondary:50 | Bíceps:primary:100 | false |

## Hashes

| artifact | sha256 |
|---|---|
| manifest_json | 3b0459fb258f421149e82e43a2624ff67ef93b2b60cc1198bd104765cf350c09 |
| report_md | omitted_self_referential_hash |
| catalog_snapshot | ab677bfc2b88cff378948730a9885930ee6fca7ac4a8ce24d18dd016ade1103e |
| high_signal_review | a2904d37e7090c44b46ae49dd59eec7ba2c73b113c11087c471f943d818922d0 |
| independent_review_record | be7de0ff22a85cea2476e96d6f52e8f034b6dbd54e0192d08e797dc3435b7d7d |
| input_artifact | ba86987fa425ee89aab3c08ed2c740f8bb76a73abb90c4e60e365659bf719088 |
| manual_plan | 887643e1759842f7d4ed8226655a942eda7fc0a912096f1d5359bb8965e9ded7 |
| visual_22_video_review_record | aa300f64d4239d153fcae24436942e3570ba91dc201cf0da4f053c3dc709fc12 |

## Guardrails

- The generated review CSV intentionally keeps `reviewer_status=needs_review` and `ready_for_upsert=false`.
- It is for existing return guard validation only; it is not an approved manifest.
- No upsert SQL was generated.
