import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StatsCharts } from "./StatsCharts";

vi.mock("recharts", () => {
  const empty = () => null;
  return Object.fromEntries([
    "LineChart", "Line", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer",
    "BarChart", "Bar", "ComposedChart", "Area", "Legend", "Cell",
  ].map(name => [name, empty]));
});
vi.mock("./MuscleRadar", () => ({
  MuscleRadar: ({ muscleVolumes }: { muscleVolumes: { muscleGroup: string; volume: number }[] }) =>
    <div>{muscleVolumes.map(({ muscleGroup, volume }) => <span key={muscleGroup}>{muscleGroup} {volume} séries</span>)}</div>,
}));

it("renders snapshot muscle and the same mixed load used by staff without a current workout", async () => {
  render(<StatsCharts studentId="student" companyId="tenant" todayStr="2026-11-08" cycles={[]}
    sessions={[{
      id: "session", workout_id: "modern", session_date: "2026-11-08", status: "completed",
      total_volume: 1000, duration_seconds: 100, total_sets_completed: 1,
      exercises_summary: [{ muscleGroup: "Peitoral", sets: [{ weight: 100, reps: 10 }] }],
    }]}
    allLogs={[
      { id: "mirror", workout_id: "modern", session_date: "2026-11-08", completed: true, weight: 100, reps_done: 10 },
      { id: "legacy", workout_id: "legacy", session_date: "2026-11-02", completed: true, weight: 50, reps_done: 10 },
      { id: "future", workout_id: "legacy", session_date: "2026-11-09", completed: true, weight: 50, reps_done: 10 },
    ]}
  />);
  expect(screen.getByText("Peitoral 1 séries")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "7d" }));
  const tab = screen.getByRole("tab", { name: "Volume" });
  fireEvent.keyDown(tab, { key: "Enter" });
  expect(await screen.findByText("1.500", undefined, { timeout: 6000 })).toBeInTheDocument();
  expect(screen.getByText("1.500 kg")).toBeInTheDocument();
}, 20000);
