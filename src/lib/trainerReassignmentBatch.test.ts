import { describe, expect, it, vi } from "vitest";
import {
  bulkTrainerOriginLabel,
  isBulkTrainerReassignmentEligible,
  pruneTrainerReassignmentSelection,
  reassignStudentsWithLimit,
  safeTrainerReassignmentFailureMessage,
  sameTrainerReassignmentScope,
  type TrainerReassignmentStudent,
  visibleSelectedTrainerReassignmentStudents,
} from "./trainerReassignmentBatch";

const student = (id: string, trainer = "trainer-a", status = "active"): TrainerReassignmentStudent => ({
  id,
  full_name: `Aluno ${id}`,
  status,
  assigned_trainer_id: trainer,
});

describe("bulk trainer reassignment", () => {
  it("selects only eligible non-inactive students", () => {
    expect(isBulkTrainerReassignmentEligible(student("1", "a", "active"))).toBe(true);
    expect(isBulkTrainerReassignmentEligible(student("2", "a", "awaiting_renewal"))).toBe(true);
    expect(isBulkTrainerReassignmentEligible(student("3", "a", "inactive"))).toBe(false);
  });

  it("detects stale wallet context before RPC calls", async () => {
    const rpc = vi.fn();
    const result = await reassignStudentsWithLimit({
      students: [student("1")],
      trainerId: "trainer-b",
      initialScope: { companyId: "company-a", trainerId: "trainer-a" },
      getCurrentScope: () => ({ companyId: "company-a", trainerId: "trainer-c" }),
      rpc,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.successes).toHaveLength(0);
    expect(result.failures[0].message).toBe("A carteira mudou durante a troca. Reabra a acao em massa e tente novamente.");
  });

  it("passes CAS expected trainer to every RPC and limits concurrency", async () => {
    let running = 0;
    let maxRunning = 0;
    const rpc = vi.fn(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { error: null };
    });
    const result = await reassignStudentsWithLimit({
      students: [student("1"), student("2"), student("3"), student("4")],
      trainerId: "trainer-b",
      initialScope: { companyId: "company-a", trainerId: "trainer-a" },
      getCurrentScope: () => ({ companyId: "company-a", trainerId: "trainer-a" }),
      rpc,
      concurrency: 2,
    });
    expect(result.successes).toHaveLength(4);
    expect(result.failures).toHaveLength(0);
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(rpc).toHaveBeenCalledWith({
      _student_id: "1",
      _trainer_id: "trainer-b",
      _expected_trainer_id: "trainer-a",
    });
  });

  it("reports partial failures without claiming total success", async () => {
    const rpc = vi.fn(async (args: { _student_id: string }) => (
      args._student_id === "2" ? { error: { message: "CAS stale" } } : { error: null }
    ));
    const result = await reassignStudentsWithLimit({
      students: [student("1"), student("2"), student("3")],
      trainerId: "trainer-b",
      initialScope: { companyId: "company-a", trainerId: "trainer-a" },
      getCurrentScope: () => ({ companyId: "company-a", trainerId: "trainer-a" }),
      rpc,
      concurrency: 3,
    });
    expect(result.successes.map((s) => s.id).sort()).toEqual(["1", "3"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].student.id).toBe("2");
    expect(result.failures[0].message).toBe("A atribuicao deste aluno mudou. Recarregue a carteira e tente novamente.");
  });

  it("summarizes homogeneous and mixed origins", () => {
    const name = (id: string | null | undefined) => (id === "trainer-a" ? "Professor A" : "Professor B");
    expect(bulkTrainerOriginLabel([student("1"), student("2")], name)).toBe("Professor A");
    expect(bulkTrainerOriginLabel([student("1"), student("2", "trainer-b")], name)).toBe("origens diferentes");
    expect(sameTrainerReassignmentScope({ companyId: "a", trainerId: "b" }, { companyId: "a", trainerId: "b" })).toBe(true);
  });

  it("keeps bulk operation restricted to the currently visible filtered selection", () => {
    const selectedIds = ["1", "2", "3"];
    const beforeFilterChange = [student("1"), student("2"), student("3", "trainer-a", "inactive")];
    const afterFilterChange = [student("2")];

    expect(visibleSelectedTrainerReassignmentStudents(beforeFilterChange, selectedIds).map((item) => item.id)).toEqual(["1", "2"]);
    expect(visibleSelectedTrainerReassignmentStudents(afterFilterChange, selectedIds).map((item) => item.id)).toEqual(["2"]);
    expect(pruneTrainerReassignmentSelection(selectedIds, afterFilterChange)).toEqual(["2"]);
  });

  it("maps internal RPC errors to safe user-facing messages", () => {
    expect(safeTrainerReassignmentFailureMessage("Student assignment changed; reload before reassigning")).toContain("atribuicao");
    expect(safeTrainerReassignmentFailureMessage("Destination trainer is not active in this company")).toContain("destino");
    expect(safeTrainerReassignmentFailureMessage("permission denied for table students")).toContain("acesso");
    expect(safeTrainerReassignmentFailureMessage("duplicate key value violates unique constraint")).toBe(
      "Nao foi possivel trocar este aluno agora. Recarregue a carteira e tente novamente.",
    );
  });
});
