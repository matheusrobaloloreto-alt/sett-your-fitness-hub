import { describe, expect, it } from "vitest";
import { readForIds } from "./pagedRead";
import { countStudentRecords, studentContractLabel } from "./studentRoster";

describe("shared SETT indicators", () => {
  it("counts registration status and retains the total across all statuses", () => {
    const counts = countStudentRecords(["active", "active", "inactive", "interested", "legacy"].map(status => ({ status })));
    expect(counts.total).toBe(5);
    expect(counts.byStatus.get("active")).toBe(2);
    expect(counts.byStatus.get("inactive")).toBe(1);
    expect(counts.byStatus.get("interested")).toBe(1);
    expect(counts.byStatus.get("legacy")).toBe(1);
  });

  it("distinguishes no current contract from unreadable contracts and missing metadata", () => {
    expect(studentContractLabel(undefined)).toBe("Contrato indisponível: falha de leitura");
    expect(studentContractLabel(null)).toBe("Sem plano contratado vigente");
    expect(studentContractLabel({ planId: null, planName: null })).toBe("Matrícula vigente sem plano vinculado");
    expect(studentContractLabel({ planId: "b", planName: null })).toBe("Plano contratado vigente: nome indisponível");
  });


  it("reads every page and limits the number of IDs in each request", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => String(index));
    const seen: number[][] = [];
    const data = await readForIds(ids, async (batch, from, to) => {
      seen.push([batch.length, from, to]);
      return { data: batch.length === 100 && from === 0 ? Array(500).fill("first") : ["last"], error: null };
    });
    expect(seen).toEqual([[100, 0, 499], [100, 500, 999], [1, 0, 499]]);
    expect(data).toHaveLength(502);
  });
});
