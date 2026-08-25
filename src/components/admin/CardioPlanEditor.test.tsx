import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardioPlanEditor } from "@/components/admin/CardioPlanEditor";

const cardioPlan = {
  plan_name: "Plano BN de corrida",
  sport: "corrida",
  goal: "5 km",
  weeks: [{
    week_number: 1,
    focus: "Base aeróbica",
    sessions: [{
      day: "Segunda",
      type: "base_z2",
      title: "Treino leve",
      zone: "Z2",
      fc_target: "FC 130–145 bpm",
      warmup_min: 10,
      main_min: 30,
      cooldown_min: 5,
      total_min: 45,
      distance_km: 5,
      intervals: null,
      notes: "Conversável",
    }],
  }],
};

describe("CardioPlanEditor", () => {
  it("edits a generated session and saves the resulting draft", () => {
    let current = cardioPlan;
    const onChange = vi.fn((next) => { current = next; });
    const onSave = vi.fn();
    const { rerender } = render(
      <CardioPlanEditor modality="corrida" plan={current} onChange={onChange} onSave={onSave} />,
    );

    fireEvent.change(screen.getByLabelText("Título da sessão 1 da semana 1"), {
      target: { value: "Rodagem regenerativa" },
    });
    expect(onChange).toHaveBeenCalled();
    rerender(<CardioPlanEditor modality="corrida" plan={current} onChange={onChange} onSave={onSave} />);
    expect(screen.getByLabelText("Título da sessão 1 da semana 1")).toHaveValue("Rodagem regenerativa");

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações de corrida" }));
    expect(onSave).toHaveBeenCalledWith(current);
  });

  it("recalculates weekly volume and never removes the final session", () => {
    let current = {
      ...cardioPlan,
      weeks: [{ ...cardioPlan.weeks[0], volume_km: 99, volume_hours: 99 }],
    };
    const onChange = vi.fn((next) => { current = next; });
    const { rerender } = render(
      <CardioPlanEditor modality="corrida" plan={current} onChange={onChange} onSave={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Dist. km"), { target: { value: "8.5" } });
    expect(current.weeks[0].volume_km).toBe(8.5);
    rerender(<CardioPlanEditor modality="corrida" plan={current} onChange={onChange} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Principal"), { target: { value: "60" } });
    expect(current.weeks[0].volume_hours).toBe(1.3);
    rerender(<CardioPlanEditor modality="corrida" plan={current} onChange={onChange} onSave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Remover sessão 1 da semana 1" })).toBeDisabled();
  });
});
