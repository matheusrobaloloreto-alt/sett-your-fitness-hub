import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthleticClubProvider, AthleticClubStar } from "./AthleticClubStar";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  auth: { user: { id: "user-a" } as { id: string } | null, companyId: "company-a" as string | null, role: "admin" },
  master: { viewingCompany: null as { id: string } | null, isViewingCompany: false },
  rows: {
    plans: [] as Row[],
    enrollments: [] as Row[],
  },
  fromCalls: [] as string[],
  filters: [] as { table: string; column: string; value: unknown }[],
  inFilters: [] as { table: string; column: string; values: unknown[] }[],
  channels: [] as string[],
  removedChannels: [] as string[],
  writes: [] as string[],
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => state.auth,
}));

vi.mock("@/contexts/MasterContext", () => ({
  useMaster: () => state.master,
}));

function makeQuery(table: "plans" | "enrollments") {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push({ table, column, value });
      return query;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      state.inFilters.push({ table, column, values });
      return query;
    }),
    order: vi.fn(() => query),
    range: vi.fn((from: number, to: number) => {
      const rows = state.rows[table].filter((row) => {
        const tableFilters = state.filters.filter((filter) => filter.table === table);
        const tableInFilters = state.inFilters.filter((filter) => filter.table === table);
        return tableFilters.every((filter) => row[filter.column] === filter.value)
          && tableInFilters.every((filter) => filter.values.includes(row[filter.column]));
      });
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    }),
    insert: vi.fn(() => {
      state.writes.push(`${table}.insert`);
      throw new Error("AthleticClubProvider must not write");
    }),
    update: vi.fn(() => {
      state.writes.push(`${table}.update`);
      throw new Error("AthleticClubProvider must not write");
    }),
    upsert: vi.fn(() => {
      state.writes.push(`${table}.upsert`);
      throw new Error("AthleticClubProvider must not write");
    }),
    delete: vi.fn(() => {
      state.writes.push(`${table}.delete`);
      throw new Error("AthleticClubProvider must not write");
    }),
  };
  return query;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: "plans" | "enrollments") => {
      state.fromCalls.push(table);
      return makeQuery(table);
    }),
    channel: vi.fn((name: string) => {
      state.channels.push(name);
      const channel = {
        name,
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
      };
      return channel;
    }),
    removeChannel: vi.fn((channel: { name: string }) => {
      state.removedChannels.push(channel.name);
      return Promise.resolve();
    }),
    rpc: vi.fn(() => {
      state.writes.push("rpc");
      throw new Error("AthleticClubProvider must not call rpc");
    }),
  },
}));

function renderClub(children: React.ReactNode, companyId?: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <AthleticClubProvider companyId={companyId}>{children}</AthleticClubProvider>
    </QueryClientProvider>,
  );

  return { ...view, queryClient };
}

describe("AthleticClubProvider and AthleticClubStar", () => {
  beforeEach(() => {
    state.auth = { user: { id: "user-a" }, companyId: "company-a", role: "admin" };
    state.master = { viewingCompany: null, isViewingCompany: false };
    state.rows.plans = [
      { id: "club-a", company_id: "company-a", name: "Athletic Club Iniciante" },
      { id: "bn-pro-a", company_id: "company-a", name: "BN PRO" },
      { id: "club-b", company_id: "company-b", name: "Athletic Club Semestral" },
    ];
    state.rows.enrollments = [
      { id: "a-older", company_id: "company-a", student_id: "student-a", plan_id: "bn-pro-a", status: "active", created_at: "2026-08-01T00:00:00Z" },
      { id: "a-newer", company_id: "company-a", student_id: "student-a", plan_id: "club-a", status: "active", created_at: "2026-09-01T00:00:00Z" },
      { id: "a-duplicate", company_id: "company-a", student_id: "student-a", plan_id: "club-a", status: "active", created_at: "2026-09-01T00:00:00Z" },
      { id: "a-bn", company_id: "company-a", student_id: "student-bn", plan_id: "bn-pro-a", status: "active", created_at: "2026-09-01T00:00:00Z" },
      { id: "a-canceled", company_id: "company-a", student_id: "student-canceled", plan_id: "club-a", status: "canceled", created_at: "2026-09-01T00:00:00Z" },
      { id: "b-active", company_id: "company-b", student_id: "student-b", plan_id: "club-b", status: "active", created_at: "2026-09-01T00:00:00Z" },
    ];
    state.fromCalls = [];
    state.filters = [];
    state.inFilters = [];
    state.channels = [];
    state.removedChannels = [];
    state.writes = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("loads tenant-scoped memberships, renders one derived badge, and performs no writes", async () => {
    renderClub(
      <>
        <AthleticClubStar studentId="student-a" companyId="company-a" />
        <AthleticClubStar studentId="student-bn" companyId="company-a" />
        <AthleticClubStar studentId="student-canceled" companyId="company-a" />
        <AthleticClubStar studentId="student-b" companyId="company-b" />
      </>,
    );

    expect(await screen.findByLabelText("Athletic Club")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Athletic Club")).toHaveLength(1);
    expect(screen.queryByTitle("BN PRO")).not.toBeInTheDocument();
    expect(state.filters).toContainEqual({ table: "plans", column: "company_id", value: "company-a" });
    expect(state.filters).toContainEqual({ table: "enrollments", column: "company_id", value: "company-a" });
    expect(state.inFilters).toContainEqual({
      table: "enrollments",
      column: "status",
      values: ["active", "awaiting_training", "awaiting_renewal"],
    });
    expect(state.writes).toEqual([]);
  });

  it("fails closed without an authenticated user or company", async () => {
    state.auth = { user: null, companyId: "company-a", role: "admin" };

    renderClub(<AthleticClubStar studentId="student-a" companyId="company-a" />);

    expect(screen.queryByLabelText("Athletic Club")).not.toBeInTheDocument();
    await waitFor(() => expect(state.fromCalls).toEqual([]));
    expect(state.channels).toEqual([]);
  });

  it("drops stale badges when auth switches to another tenant", async () => {
    const { rerender, queryClient } = renderClub(<AthleticClubStar studentId="student-a" companyId="company-a" />);

    expect(await screen.findByLabelText("Athletic Club")).toBeInTheDocument();

    state.auth = { user: { id: "user-b" }, companyId: "company-b", role: "admin" };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AthleticClubProvider>
          <AthleticClubStar studentId="student-a" companyId="company-a" />
        </AthleticClubProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByLabelText("Athletic Club")).not.toBeInTheDocument());
    expect(state.channels.some((name) => name.includes("user-b:company-b"))).toBe(true);
  });

  it("uses master viewing company only when the master has selected a tenant", async () => {
    state.auth = { user: { id: "master" }, companyId: null, role: "master" };
    state.master = { viewingCompany: null, isViewingCompany: false };

    const { rerender, queryClient } = renderClub(<AthleticClubStar studentId="student-b" companyId="company-b" />);

    expect(screen.queryByLabelText("Athletic Club")).not.toBeInTheDocument();
    expect(state.fromCalls).toEqual([]);

    state.master = { viewingCompany: { id: "company-b" }, isViewingCompany: true };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AthleticClubProvider>
          <AthleticClubStar studentId="student-b" companyId="company-b" />
        </AthleticClubProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText("Athletic Club")).toBeInTheDocument();
    expect(state.filters).toContainEqual({ table: "plans", column: "company_id", value: "company-b" });
  });
});
