# BN Prescription Engine v1 — Deno Static Guard Report

Generated at: 2026-07-30T01:37:26.920Z

Status: PASS

Checks: 36/36 pass

| File | Check | Result | Detail |
|---|---|---:|---|
| `supabase/functions/ai-prescribe-workout/index.ts` | `file_exists` | PASS | OK |
| `supabase/functions/_shared/prescription/engine.ts` | `file_exists` | PASS | OK |
| `supabase/functions/_shared/prescription/engine.ts` | `no_path_alias` | PASS | Sem import @/ em _shared. |
| `supabase/functions/_shared/prescription/engine.ts` | `no_react_dom_browser` | PASS | Sem APIs DOM/browser. |
| `supabase/functions/_shared/prescription/engine.ts` | `no_node_or_npm_import` | PASS | Sem imports Node/npm/http/React. |
| `supabase/functions/_shared/prescription/engine.ts` | `relative_imports_have_ts` | PASS | Imports relativos Deno-safe com .ts. |
| `supabase/functions/_shared/prescription/shadow.ts` | `file_exists` | PASS | OK |
| `supabase/functions/_shared/prescription/shadow.ts` | `no_path_alias` | PASS | Sem import @/ em _shared. |
| `supabase/functions/_shared/prescription/shadow.ts` | `no_react_dom_browser` | PASS | Sem APIs DOM/browser. |
| `supabase/functions/_shared/prescription/shadow.ts` | `no_node_or_npm_import` | PASS | Sem imports Node/npm/http/React. |
| `supabase/functions/_shared/prescription/shadow.ts` | `relative_imports_have_ts` | PASS | Imports relativos Deno-safe com .ts. |
| `supabase/functions/_shared/prescription/adapters/inputAdapter.ts` | `file_exists` | PASS | OK |
| `supabase/functions/_shared/prescription/adapters/inputAdapter.ts` | `no_path_alias` | PASS | Sem import @/ em _shared. |
| `supabase/functions/_shared/prescription/adapters/inputAdapter.ts` | `no_react_dom_browser` | PASS | Sem APIs DOM/browser. |
| `supabase/functions/_shared/prescription/adapters/inputAdapter.ts` | `no_node_or_npm_import` | PASS | Sem imports Node/npm/http/React. |
| `supabase/functions/_shared/prescription/adapters/inputAdapter.ts` | `relative_imports_have_ts` | PASS | Imports relativos Deno-safe com .ts. |
| `supabase/functions/_shared/prescription/adapters/catalogAdapter.ts` | `file_exists` | PASS | OK |
| `supabase/functions/_shared/prescription/adapters/catalogAdapter.ts` | `no_path_alias` | PASS | Sem import @/ em _shared. |
| `supabase/functions/_shared/prescription/adapters/catalogAdapter.ts` | `no_react_dom_browser` | PASS | Sem APIs DOM/browser. |
| `supabase/functions/_shared/prescription/adapters/catalogAdapter.ts` | `no_node_or_npm_import` | PASS | Sem imports Node/npm/http/React. |
| `supabase/functions/_shared/prescription/adapters/catalogAdapter.ts` | `relative_imports_have_ts` | PASS | Imports relativos Deno-safe com .ts. |
| `supabase/functions/_shared/prescription/adapters/outputAdapter.ts` | `file_exists` | PASS | OK |
| `supabase/functions/_shared/prescription/adapters/outputAdapter.ts` | `no_path_alias` | PASS | Sem import @/ em _shared. |
| `supabase/functions/_shared/prescription/adapters/outputAdapter.ts` | `no_react_dom_browser` | PASS | Sem APIs DOM/browser. |
| `supabase/functions/_shared/prescription/adapters/outputAdapter.ts` | `no_node_or_npm_import` | PASS | Sem imports Node/npm/http/React. |
| `supabase/functions/_shared/prescription/adapters/outputAdapter.ts` | `relative_imports_have_ts` | PASS | Imports relativos Deno-safe com .ts. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `feature_flag_default_off` | PASS | PRESCRIPTION_ENGINE_V1 default off. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `shadow_guarded_by_flag` | PASS | Shadow só roda atrás de shadow/on. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `no_prescricao_shadow_source` | PASS | source prescricao_shadow ausente. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `shadow_kind_payload` | PASS | payload.kind shadow_comparison presente. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `catalog_pagination` | PASS | loadExerciseCatalog paginado via range e parada por página incompleta. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `no_limit_700` | PASS | Sem .limit(700) em ai-prescribe-workout. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `fallback_preserved` | PASS | buildEmergencyFallbackPlan preservado. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `anthropic_preserved` | PASS | Anthropic preservado. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `response_contract_id_plan` | PASS | Resposta padrão { id, plan }. |
| `supabase/functions/ai-prescribe-workout/index.ts` | `deterministic_primary_with_legacy_fallback` | PASS | Engine v1 é o caminho principal e o fallback legado permanece protegido por catch. |

> Static guard only. It does not run Deno typechecking.
