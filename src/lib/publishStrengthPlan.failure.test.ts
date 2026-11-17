import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  saveRevision: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/lib/workoutRevision", () => ({
  saveCycleWorkoutRevision: mocks.saveRevision,
}));

import { publishStrengthPlanToStudent } from "./publishStrengthPlan";

/**
 * A synthetic, in-memory Supabase query stub. No real project or credentials
 * are used by these tests. It only characterizes the client call sequence.
 */
function query(response: { data?: unknown; error: { message: string } | null }) {
  const builder = {
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    maybeSingle: async () => response,
    then: (
      resolve: (value: typeof response) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(response).then(resolve, reject),
  };
  return builder;
}

const studentId = "00000000-0000-4000-8000-000000000001";
const companyId = "00000000-0000-4000-8000-000000000002";
const cycleId = "00000000-0000-4000-8000-000000000003";
const bundleId = "00000000-0000-4000-8000-000000000004";
const enrollmentId = "00000000-0000-4000-8000-000000000005";

describe("publishStrengthPlanToStudent failure boundaries (#14)", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.saveRevision.mockReset();
  });

  it("characterizes a failure after the revision RPC but before the bundle link", async () => {
    const calls: string[] = [];

    mocks.saveRevision.mockImplementation(async () => {
      calls.push("revision-rpc-returned");
      return {
        revisionId: "00000000-0000-4000-8000-000000000006",
        workoutIds: ["00000000-0000-4000-8000-000000000007"],
      };
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "prescription_bundles") {
        return {
          update: (patch: Record<string, unknown>) => {
            if (patch.training_cycle_id) {
              calls.push("bundle-link-failed");
              return query({ error: { message: "synthetic-link-failure" } });
            }
            calls.push(patch.status === "failed" ? "bundle-marked-failed" : "bundle-prepared");
            return query({ error: null });
          },
        };
      }
      if (table === "training_cycles") {
        return {
          select: () => query({
            data: {
              id: cycleId,
              enrollment_id: enrollmentId,
              student_id: studentId,
              company_id: companyId,
              cycle_number: 1,
              start_date: "2026-01-01",
              end_date: "2099-12-31",
              status: "pending",
            },
            error: null,
          }),
        };
      }
      if (table === "workouts") {
        return { select: () => query({ data: [], error: null }) };
      }
      throw new Error(`Unexpected synthetic query: ${table}`);
    });

    await expect(publishStrengthPlanToStudent({
      plan: {
        duration_weeks: 6,
        workouts: [{
          name: "Synthetic workout",
          exercises: [{ exercise_name: "Synthetic exercise", sets: 2, reps: "10" }],
        }],
      },
      studentId,
      companyId,
      bundleId,
      targetCycleId: cycleId,
    })).rejects.toThrow("Treino publicado, mas falhou ao vincular o pacote");

    expect(mocks.saveRevision).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "bundle-prepared",
      "revision-rpc-returned",
      "bundle-link-failed",
      "bundle-marked-failed",
    ]);
  });
});
