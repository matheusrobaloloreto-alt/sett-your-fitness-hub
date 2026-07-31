import { describe, it, expect } from "vitest";
import { deriveStudentStatus, riskReasons } from "./studentStatus";

describe("deriveStudentStatus", () => {
  it("mantém interessado como lead antes do onboarding", () => {
    expect(deriveStudentStatus({ baseStatus: "interested", hasAnamnesis: false })).toBe("lead");
  });

  it("inativo quando baseStatus é inactive (precede tudo)", () => {
    expect(deriveStudentStatus({ baseStatus: "inactive", hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: true })).toBe("inativo");
  });

  it("anamnese_pendente quando falta anamnese", () => {
    expect(deriveStudentStatus({ hasAnamnesis: false })).toBe("anamnese_pendente");
  });

  it("avaliacao_pendente quando tem anamnese mas não avaliação", () => {
    expect(deriveStudentStatus({ hasAnamnesis: true, hasAssessment: false })).toBe("avaliacao_pendente");
  });

  it("aguardando_prescricao quando tem anamnese+avaliação mas não treino ativo", () => {
    expect(deriveStudentStatus({ hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: false })).toBe("aguardando_prescricao");
  });

  it("ativo no caminho feliz", () => {
    expect(deriveStudentStatus({
      hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: true,
      daysSinceLastTraining: 2, paymentOverdue: false, cycleEndsInDays: 20,
    })).toBe("ativo");
  });

  it("renovacao quando ciclo vencido", () => {
    expect(deriveStudentStatus({
      hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: true, cycleEndsInDays: -1,
    })).toBe("renovacao");
  });

  it("renovacao quando baseStatus é awaiting_renewal", () => {
    expect(deriveStudentStatus({
      baseStatus: "awaiting_renewal", hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: true, cycleEndsInDays: 10,
    })).toBe("renovacao");
  });

  it("risco quando pagamento atrasado (aluno ativo)", () => {
    expect(deriveStudentStatus({
      hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: true, paymentOverdue: true, cycleEndsInDays: 20,
    })).toBe("risco");
  });

  it("risco quando sem treinar há >= 10 dias", () => {
    expect(deriveStudentStatus({
      hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: true, daysSinceLastTraining: 12, cycleEndsInDays: 20,
    })).toBe("risco");
  });
});

describe("riskReasons", () => {
  it("lista os motivos acumulados", () => {
    const reasons = riskReasons({
      paymentOverdue: true, daysSinceLastTraining: 14, cycleEndsInDays: 0, hasActiveWorkout: false,
    });
    expect(reasons).toContain("Pagamento em atraso");
    expect(reasons.some((r) => r.includes("14 dias"))).toBe(true);
    expect(reasons).toContain("Ciclo vencido");
    expect(reasons).toContain("Sem treino ativo");
  });

  it("sem motivos quando tudo ok", () => {
    expect(riskReasons({ paymentOverdue: false, daysSinceLastTraining: 1, cycleEndsInDays: 30, hasActiveWorkout: true })).toHaveLength(0);
  });
});
