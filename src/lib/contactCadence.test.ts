import { describe, expect, it } from "vitest";
import { cadenceDisplayName, cadenceTone, formatCadence, type CadenceRow } from "./contactCadence";

const row = (patch: Partial<CadenceRow> = {}): CadenceRow => ({
  chat_id: "00000000-0000-0000-0000-000000000001",
  contact_name: "Contato",
  student_id: null,
  student_name: null,
  student_status: null,
  kind: "lead",
  last_inbound_at: "2026-07-29T12:00:00.000Z",
  hours_since: 1,
  ...patch,
});

describe("contact cadence", () => {
  it("formata horas e dias nos limites da interface", () => {
    expect(formatCadence(0.9)).toBe("<1h");
    expect(formatCadence(23.9)).toBe("23h");
    expect(formatCadence(24)).toBe("1 dia");
    expect(formatCadence(168)).toBe("7 dias");
  });

  it("normaliza valores inválidos ou negativos", () => {
    expect(formatCadence(-10)).toBe("<1h");
    expect(formatCadence(Number.NaN)).toBe("<1h");
    expect(cadenceTone(Number.POSITIVE_INFINITY)).toBe("ok");
  });

  it("aplica os limiares verde, âmbar e vermelho", () => {
    expect(cadenceTone(23.99)).toBe("ok");
    expect(cadenceTone(24)).toBe("warn");
    expect(cadenceTone(71.99)).toBe("warn");
    expect(cadenceTone(72)).toBe("late");
  });

  it("prioriza o nome do aluno e mantém fallback legível", () => {
    expect(cadenceDisplayName(row({ student_name: "Aluno", contact_name: "Contato" }))).toBe("Aluno");
    expect(cadenceDisplayName(row({ contact_name: "Contato" }))).toBe("Contato");
    expect(cadenceDisplayName(row({ contact_name: null }))).toBe("Contato sem nome");
  });
});
