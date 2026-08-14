import { describe, expect, it, vi } from "vitest";
import {
  consumeValidatedAnamnesisInvite,
  validateInviteAnamnesis,
} from "../../supabase/functions/_shared/public-anamnesis-validation";

const completePayload = {
  objective: "saude",
  gender: "M",
  modalities: ["Musculação / Funcional"],
  requested_services: ["strength", "running"],
  profession: "Rotina de escritório",
  sleep_hours: "6h - 8h",
  restorative_sleep: true,
  perceived_recovery: "7",
  aware_of_trilogy: true,
  training_days: "segunda musculação; terça corrida",
  session_duration: "de 45 a 60 minutos",
  training_location: "Academia de Rede",
  sport_goal: "Correr 10 km",
  endurance_session_duration: "de 45 a 60 minutos",
  run_where: "rua",
  diseases: "nenhuma",
  medications: "nenhum",
  injuries: "nenhuma",
  current_pain: "nenhuma",
  clin_cardiac: "nao",
  clin_chest_pain: "nao",
  clin_surgery: "nao",
  clin_pregnant: "na",
  clin_smoke: "nao",
  clin_acute: "nao",
  eva_tornozelo: "0",
  eva_joelho: "0",
  eva_quadril: "0",
  eva_lombar: "0",
  eva_ombro: "0",
  feel_in_3_months: "Mais disposto",
  biggest_obstacle: "Tempo",
  commits_communication: true,
  preferred_contact_channel: "whatsapp_message",
  preferred_contact_period: "evening",
  custom_answers: {},
};

describe("server-side public anamnesis validation", () => {
  it("rejects a direct partial call with 422 before consuming the invite", async () => {
    const consume = vi.fn().mockResolvedValue({ ok: true });

    await expect(consumeValidatedAnamnesisInvite(
      { objective: "saude" },
      [],
      consume,
    )).rejects.toMatchObject({ status: 422 });
    expect(consume).not.toHaveBeenCalled();
  });

  it("rejects a missing required custom answer and leaves consume untouched", async () => {
    const consume = vi.fn().mockResolvedValue({ ok: true });
    const required = [{ id: "field-1", label: "Restrição do treinador", is_required: true }];

    expect(validateInviteAnamnesis(completePayload, required)).toContain("Restrição do treinador");
    await expect(consumeValidatedAnamnesisInvite(completePayload, required, consume))
      .rejects.toMatchObject({ status: 422 });
    expect(consume).not.toHaveBeenCalled();
  });

  it("accepts the complete conditional contract and consumes once", async () => {
    const consume = vi.fn().mockResolvedValue({ ok: true });
    const required = [{ id: "field-1", label: "Restrição do treinador", is_required: true }];
    const payload = {
      ...completePayload,
      custom_answers: { "field-1": { label: "Restrição do treinador", value: "Nenhuma" } },
    };

    await expect(consumeValidatedAnamnesisInvite(payload, required, consume))
      .resolves.toEqual({ ok: true });
    expect(consume).toHaveBeenCalledTimes(1);
  });
});
