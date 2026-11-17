import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MuscleRadar } from "./MuscleRadar";

describe("MuscleRadar", () => {
  it("shows each recorded group when there are too few groups for a radar", () => {
    render(
      <MuscleRadar
        unit="sets"
        muscleVolumes={[
          { muscleGroup: "Peitoral", volume: 2 },
          { muscleGroup: "Quadríceps", volume: 1 },
        ]}
      />,
    );

    expect(within(screen.getByText("Peitoral").parentElement!).getByText("2 séries")).toBeVisible();
    expect(within(screen.getByText("Quadríceps").parentElement!).getByText("1 série")).toBeVisible();
  });

  it("shows the historical total for a single group", () => {
    render(<MuscleRadar unit="sets" muscleVolumes={[{ muscleGroup: "Dorsal", volume: 3 }]} />);

    expect(within(screen.getByText("Dorsal").parentElement!).getByText("3 séries")).toBeVisible();
  });
});
