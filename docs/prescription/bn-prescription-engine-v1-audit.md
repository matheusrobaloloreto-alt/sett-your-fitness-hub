# BN Prescription Engine v1 — Relatório de Auditoria (Claude / QA independente)

Auditoria independente da Fase A do engine (`src/lib/prescription/**`) contra
`docs/prescription/bn-prescription-engine-v1-qa.md` + as 4 decisões do orquestrador
(contrato aditivo; teto duro 16 interm/avançado e 12 iniciante; GC-10 blocker rígido;
endurance ≥3x reduz MMII 20–30% + explicação). Li o código e os testes, rodei build+testes.
**Não corrigi código** (lane de QA apenas).

---

## 1. Resumo executivo

**Classificação final: `ACCEPT_WITH_FIXES`**

O engine passa **100% dos 12 Golden Cases**, **100% das regras inegociáveis testadas** e o
**build + 74 testes**. Segurança crítica confere: EVA > 5 → blocker + handoff + remoção do padrão;
GC-10 → blocker rígido sem inventar exercício; biblioteca-only com blocker para catálogo vazio/ID
inválido; caps de volume 12 (iniciante) / 16 (interm-avançado); sem método avançado para iniciante
ou com dor (caminho de texto); sem pliometria nas semanas 1–2; conservador vence.

Há **1 fix obrigatório pequeno e localizado** (não quebra os GCs validados nem o contrato, e dor
severa continua sempre bloqueada): a detecção de dor que governa o *hold* de progressão e o bloqueio
de método avançado (`hasPainContext` em `progressionRules.ts`) **não** considera `painReports[]`/
`painEva` — só texto livre. Para dor **moderada** sinalizada **apenas** via campo estruturado
`painReports`/`painEva` (sem eco em texto), o *hold* e o strip de método avançado podem não disparar.
É a única razão de não ser `ACCEPT` direto. Corrigível em ~1 linha; **Fase B pode ser autorizada
assim que F1 entrar.**

---

## 2. Commits auditados

| Commit | Mensagem |
|---|---|
| `20e0448` | codex: add bn prescription engine core |
| `3eb24b4` | codex: align prescription engine with bn methodology spec |
| `9000d95` | codex: complete prescription engine qa coverage |

Arquivos: `engine.ts`, `engine.test.ts`, `types.ts`, `methodology.ts`, `presets.ts`,
`volumeRules.ts`, `progressionRules.ts`, `restrictionRules.ts`, `exerciseScoring.ts`,
`explanations.ts`, `validator.ts`.

---

## 3. Resultado dos comandos

| Comando | Resultado |
|---|---|
| `npm run test -- src/lib/prescription` | ✅ **34/34** (engine.test.ts) |
| `npm run test` | ✅ **74/74** (8 arquivos) |
| `npm run build` | ✅ build ok (apenas warning de chunk-size pré-existente) |

---

## 4. Matriz dos Golden Test Cases

Todos verificados por **leitura das asserções** (não só "passou") + suite verde.

| GC | Perfil | Teste correspondente | Resultado | Observações |
|---|---|---|---|---|
| GC-01 | Iniciante · joelho + valgo | `GC-01 PASS — iniciante com dor no joelho + valgo dinâmico` | **PASS** | quad ≤10; glúteo antes do joelho (assert de índice); sem ATG/plio; rule_ids `reduzi_quadriceps_por_dor_joelho`,`priorizei_gluteo_medio_por_valgo`,`evitei_metodo_avancado_por_dor_ou_nivel`; warning conservador; 0 blocker |
| GC-02 | Intermediário · lombar + butt wink | `GC-02 PASS — ...` | **PASS** | UL ×2; posterior ≤10; core anti-rotação; sem terra/good morning/flexão carregada; `hold/regress`; rule_ids lombar/butt |
| GC-03 | Ombro + cifose/protração | `GC-03 PASS — ...` | **PASS** | ombro ≤10; face pull/remada presentes; sem atrás-da-nuca/remada alta/dips; rule_ids escapular/ROM indolor |
| GC-04 | Iniciante pedindo 6 dias | `GC-04 PASS — ...` | **PASS** | rebaixa p/ ≤4 treinos; "3-4 dias estruturados"; rule_id `rebaixei_frequencia_iniciante_6_dias`; sem avançado |
| GC-05 | Corrida/endurance ≥3x | `GC-05 PASS — ...` | **PASS** | preset `corrida_musculacao`; MMII ≤12; `reduzi_mmii_por_corrida`; warning `endurance_agenda_missing` |
| GC-06 | Emagrecimento iniciante | `GC-06 PASS — ...` | **PASS** | preset emagrecimento; mantém compostos (carga); GG ≤12; sem drop/cluster |
| GC-07 | Avançado · hipertrofia | `GC-07 PASS — ...` | **PASS** | GG ≤16 (teto duro v1); bloco 1 **sem** up-set/pirâmide; bloco final libera; `metodo_avancado_controlado` |
| GC-08 | Retorno gradual pós-dor | `GC-08 PASS — ...` | **PASS** | preset retorno_lesao; quad ≤8 (MEV); RIR 3–5; "progressao por tolerancia"; sem avançado |
| GC-09 | Equipamento limitado | `GC-09 PASS — ...` | **PASS** | só usa IDs do catálogo limitado; 0 exercício de máquina/barra; 0 blocker |
| GC-10 | Biblioteca sem substituto seguro | `GC-10 PASS — ...` | **PASS** | **blocker rígido** `safe_alternative_unavailable`; não inclui o `unsafe-squat`; `library_policy.validation.valid=false` |
| GC-11 | EVA > 5 | `GC-11 PASS — ...` | **PASS** | blocker `high_pain_requires_professional_review` + correção `*_teacher_alert`; remove padrão de joelho do texto; 0 linguagem clínica |
| GC-12 | Intermediário · 4 dias · baseline | `GC-12 PASS — ...` | **PASS** | UL ×2; **0 warning/0 blocker** (canário contra falso-positivo); costas 10–16; core ≤10; blocos 1-2/3-4/5-6 |

**12/12 PASS.**

---

## 5. Regras inegociáveis

| Regra | Resultado | Evidência |
|---|---|---|
| Dor > 3 trava progressão | **PASS¹** | `shouldHoldProgression`/`progressionProtocol` → "hold/regress"; teste R1 + GC-01/02/03/08. ¹ver F1 (dor só via `painReports`/`painEva` sem texto não dispara o hold) |
| EVA > 5 gera handoff | **PASS** | `classifyPainSeverity` eva>5→severa→`alertTeacher`+blocker; GC-11 + R-test |
| App não diagnostica/trata | **PASS** | corrections "não tomar decisão clínica"; GC-11 assert `!/diagnóstico|tratamento clínico/` |
| Sem exercício fora da biblioteca | **PASS** | catálogo vazio→blocker `empty_exercise_library`; ID inválido→`exercise_outside_library`; `pickCatalogExercise` só retorna do catálogo |
| Sem método avançado p/ iniciante | **PASS** | `applySimpleCorrections` remove; warning `advanced_method_for_beginner`; periodização sem drop/cluster |
| Sem método avançado com dor | **PASS¹** | strip por `hasPainContext` + warning `advanced_method_with_pain`. ¹mesma ressalva F1 |
| Sem pliometria nas semanas 1–2 | **PASS** | warning `plyometrics_in_block_1`; avoidKeywords; base methods "sem pliometria" |
| Regra mais conservadora vence | **PASS** | `combineSeverity` (máx) + `PAIN_AND_SAFETY_RULES` |
| Grupo pequeno ≠ volume de grande | **PASS** | `smallGroupFactor 0.6` + hardCap small; testes core/ombros ≤10, ≤8 |
| Sem substituto seguro → blocker/warning | **PASS** | gap `BLOCKER:safe_alternative_unavailable` (essencial) / `WARNING:` (acessório); GC-10 |
| Iniciante ≤ 12 séries/grupo grande | **PASS** | `hardCapsByLevel.iniciante=12`; testes ≤12 |
| Interm/avançado ≤ 16 séries/grupo | **PASS** | `hardCapsByLevel=16` (sem exceção 18–20 ativa); GC-07/12 ≤16 |

¹ **F1 (fix obrigatório):** `hasPainContext` (`progressionRules.ts`) serializa só `{restrictions,
assessment, anamnese}`. `deriveRestrictionRules` e o validador já leem `painReports`/`painEva`, mas o
*hold*/strip de avançado dependem de `hasPainContext`. Dor **moderada** sinalizada **apenas** via
`painReports[].eva`/`painEva` (sem eco em texto) pode passar sem hold/strip. Dor **severa** continua
bloqueada (via `deriveRestrictionRules`→blocker), então não é furo crítico.

---

## 6. Auditoria BNITO

| Critério | Resultado |
|---|---|
| 100% das explicações têm `rule_id` | **PASS** (teste dedicado: todas têm rule_id) |
| `category`/`source`/`target`/`action`/`reason` existem | **PASS** (interface + teste `every(...)` dos 6 campos) |
| Nenhuma explicação inventada (deriva de regra real) | **PASS** — toda explicação vem de `explanationsFromRestrictions`/`endurance`/`frequency`/`deload`/`progression`/`correctionsToExplanations`/blockers, cada uma com `rule_id` = código de regra disparada |
| Casos severos sem diagnóstico clínico | **PASS** — corrections "sinalizar professor e não tomar decisão clínica automática"; GC-11 sem termos clínicos |
| `pain_or_injury_requires_conservative_progression` com rule_id real + fonte coerente | **PASS** — emitido pelo validador com `code` = rule_id e `source: "anamnese"`; o `context` dele já inclui `painReports`/`painEva` |

**Observação (não reprova):** variação textual ≥3 templates/categoria **não** implementada — o engine
emite **objetos estruturados** (1 frasing por fábrica). Conforme decidido, fica como **recomendação
futura**; objetos estruturados estão corretos.

---

## 7. Contrato de saída

| Critério | Resultado |
|---|---|
| `TrainingProgram` mantém campos compatíveis com PDF/telas/publicação | **PASS (shape)** |
| Mudanças aditivas | **PASS** — `schemaVersion`,`engineMeta`,`validation`,`explanations`,`library_policy`,`validator` são novos/aditivos |
| Campos existentes não removidos/renomeados | **PASS** — presentes: `cycle_name`,`objective`,`duration_weeks`,`workouts`,`periodization_blocks`,`library_policy`,`validator`,`bnito_after_generation` (teste `toMatchObject`) |
| `schemaVersion/engineMeta/validation/explanations` não quebram consumo | **PASS** — aditivos; não colidem com chaves consumidas |

**Observação (não reprova, conforme decidido):** este é um **lib puro** (Fase A) ainda **não acoplado**
à edge/UI; a verificação **E2E real de render no portal/PDF** fica para Fase B/QA E2E. O *shape* está
preservado e o teste "contrato compatível com Studio/PDF/publicação" passa.

---

## 8. Deload

| Critério | Resultado |
|---|---|
| Regra/receita de deload existe no plano | **PASS** (`DELOAD_RULES`, `progression_protocol` ramo deload, explicação `deload_reduz_volume`) |
| Volume reduz 40–50% | **PASS** (`volumeReduction: 0.5` via orçamento global `allocateDeloadSetCounts`; fixture canônica 52→26 séries + sinalização quando o mínimo de 1 série torna a faixa impossível) |
| RIR 4–5 | **PASS** (teste: todo exercício `rir === "4-5"` no deload) |
| Sem falha/método avançado | **PASS** (warning `deload_with_advanced_method` + methods do deload) |
| Não exige agendamento real no calendário (Fase A) | **PASS** (dispara por `input.deload`; sem dependência de calendário — conforme decidido) |

---

## 9. Riscos para Fase B

| Risco | Avaliação |
|---|---|
| Import em Supabase Edge/Deno | O engine é TS puro sem deps de Node/React (só imports relativos) → portável. **Atenção:** Deno exige extensões `.ts` nos imports e `import type`; revisar ao mover/symlinkar para `supabase/functions/_shared`. |
| Adapter / `_shared` | Recomendado expor o engine via `_shared` e um adapter que traduza o input do `ai-prescribe-workout` (anamnese/avaliação/catálogo real) para `PrescriptionInput`. |
| Duplicação temporária fallback ↔ engine | `buildEmergencyFallbackPlan` da edge e o engine novo coexistirão; risco de divergência de regras/contrato. Definir qual é a fonte de verdade e plano de descontinuação do fallback. |
| Biblioteca real / metadados incompletos | A seleção depende de `muscle_group`, `equipment`, `contraindications`, `pain_limitation_tags`, `equivalent_substitutes`. Catálogo real com metadados vazios → mais gaps/blockers (comportamento correto, mas pode bloquear muito). Recomendado medir taxa de blocker com o catálogo real antes de promover. |
| Divergência fallback antigo ↔ engine novo | Mesmas saídas para o mesmo input? Rodar comparação em amostra antes do cutover. |
| Contrato com PDF/telas/publicação | Mapear 1:1 os campos do `TrainingProgram` ↔ o que o PDF/portal consomem hoje (nomes podem diferir do output atual da edge). Fazer um teste de render E2E na Fase B. |
| **Consistência de dor estruturada (F1)** | Garantir que o input estruturado (`painReports`/`painEva`) dispare hold/strip — corrigir F1 **antes** de wirar a edge, pois a edge tende a passar dor via campo estruturado. |

---

## 10. Decisão final

### `ACCEPT_WITH_FIXES`

**Fix obrigatório (curto, antes da Fase B):**
- **F1** — `progressionRules.ts::hasPainContext`: incluir `painReports` e `painEva` na serialização
  (igual a `deriveRestrictionRules`/validador), para que dor moderada via campo estruturado também
  dispare *hold* de progressão e bloqueio de método avançado. Adicionar 1 teste: input com
  `painReports:[{region:"joelho",eva:4}]` e `restrictions:""` → `progression_protocol` contém
  "hold/regress" e nenhum método avançado no plano.

**Recomendados (não bloqueiam a Fase B):**
- **F2** — Endurance: a redução de −20% hoje aplica a **todos** os grupos e dispara com **qualquer**
  flag de endurance. A decisão #4 pede foco em **MMII** e gatilho **≥3x**. Considerar escopar a
  redução a MMII e/ou condicionar a `enduranceDays >= 3` (o validador já usa `>=3` para o agenda-warning).
- **F3** (cosmético) — `presets.ts`: strings `target_weekly_sets` ainda citam "16-20 com justificativa"
  e "14-16 MMII"; o teto **efetivo** é 16/12 (`hardCapsByLevel`). Alinhar o texto narrativo para não
  confundir leitura (a aplicação já limita corretamente).
- **F4** (robustez) — O teto de volume é garantido por geração conservadora + warning `status:"alto"`,
  não por *truncamento duro*. Na Fase B (catálogo/specs mais ricos), avaliar um clamp explícito.

**Autorização da Fase B:** pode ser autorizada **logo após F1** (mudança de ~1 linha + 1 teste). F2–F4
podem entrar junto da Fase B. Nenhum blocker crítico de segurança, biblioteca-only, contrato, EVA>5/
handoff ou volume máximo.
