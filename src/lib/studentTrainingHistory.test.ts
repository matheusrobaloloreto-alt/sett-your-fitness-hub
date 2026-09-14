import { describe, expect, it, vi } from "vitest";
import { loadStudentTrainingHistory, WORKOUT_LOG_COLUMNS } from "./studentTrainingHistory";

function backend(total = 1, fail = false) {
  const calls: { table: string; columns?: string; student?: string; offset?: number }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table } as typeof calls[number];
    calls.push(call);
    const query = {
      select(columns: string) { call.columns = columns; return query; },
      eq(field: string, student: string) { expect(field).toBe("student_id"); call.student = student; return query; },
      order(field: string) { expect(field).toBe("id"); return query; },
      async range(start: number, end: number) {
        call.offset = start;
        if (fail || call.columns?.includes("client_updated_at")) return { data: null, error: new Error("column does not exist") };
        return { data: table === "workout_sessions" ? [] : Array.from({ length: Math.max(0, Math.min(end - start + 1, total - start)) }, (_, i) => ({
          id: String(start + i), workout_id: "historical-revision", revision: 3, weight: 25, completed: true,
        })), error: null };
      },
    };
    return query;
  });
  return { client: { from } as unknown as Parameters<typeof loadStudentTrainingHistory>[0], calls };
}

describe("student training history production contract", () => {
  it("loads weights and revisions without querying the local-only draft timestamp", async () => {
    const { client, calls } = backend();
    expect(WORKOUT_LOG_COLUMNS.split(", ")).not.toContain("client_updated_at");
    const result = await loadStudentTrainingHistory(client, "student-1");
    expect(result.logs[0]).toMatchObject({ revision: 3, weight: 25, completed: true });
    expect(calls.every(call => call.student === "student-1")).toBe(true);
  });

  it("paginates past the API cap and keeps earlier workout revisions", async () => {
    const { client, calls } = backend(1101);
    const result = await loadStudentTrainingHistory(client, "student-1");
    expect(result.logs).toHaveLength(1101);
    expect(calls.filter(c => c.table === "workout_logs").map(c => c.offset)).toEqual([0, 500, 1000]);
  });

  it("surfaces query errors instead of replacing history with an empty success", async () => {
    await expect(loadStudentTrainingHistory(backend(1, true).client, "student-1")).rejects.toThrow("column does not exist");
  });
});
