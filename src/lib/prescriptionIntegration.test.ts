import { describe, expect, it } from "vitest";
import {
  buildBnitoOrchestrationPlan,
  buildPrescriptionIntegration,
} from "@/lib/prescriptionIntegration";

const anamnesis = {
  id: "anamnesis-id",
  objective: "Hipertrofia com retorno seguro à corrida",
  activity_level: "intermediario",
  training_modality: "musculação + corrida",
  days_per_week_strength: 3,
  days_per_week_cardio: 3,
  session_duration_min: 60,
  equipment: "Academia | Halteres, Polia alta/baixa",
  is_endurance_athlete: true,
  injuries: "Dor atual: joelho | DOR ARTICULAR AGORA (EVA 0-10): joelho 4",
};

const assessment = {
  id: "assessment-id",
  schema: "bn_functional_assessment_v1",
  assessment_contract_version: "2026-07-02.assessment-engine-v1",
  total_compensacoes: 1,
  ohs_compensations: [
    {
      key: "dynamic_valgus",
      compensacao: "Valgo dinâmico",
      presente: true,
      severidade: "moderada",
      implicacao_treino: "Priorizar controle do joelho e glúteo médio.",
    },
    {
      key: "butt_wink",
      compensacao: "Retroversão pélvica",
      presente: false,
      severidade: "ausente",
    },
  ],
  report_sections: { laudo: "Valgo dinâmico observado no OHS." },
  prescription_context: {
    contract: "bn_functional_assessment_v1",
    movement_restrictions: ["controlar valgo em movimentos dominantes de joelho"],
  },
};

describe("prescription integration", () => {
  it("joins structured anamnesis and deterministic assessment findings", () => {
    const integration = buildPrescriptionIntegration({ anamnese: anamnesis, assessment });

    expect(integration.sources).toMatchObject({
      has_anamnese: true,
      has_assessment: true,
      anamnese_id: "anamnesis-id",
      assessment_id: "assessment-id",
    });
    expect(integration.readiness.status).toBe("cautela");
    expect(integration.functional_findings.compensations.join(" ")).toContain("Valgo dinâmico");
    expect(integration.functional_findings.compensations.join(" ")).not.toContain("Retroversão pélvica");
    expect(integration.prescription_decision.exercise_selection_rules.join(" ")).toContain("gluteo");
    expect(integration.athlete_profile).toMatchObject({
      objective: "Hipertrofia com retorno seguro à corrida",
      strength_days: 3,
      cardio_days: 3,
      endurance_athlete: true,
    });
  });

  it("accepts a clear deterministic assessment with zero compensations", () => {
    const integration = buildPrescriptionIntegration({
      anamnese: { ...anamnesis, injuries: null },
      assessment: {
        id: "clear-assessment",
        schema: "bn_functional_assessment_v1",
        total_compensacoes: 0,
        ohs_compensations: [],
        report_sections: { laudo: "Sem compensações relevantes." },
      },
    });

    expect(integration.sources.has_assessment).toBe(true);
    expect(integration.readiness.missing_context).not.toContain("avaliacao_funcional");
    expect(integration.readiness.status).toBe("pronto");
  });

  it("marks missing assessment instead of pretending the Studio is ready", () => {
    const integration = buildPrescriptionIntegration({ anamnese: anamnesis, assessment: null });

    expect(integration.readiness.status).toBe("incompleto");
    expect(integration.readiness.missing_context).toEqual(["avaliacao_funcional"]);
  });

  it("passes the same integrated contract to BNITO's six-week orchestration", () => {
    const integration = buildPrescriptionIntegration({ anamnese: anamnesis, assessment });
    const orchestration = buildBnitoOrchestrationPlan(integration);

    expect(orchestration.duration_weeks).toBe(6);
    expect(orchestration.blocks).toHaveLength(3);
    expect(orchestration.source_summary).toMatch(/valgo/i);
    expect(orchestration.synchronization_rules)
      .toContain("Todas as IAs recebem o mesmo resultado integrado de anamnese + avaliacao funcional.");
  });
});
