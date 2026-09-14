// B5/B6 — Lógica PURA e Deno-safe do shadow mode + feature flag do BN Prescription Engine.
// Mantida fora do index.ts da edge para ser testável no Vitest (a edge em si não roda no Vitest).
// NÃO faz I/O, NÃO altera resposta: só resolve a flag e monta o objeto de comparação para log.
import type { PrescriptionValidationResult, TrainingProgram } from "./types.ts";
import type { OutputAdapterResult } from "./adapters/types.ts";
import { exerciseGroupFactors } from "./volumeRules.ts";

export type EngineFlag = "off" | "shadow" | "on";

// Default seguro: undefined/vazio/desconhecido => "off".
export function resolveEngineFlag(raw: string | null | undefined): EngineFlag {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "shadow") return "shadow";
  if (v === "on") return "on";
  return "off";
}

export const SHADOW_LOG_SOURCE = "prescricao" as const;
export const SHADOW_LOG_KIND = "shadow_comparison" as const;

// Conta séries por grupo muscular a partir de um plano (engine OU plano atual da edge).
export function volumeByGroup(plan: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const workouts = Array.isArray((plan as any)?.workouts) ? (plan as any).workouts : [];
  for (const w of workouts) {
    const exs = Array.isArray(w?.exercises) ? w.exercises : [];
    for (const ex of exs) {
      const sets = Number(ex?.sets);
      if (!Number.isFinite(sets) || sets <= 0) continue;
      for (const [group, factor] of exerciseGroupFactors(ex || {})) {
        out[group] = (out[group] || 0) + sets * factor;
      }
    }
  }
  return out;
}

function splitLabel(plan: unknown): string {
  const p = plan as any;
  return String(p?.engineMeta?.split ?? p?.methodology_preset?.label ?? p?.weekly_structure ?? "").trim();
}
function workoutCount(plan: unknown): number {
  return Array.isArray((plan as any)?.workouts) ? (plan as any).workouts.length : 0;
}
function codesOf(list: unknown): string[] {
  return Array.isArray(list) ? list.map((x: any) => String(x?.code ?? "")).filter(Boolean) : [];
}
function exerciseIds(plan: unknown): string[] {
  const out: string[] = [];
  const workouts = Array.isArray((plan as any)?.workouts) ? (plan as any).workouts : [];
  for (const w of workouts) {
    for (const ex of (Array.isArray(w?.exercises) ? w.exercises : [])) {
      if (ex?.exercise_id) out.push(String(ex.exercise_id));
    }
  }
  return out;
}

export interface ShadowComparison {
  kind: typeof SHADOW_LOG_KIND;
  engine: "bn_prescription_engine_v1";
  mode: "shadow" | "on";
  old_engine_summary: Record<string, unknown>;
  new_engine_summary: Record<string, unknown>;
  diff: {
    split_changed: boolean;
    volume_by_group_delta: Record<string, number>;
    blockers_delta: number;
    warnings_delta: number;
    missing_exercises: string[];
    safe_alternative_unavailable_count: number;
    handoff_count: number;
  };
  timing_ms: number;
  created_by_edge: true;
}

// Monta a comparação shadow (antigo = plano atual da IA/fallback; novo = engine determinístico).
export function buildShadowComparison(args: {
  mode: "shadow" | "on";
  currentPlan: unknown;
  currentValidation: PrescriptionValidationResult | null | undefined;
  program: TrainingProgram;
  output: OutputAdapterResult;
  catalogIds: string[];
  timingMs: number;
}): ShadowComparison {
  const { currentPlan, currentValidation, program, output } = args;

  const oldVol = volumeByGroup(currentPlan);
  const newVol = volumeByGroup(program);
  const volDelta: Record<string, number> = {};
  for (const g of new Set([...Object.keys(oldVol), ...Object.keys(newVol)])) {
    volDelta[g] = (newVol[g] ?? 0) - (oldVol[g] ?? 0);
  }

  const oldBlockers = currentValidation?.blockers ?? [];
  const oldWarnings = currentValidation?.warnings ?? [];
  const newBlockers = output.blockers ?? [];
  const newWarnings = program.validation?.warnings ?? [];

  const catalogSet = new Set(args.catalogIds);
  const missing = exerciseIds(program).filter((id) => !catalogSet.has(id));
  const gaps = Array.isArray(program.library_policy?.gaps) ? program.library_policy.gaps : [];
  const safeAltCount =
    gaps.filter((g) => String(g).includes("safe_alternative_unavailable")).length +
    newBlockers.filter((b) => b.code === "safe_alternative_unavailable").length;

  return {
    kind: SHADOW_LOG_KIND,
    engine: "bn_prescription_engine_v1",
    mode: args.mode,
    old_engine_summary: {
      generated_by: (currentPlan as any)?.generated_by ?? null,
      split: splitLabel(currentPlan),
      workouts: workoutCount(currentPlan),
      status: currentValidation?.status ?? null,
      blockers: codesOf(oldBlockers),
      warnings: codesOf(oldWarnings),
      volume_by_group: oldVol,
    },
    new_engine_summary: {
      generated_by: program.generated_by ?? "bn_prescription_engine_v1",
      split: splitLabel(program),
      workouts: workoutCount(program),
      status: output.status,
      blocked: output.blocked,
      handoff: output.handoff,
      blockers: codesOf(newBlockers),
      warnings: codesOf(newWarnings),
      volume_by_group: newVol,
    },
    diff: {
      split_changed: splitLabel(currentPlan) !== splitLabel(program),
      volume_by_group_delta: volDelta,
      blockers_delta: newBlockers.length - oldBlockers.length,
      warnings_delta: newWarnings.length - oldWarnings.length,
      missing_exercises: missing,
      safe_alternative_unavailable_count: safeAltCount,
      handoff_count: output.handoff ? 1 : 0,
    },
    timing_ms: args.timingMs,
    created_by_edge: true,
  };
}
