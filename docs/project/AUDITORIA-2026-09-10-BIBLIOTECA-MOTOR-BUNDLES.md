# SETT/BN — auditoria da biblioteca, motor, bundles e vídeos (2026-09-10)

## Veredito

O motor determinístico não perdeu suas regras de progressão, mas recebia **245 exercícios importados do MFIT sem grupo muscular nem targets**. Isso era um defeito real de elegibilidade do catálogo: essas linhas podiam entrar tanto no motor principal quanto no fallback de emergência. O patch local agora as exclui da geração sem apagar ou reclassificar dados.

Os **10 vínculos quebrados** não são falta de catálogo em sentido amplo: são referências antigas para nomes genéricos/duplicados dentro de um ciclo atual. Só um alias já tem aprovação documentada; os demais exigem escolha canônica ou decisão profissional de variante. Nenhuma troca foi aplicada automaticamente.

Os bundles que servem ciclos atuais estão íntegros: **7/7 completos, 0 incompletos**. Os números antigos de “bundle incompleto” misturavam tentativas falhas e registros legados/órfãos com conteúdo vigente. O patch local corrige a tela mensal e torna explícita a falha ao vincular um plano de cardio.

A biblioteca própria de gravação tem **924 códigos vivos**, 52 vídeos próprios publicados e **872 pendentes de gravação/importação**. Não há novo take na fila de staging. Nenhum vídeo foi ingerido ou publicado nesta rodada.

## Evidência viva agregada e sem PII

Auditoria read-only em 2026-09-10, usando `current_business_date` e o tenant BN canônico:

| Medida | Global | BN | Visível ao BN |
|---|---:|---:|---:|
| Exercícios | 747 | 423 | 1.170 |
| Com targets | 747 | 178 | 925 |
| Sem targets | 0 | 245 | 245 |
| Com equipamento | 747 | 168 | 915 |
| Sem equipamento | 0 | 255 | 255 |
| Com grupo muscular id | 747 | 168 | 915 |
| Sem grupo muscular id | 0 | 255 | 255 |
| Com metadata de contraindicação/dor | 331 | 106 | 437 |
| Sem essa metadata | 416 | 317 | 733 |
| Com alguma fonte de vídeo | 747 | 254 | 1.001 |
| Com `video_path` próprio | 50 | 2 | 52 |

Os 245 sem targets são linhas BN importadas do MFIT em 26–27/08 e também não possuem metadata. Elas aparecem em histórico de treino, portanto não devem ser apagadas; o caminho seguro é impedir seleção automática e curar dados separadamente.

Impacto histórico/atual medido na investigação:

- 1.167 slots históricos referenciam os 245 exercícios sem targets, em 395 treinos.
- 1.115 desses slots não estão superseded.
- 324 slots estão em 112 treinos de 26 ciclos atuais.
- Nos slots atuais, 322/324 ainda carregam `muscle_group` dentro do JSON do treino, mas 0/324 carregam targets e 0/324 equipamento. Isso preserva exibição histórica, mas não torna a linha de catálogo elegível para nova geração.

## Separação causal

| Categoria | Fato | Tratamento |
|---|---|---|
| Bug do motor/catálogo | Loader e normalização aceitavam qualquer linha com id+nome, mesmo sem grupo/targets. O fallback legado também recebia essas linhas. | Patch local fail-closed: exigir id, nome e ao menos `muscle_group` ou target real antes da geração. Restam 925 entradas classificadas. |
| Bug de integração do Studio | Geração de cardio podia retornar sem `data.id`; o update de `running_plan_id` ignorava erro. | Patch local valida o ID e propaga erro de persistência. |
| Bug de leitura do card mensal | A tela buscava tentativas falhas e exibia modalidades pedidas como se fossem planos concluídos. | Patch local limita a `active|scheduled` e exige o ponteiro persistido para cada badge. |
| Drift de metodologia | Bloco inicial não cauteloso dizia RIR 2–3, divergindo da base BN RIR 3–4. | Texto e teste alinhados para RIR 3–4. |
| Conteúdo profissional ausente | 245 imports não têm classificação anatômica/targets e 733 entradas não têm metadata de segurança. | Curadoria separada; não inferir anatomia, equipamento, dor ou contraindicação por nome. |
| Gravação pendente | 872/924 códigos vivos ainda não têm vídeo próprio. | Gravar/importar em lotes: original → `_staging` → dry-run → QA de privacidade/técnica → publicação autorizada. |

## Dez referências quebradas atuais

A auditoria encontrou 10 slots quebrados, em três treinos de um ciclo atual. Não há slot sem nome: os IDs referenciados deixaram de existir no catálogo visível.

| Nome no treino | Classificação | Estado seguro |
|---|---|---|
| Face pull | Alias aprovado para `Face Pull Corda` no manifesto MFIT | Pode entrar em reparo determinístico com backup/CAS/rollback, ainda não aplicado. |
| Prancha frontal | Dois candidatos exatos visíveis | Escolher ID canônico e deduplicação antes do reparo. |
| Levantamento terra romeno | Provável correspondência com `Terra romeno` | Exige aprovação técnica explícita; não usar semântica como autorização. |
| Flexora sentada | Provável correspondência com `Cadeira Flexora` | Exige aprovação técnica explícita. |
| Elevação lateral | Múltiplas variantes | Exige professor definir equipamento/posição/execução. |
| Leg press | Múltiplas variantes | Exige professor definir máquina/ângulo/posição. |
| Puxada alta | Múltiplas variantes | Exige professor definir pegada/acessório/posição. |
| Remada baixa | Múltiplas variantes | Exige professor definir pegada/acessório/posição. |
| Remada curvada | Múltiplas variantes | Exige professor definir implemento/pegada. |
| Supino reto | Múltiplas variantes | Exige professor definir barra/halter/máquina/Smith. |

Não existe base técnica para “pegar o mais parecido”. Isso poderia trocar equipamento, ângulo, pegada ou padrão de execução no treino vigente.

## Bundles

Estado vivo agregado:

- 57 bundles: 22 active, 9 scheduled, 14 superseded e 12 failed.
- 7 bundles servem ciclos atuais: 6 active e 1 scheduled.
- 7/7 serving estão completos; 0 incomplete.
- Dentro dos 7 serving: força 6/6, cardio 2/2, natação 1/1 e ciclismo 1/1 com ponteiro e item consistentes.
- 12 registros são tentativas falhas, não conteúdo servido.
- 13 registros não falhos são legados sem `training_cycle_id`; exigem política de retenção/arquivamento, não regeneração automática.
- 11 bundles pertencem a ciclo atual, mas não estão em status serving; devem permanecer separados do caminho de entrega.

Limite contratual remanescente: `prescription_bundles` mantém um único `running_plan_id` para corrida/natação/ciclismo. Por isso o card local não usa esse ponteiro para inferir badges; ele lê `prescription_bundle_items.modality` e só mostra cada modalidade quando existe item persistido com `entity_id`.

## Vídeos próprios

- Roteiro canônico: 924 códigos vivos, distribuídos 308/309/307.
- Os códigos históricos 355 e 396 foram retirados porque não existem mais no banco e não têm referência em treinos/templates; não foram remapeados.
- Produção: 52 exercícios com `video_path` próprio.
- Backlog real: 872 gravações/importações.
- Fila `_staging` no último status: 0 novos, 0 prontos, 0 bloqueados e 0 enviados.
- Pipeline validado localmente: allowlist 924, bucket privado, MIME/tamanho, origem, tenant, quota, replay e publicação separados.
- Nenhum secret foi exposto, nenhum upload/ingest/deploy foi executado e nenhum canário externo foi criado.

## Validação

- Suíte frontend integral: 148 arquivos e 938 testes passaram.
- Testes Node do auditor, MFIT, contratos de ciclo e ingestão: 110/110 passaram.
- Segurança Deno da ingestão: 12/12 passou.
- Benchmark: cinco execuções dedicadas passaram com mediana de CPU entre 120–159 ms; na suíte integral, 148 ms, mantendo teto de 500 ms. Como controle externo, o GitHub Actions do Release Guardian no commit `3d22637` passou 146/146 arquivos e 930/930 testes com mediana de 105,97 ms. Isso reforça que os 561/548/850 ms locais eram wall-clock sob contenção, não regressão estável do motor.
- `deno check` das Edges tocadas, TypeScript, ESLint focado, build de produção, verificação de backend canônico, performance do bundle e `git diff --check`: passaram.
- QA independente encontrou um P2 nos badges aeróbicos; a correção passou no re-review. Veredito final: GO para commit e handoff, sem P0/P1/P2/P3 remanescente no diff.

## Alterações locais desta rodada

- Auditor agregado read-only com fixtures anonimizadas: `scripts/audit-prescription-library-integrity.mjs`.
- Guard compartilhado de elegibilidade: `supabase/functions/_shared/prescription/catalogEligibility.ts`, aplicado no loader e no motor.
- Correções do Studio/card/bundle, badges por item persistido de modalidade e alinhamento RIR 3–4.
- Gate de performance preservado em 500 ms, agora sobre CPU consumida pelo worker; tempo de parede permanece no log diagnóstico e não reprova por contenção externa.
- Testes de catálogo, integração, UI e auditoria.

## Checklist acumulado deste escopo

- ✅ Auditar cobertura real de biblioteca por tenant — produção, somente leitura.
- ✅ Separar bug de motor, lacuna de conteúdo e gravação pendente — documento local.
- ✅ Auditar os 10 vínculos quebrados — produção, somente leitura.
- ✅ Auditar bundles vigentes versus falhas/legado — produção, somente leitura.
- ✅ Criar auditor reexecutável e anonimizável — código local e testes.
- ✅ Bloquear exercícios sem classificação em ambos os caminhos de geração — código local e testes.
- ✅ Corrigir contrato de persistência/visualização dos bundles — código local e testes.
- ✅ Revalidar a progressão RIR 3–4 — código local e testes.
- ✅ Diagnosticar o gate de performance — flake de tempo de parede demonstrado; teto não foi afrouxado e passou a medir CPU do worker.
- ❌ Reparar as 10 referências (bloqueado) — depende de escolha canônica/decisão profissional e de um plano de escrita com backup, CAS e rollback.
- ❌ Curar os 245 imports sem targets e os 733 sem metadata de segurança (aguardando) — exige conteúdo profissional; inferência automática está proibida.
- ❌ Gravar/importar 872 vídeos próprios (aguardando) — não há take novo; seguir pipeline por lotes.
- ❌ Aplicar em integração/staging/produção (aguardando) — QA independente deu GO; falta promoção pelo Release Guardian.

## Estágios

| Camada | Estado em 2026-09-10 |
|---|---|
| Local | Patch e auditor na worktree isolada `codex/sett-library-engine-audit-20260910`; suíte integral, gates focados, build e QA independente verdes. |
| Commit | Preparado após QA; o hash exato consta no handoff ao Release Guardian. |
| Push/integração | Não executados. |
| Staging | Não alterado. O link local do CLI aponta para staging e não deve ser usado como atalho para produção. |
| Produção | Somente auditoria read-only; zero escrita, deploy, ingestão ou reparo. |

## Próxima ação recomendada

1. Criar commit isolado e entregar ao Release Guardian para integração controlada.
2. Preparar um reparo separado dos 10 slots, com before-image, comparação de versão, rollback e apenas aliases aprovados.
3. Obter decisão técnica para os nomes genéricos antes de qualquer escrita.
4. Curar os 245 imports em lotes auditáveis; não bloquear histórico existente nem inventar metadata clínica.
5. Retomar a gravação dos 872 vídeos somente quando houver novos takes, mantendo staging/dry-run/QA/publicação autorizada.
