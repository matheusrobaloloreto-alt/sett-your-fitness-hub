import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), navigate: vi.fn(), toast: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ role: "admin", companyId: "company-a", session: { user: { id: "staff" } } }),
}));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => ({ isViewingCompany: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useCompanyExperiencePolicy", () => ({
  useCompanyExperiencePolicy: () => ({ policy: { renewal_notice_days: 7 } }),
}));
vi.mock("@/components/BnitoFloatingAssistant", () => ({ BnitoContextButton: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));

import AdminAgenda from "./AdminAgenda";

const clearedAt = "2026-10-15T12:00:00Z";
let cycle: Record<string, unknown>;
let workouts: Record<string, unknown>[];
let writes: { filters: Record<string, unknown>; patch: Record<string, unknown> }[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(clearedAt));
  cycle = {
    id: "cycle-a", company_id: "company-a", cycle_number: 9, status: "active",
    start_date: "2026-10-13", end_date: "2026-11-23", prescribed_offline_at: null,
    prescription_cleared_at: null, superseded_at: null, superseded_by_cycle_id: null,
    enrollments: { student_id: "student-a", students: { full_name: "Fixture Student" } },
  };
  workouts = [];
  writes = [];
  mocks.toast.mockReset();
  mocks.navigate.mockReset();
  mocks.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    const checks: Array<(row: Record<string, unknown>) => boolean> = [];
    let patch: Record<string, unknown> | undefined;
    const run = () => {
      const rows = (table === "training_cycles" ? [cycle] : table === "workouts" ? workouts : [])
        .filter(row => checks.every(check => check(row)));
      if (patch) {
        writes.push({ filters, patch });
        rows.forEach(row => Object.assign(row, patch));
      }
      return { data: rows.map(row => ({ ...row })), error: null };
    };
    const query = {
      select: () => query, gte: () => query, lte: () => query,
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        checks.push(row => row[key] === value);
        return query;
      },
      is: (key: string, value: null) => {
        filters[key] = value;
        checks.push(row => row[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        checks.push(row => values.includes(row[key]));
        return query;
      },
      or: (expression: string) => {
        checks.push(row => row.company_id === null || expression.includes(`company_id.eq.${row.company_id}`));
        return query;
      },
      update: (value: Record<string, unknown>) => { patch = value; return query; },
      maybeSingle: async () => { const result = run(); return { ...result, data: result.data[0] ?? null }; },
      then: (resolve: (result: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return query;
  });
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Agenda offline prescription", () => {
  it("ignores a stale offline stamp on a cleared cycle and keeps the student route", async () => {
    Object.assign(cycle, { prescription_cleared_at: clearedAt, prescribed_offline_at: clearedAt });
    render(<AdminAgenda />);
    const student = await screen.findByRole("button", { name: "Fixture Student" });
    expect(screen.queryByRole("button", { name: "Feito" })).not.toBeInTheDocument();
    expect(screen.getByText("Prescrição removida")).toBeInTheDocument();
    fireEvent.click(student);
    expect(mocks.navigate).toHaveBeenCalledWith("/admin/students/student-a");
    expect(writes).toEqual([]);
  });

  it("refreshes after a concurrent clear without showing success or writing an offline stamp", async () => {
    render(<AdminAgenda />);
    const done = await screen.findByRole("button", { name: "Feito" });
    cycle.prescription_cleared_at = clearedAt;
    fireEvent.click(done);
    expect(await screen.findByText("Prescrição removida")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Feito" })).not.toBeInTheDocument();
    expect(cycle.prescribed_offline_at).toBeNull();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Não foi possível marcar o ciclo" }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Treino marcado como feito" }));
  });

  it.each([
    { start_date: "2026-10-16", end_date: "2026-11-26" },
    { end_date: "2026-11-25" },
    { prescribed_offline_at: clearedAt },
  ])("refreshes instead of overwriting a changed schedule or offline mark (%j)", async changed => {
    render(<AdminAgenda />);
    const done = await screen.findByRole("button", { name: "Feito" });
    Object.assign(cycle, changed);
    const before = { ...cycle };
    fireEvent.click(done);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Não foi possível marcar o ciclo" })));
    expect(cycle).toEqual(before);
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Treino marcado como feito" }));
  });

  it("confirms an ordinary offline mark even when only archived, superseded or foreign workouts exist", async () => {
    const row = {
      cycle_id: "cycle-a", company_id: "company-a", exercises: [{ name: "Squat" }],
      superseded_at: null, superseded_by_revision_id: null, student_profile_archive_event_id: null,
    };
    workouts = [
      { ...row, student_profile_archive_event_id: "archive" },
      { ...row, superseded_by_revision_id: "revision" },
      { ...row, superseded_at: clearedAt },
      { ...row, company_id: "company-b" },
    ];
    render(<AdminAgenda />);
    fireEvent.click(await screen.findByRole("button", { name: "Feito" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Treino marcado como feito" })));
    expect(writes).toEqual([{
      filters: { id: "cycle-a", company_id: "company-a", start_date: "2026-10-13", end_date: "2026-11-23", prescribed_offline_at: null, prescription_cleared_at: null, superseded_at: null, superseded_by_cycle_id: null },
      patch: { prescribed_offline_at: new Date(clearedAt).toISOString(), prescribed_offline_by: "staff" },
    }]);
    expect(screen.queryByRole("button", { name: "Feito" })).not.toBeInTheDocument();
  });

  it("counts a materialized legacy workout with null company in the verified cycle", async () => {
    workouts = [{
      cycle_id: "cycle-a", company_id: null, exercises: [{ name: "Squat" }],
      superseded_at: null, superseded_by_revision_id: null, student_profile_archive_event_id: null,
    }];
    render(<AdminAgenda />);
    await screen.findByRole("button", { name: "Fixture Student" });
    expect(screen.queryByRole("button", { name: "Feito" })).not.toBeInTheDocument();
    expect(writes).toEqual([]);
  });
});
