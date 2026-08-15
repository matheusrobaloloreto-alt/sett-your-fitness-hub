# Plano Seguro de Extensão de Periodização (BN Prescription Engine v1)

> **ORDEM 041.** Auditoria de compatibilidade + plano **aditivo** para exibir melhor a periodização
> (microciclos/mesociclos/fases). **Nada foi implementado** no engine nesta ordem. Sem mudança de
> contrato, edge, PDF/portal, UI, banco, flag, deploy ou cutover.

## 1. Resumo executivo
- O pedido do usuário (microciclos ordinário/regenerativo/choque; mesociclos base/polimento; fases do
  aluno; periodização por objetivo/datas) é **compatível** com o engine — ele **já** periodiza 6 semanas.
- Deve entrar como **extensão ADITIVA**: novos campos opcionais em `periodization_blocks` (e, se preciso,
  um `periodization_context` opcional por workout).
- **Não pode** reescrever o contrato existente, **não pode** quebrar PDF/portal, **não pode** substituir
  as safety rules (tetos de volume, RIR, dor>3 trava, EVA>5 handoff, sem pliometria 1–2).
- **Não pode** ser implementado por chat externo sem **gate ATENA**.

## 2. Estado atual (auditoria — Parte B)
1. **Engine já tem periodização de 6 semanas?** **Sim** — `buildPeriodizationBlocks()` (4 ou 6 semanas).
2. **Semanas 1–2 / 3–4 / 5–6:** `PROGRESSION_BLOCKS` (methodology.ts):
   - **1–2:** "base técnica + MEV", **RIR 3–4**, sem pliometria.
   - **3–4:** "acúmulo até MAV", **RIR 2–3**, progressão reps→carga; hold/regride se dor>3/técnica.
   - **5–6:** "consolidação/intensificação controlada", **RIR 2**; método avançado só se `!pain && !iniciante`.
3. **Deload/regenerativo:** `DELOAD_RULES` (volume −50%, **RIR 4–5**, sem falha/avançado) + orçamento global determinístico via `allocateDeloadSetCounts()`
   + `progressionProtocol()` quando `input.deload`.
4. **RIR:** por bloco (`PROGRESSION_BLOCKS.*.rir`) e por fase de workout (`spec.rir`, ajustado em deload).
5. **Progressão:** `progressionProtocol()` + `progression_rule` por bloco + `progression_protocol` no contrato.
6. **Campo que pode receber fase?** `periodization_blocks[]` (hoje `{weeks, stimulus, methods[], progression_rule}`)
   é o lugar natural para campos aditivos de fase.
7. **PDF/portal consomem `periodization_blocks`?** **Não** (`generatePDFs.ts`/`publishStrengthPlan.ts` não
   referenciam o campo) → adicionar campos é seguro para eles.
8. **O que pode ser adicionado de forma aditiva sem quebrar?** Novos campos **opcionais** em
   `PeriodizationBlock` e um `periodization_context?` opcional em workouts — preservando todos os campos atuais.

## 3. Taxonomia proposta
**Mesociclos:** `base`, `desenvolvimento`, `intensificacao`, `polimento`, `regenerativo`, `retorno_gradual`,
`competitivo` (futuro).
**Microciclos:** `ordinario`, `choque`, `regenerativo`, `estabilizador`, `avaliativo`, `tecnico`.
**Fases exibíveis ao aluno:** `fase_base_tecnica`, `fase_acumulo`, `fase_intensificacao_controlada`,
`fase_regenerativa`, `fase_polimento`, `fase_reavaliacao`.

## 4. Mapeamento v1 conservador (plano padrão de 6 semanas)
| Semanas | mesociclo | microciclo | fase aluno | RIR | regra |
|---|---|---|---|---|---|
| 1–2 | base | ordinario/tecnico | fase_base_tecnica | 3–4 | sem método avançado, sem pliometria |
| 3–4 | desenvolvimento | ordinario | fase_acumulo | 2–3 | progressão reps antes de carga |
| 5–6 | intensificacao | choque controlado **só** interm/avançado sem dor | fase_intensificacao_controlada | 2 | método avançado só se permitido |
| Deload | regenerativo | regenerativo | fase_regenerativa | 4–5 | volume −40 a −50%, sem falha/avançado |
| Polimento | polimento | estabilizador/avaliativo | fase_polimento | — | antes de reavaliação/evento; **não obrigatório** em v1 |

## 5. Regra por objetivo
- **Hipertrofia:** base → desenvolvimento → intensificação controlada → deload.
- **Emagrecimento/recomposição:** base → desenvolvimento com densidade controlada → estabilização/regenerativo quando necessário.
- **Força geral:** base técnica → desenvolvimento de carga → intensificação **sem falha** → deload.
- **Saúde geral:** base técnica → desenvolvimento leve → estabilizador/regenerativo.
- **Retorno gradual:** retorno_gradual/base → ordinário técnico → regenerativo se dor subir; **sem choque, sem método avançado**.
- **Corrida/endurance junto:** evitar choque pesado de MMII quando endurance ≥3×/sem; reduzir MMII 20–30%;
  microciclo regenerativo quando dor/fadiga subir.

## 6. Regras de segurança (a extensão NÃO pode violar)
- Microciclo de **choque proibido para iniciante**.
- Microciclo de **choque proibido com dor > 3**.
- Choque **não** pode conter pliometria nas semanas 1–2.
- Choque **não** pode ignorar **teto 12/16** de volume.
- **Regenerativo obrigatório** se dor/fadiga subir.
- **EVA > 5** sempre handoff/professor.
- **Regra mais conservadora vence.**

## 7. Contrato de saída proposto (ADITIVO)
**Não remover** (preservar exatamente): `cycle_name`, `objective`, `duration_weeks`, `workouts`,
`periodization_blocks`, `library_policy`, `validator`, `bnito_after_generation`, `schemaVersion`,
`engineMeta`, `validation`, `explanations`.

> Campos atuais de `PeriodizationBlock` a **manter**: `weeks`, `stimulus`, `methods[]`, `progression_rule`.

**Pode adicionar em `periodization_blocks` (todos opcionais):**
```ts
{
  block_id: string;
  weeks: number[]; // adicional ao "weeks: string" atual (NÃO substituir o existente)
  mesocycle_type: "base" | "desenvolvimento" | "intensificacao" | "polimento" | "regenerativo" | "retorno_gradual";
  microcycle_type: "ordinario" | "choque" | "regenerativo" | "estabilizador" | "avaliativo" | "tecnico";
  student_phase_label: string;
  goal: string;
  rir_target: string;
  volume_strategy: string;
  progression_strategy: string;
  safety_notes: string[];
}
```
**Pode adicionar em `workouts` (opcional):**
```ts
{ periodization_context?: { week: number; mesocycle_type: string; microcycle_type: string; student_phase_label: string } }
```
Mas: **não adicionar sem teste de contrato**, **não quebrar a renderização atual**, **não exigir UI nova** para funcionar.

## 8. Explicações BNITO (rule_ids possíveis)
`periodization_base_phase`, `periodization_accumulation_phase`, `periodization_intensification_phase`,
`periodization_deload_phase`, `periodization_shock_block_allowed`, `periodization_shock_block_blocked_by_level`,
`periodization_shock_block_blocked_by_pain`, `periodization_endurance_lower_body_adjustment`.

Cada explicação precisa: `rule_id`, `category` (`progressao` | `deload` | `volume`),
`source` (`objetivo` | `nivel` | `avaliacao_funcional` | `feedback_aluno` | `validador`), `action`, `reason`.

## 9. Testes necessários ANTES de implementar
- contrato antigo preservado (todos os campos atuais presentes);
- PDF/portal continuam renderizando;
- `periodization_blocks` contém `mesocycle_type`/`microcycle_type`;
- iniciante **nunca** recebe choque;
- dor > 3 bloqueia choque;
- EVA > 5 gera handoff;
- deload é regenerativo (volume −40/−50%, RIR 4–5);
- endurance ≥3× não recebe choque pesado de MMII;
- plano 6 semanas tem fases claras;
- **sem alteração com flag off**;
- JSON serializável.

## 10. Plano de implementação futura (NÃO executar agora)
- **Commit 1:** add periodization taxonomy constants.
- **Commit 2:** extend periodization block builder **aditivamente**.
- **Commit 3:** add periodization explanation rules.
- **Commit 4:** add PDF/portal contract tests.
- **Commit 5:** optional UI labels for student phase.

> **Não implementar agora — esperar ordem ATENA.**

## 11. Instrução para o outro Claude
- **Não** mexer direto no engine (`supabase/functions/_shared/prescription/**`).
- **Não** alterar a edge (`supabase/functions/ai-prescribe-workout/index.ts`).
- **Não** alterar o contrato PDF/portal (`src/lib/generatePDFs.ts`, `src/lib/publishStrengthPlan.ts`).
- **Não** renomear `periodization_blocks` nem remover campos existentes.
- **Não** implementar choque para iniciante.
- **Não** implementar choque com dor.
- **Não** mudar volume caps (12/16).
- Se precisar, **mandar as alterações para a ATENA antes** (gate).

## 12. Decisão
- **Periodization Extension = PLANNED**
- **Implementation = NOT_AUTHORIZED**
- **Edge Change = NOT_AUTHORIZED**
- **Deploy = NOT_AUTHORIZED**
- **Flag ON = NOT_AUTHORIZED**
- **Cutover = NOT_AUTHORIZED**

## 13. Guard de catálogo vivo (resumo da Fase 40)
Referência: `docs/prescription/bn-prescription-engine-v1-catalog-coverage-report.md` (existe).
- Total atual: **749** exercícios · baseline 447 · **delta +302** (novos, majoritariamente pliometria/Performance).
- Runtime do engine/adapters **considera todos** os exercícios recebidos no catálogo (**ACCEPT**).
- **534** exercícios fora do manifesto consolidado (215) → **precisa delta de curadoria**.
- Ressalva da Fase 40 (não desta ordem): edge `loadExerciseCatalog` tem `.limit(700)` < 749 (BLOCKER de borda).
- **Conexão com periodização:** os novos exercícios de pliometria/Performance reforçam por que o
  microciclo de **choque** precisa de gates fortes (nível/dor/semanas 1–2) antes de qualquer implementação.
