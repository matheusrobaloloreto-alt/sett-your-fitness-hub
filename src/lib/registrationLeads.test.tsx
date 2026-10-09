import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegistrationManager from "@/pages/admin/RegistrationManager";

const db = vi.hoisted(() => ({
  students: [] as Array<Record<string, unknown>>,
  leads: [] as Array<Record<string, unknown>>,
  auxiliary: {} as Record<string, Array<Record<string, unknown>>>,
  reads: [] as Array<{
    table: string;
    studentIds: unknown[];
    range: [number, number] | null;
    orders: Array<{ column: string; ascending: boolean }>;
  }>,
  readError: null as { table: string; studentId: string; message: string; from?: number } | null,
  rpc: vi.fn(),
  invoke: vi.fn(),
  directWrite: vi.fn(),
  openChat: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ companyId: "company-1", role: "admin", user: null }) }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/AthleticClubStar", () => ({ AthleticClubStar: () => null }));
vi.mock("@/lib/studentChat", () => ({ createPlansLink: vi.fn(), openStudentChat: db.openChat }));
vi.mock("sonner", () => ({ toast: db.toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: db.rpc,
    functions: { invoke: db.invoke },
    from(table: string) {
      let rows = table === "students" ? [...db.students] : table === "leads" ? [...db.leads] : [...(db.auxiliary[table] || [])];
      if (table === "companies") rows = [{ id: "company-1", slug: "fixture-company" }];
      let studentIds: unknown[] = [];
      let range: [number, number] | null = null;
      let limit: number | null = null;
      const orders: Array<{ column: string; ascending: boolean }> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return query; },
        is: (column: string, value: unknown) => { rows = rows.filter((row) => (row[column] ?? null) === value); return query; },
        in: (column: string, values: unknown[]) => {
          if (column === "student_id") studentIds = [...values];
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        order: (column: string, options: { ascending: boolean }) => { orders.push({ column, ascending: options.ascending }); return query; },
        limit: (count: number) => { limit = count; return query; },
        range: (from: number, to: number) => { range = [from, to]; return query; },
        update: db.directWrite,
        delete: db.directWrite,
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          db.reads.push({ table, studentIds, range, orders });
          const failure = db.readError;
          if (failure?.table === table && studentIds.includes(failure.studentId)
            && (failure.from === undefined || failure.from === range?.[0])) {
            return Promise.resolve({ data: null, error: { message: failure.message } }).then(resolve);
          }
          rows.sort((a, b) => {
            for (const { column, ascending } of orders) {
              const comparison = String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
              if (comparison) return ascending ? comparison : -comparison;
            }
            return 0;
          });
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (limit !== null) rows = rows.slice(0, limit);
          return Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

function profile(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    company_id: "company-1",
    full_name: `Perfil ${id}`,
    phone: null,
    status: "interested",
    sales_stage: "interested",
    stage: "interested",
    created_at: "2025-01-01T10:00:00Z",
    updated_at: "2025-01-01T10:00:00Z",
    pre_registration_answers: { objective: "saude" },
    ...overrides,
  };
}

function card(name: string) {
  const region = screen.getByRole("region", { name: "Esteira de fechamento com rolagem horizontal" });
  const element = within(region).getByText(name).closest("[draggable]");
  if (!element) throw new Error(`Cartão ausente: ${name}`);
  return within(element as HTMLElement);
}

async function loaded(name: string) {
  await waitFor(() => expect(card(name).getByText(name)).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  db.students = [];
  db.leads = [];
  db.auxiliary = {};
  db.reads = [];
  db.readError = null;
  db.rpc.mockImplementation(async (_name, args) => {
    const rows = args._entity_type === "lead" ? db.leads : db.students;
    const row = rows.find((item) => item.id === args._record_id && item.company_id === args._company_id);
    if (!row) return { data: null, error: { message: "Perfil não encontrado." } };
    row[args._entity_type === "lead" ? "stage" : "sales_stage"] = args._target_stage;
    return { data: { id: row.id, stage: args._target_stage }, error: null };
  });
});

describe("consultas auxiliares do funil", () => {
  const tables = ["student_funnel_events", "student_anamneses", "functional_assessments"];

  function seedPaginatedPipeline() {
    db.students = Array.from({ length: 201 }, (_, index) => profile(`student-${String(index).padStart(3, "0")}`, {
      status: index >= 199 ? "inactive" : "active",
      sales_stage: index >= 199 ? "lost" : "active",
    }));
    for (const table of tables) {
      db.auxiliary[table] = db.students.map((student) => ({
        id: `z-${student.id}`,
        student_id: student.id,
        company_id: "company-1",
        created_at: "2025-01-01T10:00:00Z",
        event_type: "follow_up",
        status: "completed",
      }));
      db.auxiliary[table].push(...Array.from({ length: 161 }, (_, index) => ({
        id: `a-${String(index).padStart(3, "0")}`,
        student_id: "student-200",
        company_id: "company-1",
        created_at: "2026-01-01T10:00:00Z",
        event_type: index === 160 ? "latest_tied" : "older_tied",
        status: "completed",
      })));
    }
  }

  it("carrega 201 perfis em lotes de até 100 IDs e pagina todas as consultas auxiliares com ordem estável", async () => {
    seedPaginatedPipeline();
    render(<RegistrationManager />);
    await loaded("Perfil student-199");

    for (const table of tables) {
      const reads = db.reads.filter((read) => read.table === table);
      const batches = new Map(reads.map((read) => [read.studentIds.join(","), read.studentIds]));
      expect([...batches.values()].map((batch) => batch.length).sort((a, b) => a - b)).toEqual([1, 100, 100]);
      expect(new Set([...batches.values()].flat()).size).toBe(201);
      expect(reads.some((read) => read.range?.[0] === 160)).toBe(true);
      expect(reads.every((read) => read.range && read.range[1] - read.range[0] === 159)).toBe(true);
      const expectedOrders = table === "student_funnel_events"
        ? [{ column: "created_at", ascending: false }, { column: "id", ascending: false }]
        : [{ column: "id", ascending: true }];
      for (const read of reads) expect(read.orders).toEqual(expectedOrders);
    }
    const student = card("Perfil student-199");
    expect(student.getByText("Anamnese").parentElement).toHaveTextContent("ok");
    expect(student.getByText("Avaliacao").parentElement).toHaveTextContent("ok");
    expect(student.getByText("Ultimo evento: follow up")).toBeInTheDocument();
    expect(card("Perfil student-200").getByText("Ultimo evento: latest tied")).toBeInTheDocument();
  });

  it.each(tables)("propaga falha de página auxiliar em %s sem publicar indicadores parciais", async (table) => {
    seedPaginatedPipeline();
    db.readError = { table, studentId: "student-200", from: 160, message: `Falha auxiliar: ${table}` };
    render(<RegistrationManager />);

    expect(await screen.findByRole("alert")).toHaveTextContent(`Falha auxiliar: ${table}`);
    expect(screen.queryByText("Perfil student-199")).not.toBeInTheDocument();
    expect(screen.queryByText("Perfil student-200")).not.toBeInTheDocument();
    expect(db.reads.some((read) => read.table === table && read.range?.[0] === 160)).toBe(true);
  });

  it("remove cartões anteriores quando a recarga falha em vez de manter indicadores desatualizados", async () => {
    db.students = [profile("fixture")];
    render(<RegistrationManager />);
    await loaded("Perfil fixture");
    db.readError = { table: "student_anamneses", studentId: "fixture", message: "Anamneses indisponíveis." };

    fireEvent.click(card("Perfil fixture").getByRole("button", { name: "Transformar em lead" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Anamneses indisponíveis.");
    expect(screen.queryByText("Perfil fixture")).not.toBeInTheDocument();
    expect(db.students[0].sales_stage).toBe("lost");
    expect(db.directWrite).not.toHaveBeenCalled();
  });
});

afterEach(cleanup);

describe("cadastros preservados em Leads", () => {
  it.each(["lead", "student"])("transforma %s em lead, persiste após recarga e retoma contato sem envio", async (entityType) => {
    const row = profile("fixture", entityType === "student" ? { status: "pending", sales_stage: "payment_pending" } : {});
    db[entityType === "lead" ? "leads" : "students"] = [row];
    const view = render(<RegistrationManager />);
    await loaded("Perfil fixture");

    fireEvent.click(card("Perfil fixture").getByRole("button", { name: "Transformar em lead" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Leads (1)" })).toHaveClass("bg-primary"));
    expect(db.rpc).toHaveBeenCalledWith("set_registration_lead_stage", {
      _company_id: "company-1", _entity_type: entityType, _record_id: "fixture",
      _expected_stage: entityType === "lead" ? "interested" : "payment_pending", _target_stage: "lost",
    });
    expect(row.status).toBe(entityType === "lead" ? "interested" : "pending");
    expect(row.pre_registration_answers).toEqual({ objective: "saude" });
    expect(card("Perfil fixture").queryByRole("button", { name: "Transformar em lead" })).not.toBeInTheDocument();

    view.unmount();
    render(<RegistrationManager />);
    await loaded("Perfil fixture");
    expect(screen.getByRole("button", { name: "Leads (1)" })).toBeInTheDocument();
    fireEvent.click(card("Perfil fixture").getByRole("button", { name: "Retomar contato" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Contato (1)" })).toHaveClass("bg-primary"));
    expect(db.rpc).toHaveBeenLastCalledWith("set_registration_lead_stage", expect.objectContaining({
      _expected_stage: "lost", _target_stage: "contacted", _entity_type: entityType,
    }));
    expect(db.directWrite).not.toHaveBeenCalled();
    expect(db.invoke).not.toHaveBeenCalled();
    expect(db.openChat).not.toHaveBeenCalled();
  });

  it("exibe perfis arquivados históricos e leads antigos sem confundi-los com novos", async () => {
    db.students = [profile("arquivado", { status: "inactive", sales_stage: "lost" })];
    db.leads = [profile("dormant", { stage: "lost" }), profile("novo")];
    render(<RegistrationManager />);
    await loaded("Perfil arquivado");

    expect(screen.getByRole("button", { name: "Leads (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novos (1)" })).toBeInTheDocument();
    expect(card("Perfil arquivado").getByRole("button", { name: "Retomar contato" })).toBeEnabled();
    expect(card("Perfil dormant").getByRole("button", { name: "Retomar contato" })).toBeEnabled();
  });

  it("carrega perfis além da primeira página sem incluir leads já convertidos", async () => {
    db.leads = [profile("dormant", { stage: "lost" }), profile("convertido", { stage: "lost", converted_to_student_id: "outro" })];
    db.students = Array.from({ length: 160 }, (_, index) => profile(`student-${index}`, { status: "active", sales_stage: "active" }));
    db.students.push(profile("student-160", { status: "inactive", sales_stage: "lost" }));
    render(<RegistrationManager />);
    await loaded("Perfil student-160");

    expect(card("Perfil dormant").getByText("Perfil dormant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leads (2)" })).toBeInTheDocument();
    expect(screen.queryByText("Perfil convertido")).not.toBeInTheDocument();
  });

  it.each(["active", "awaiting_training", "awaiting_renewal", "trial"])("bloqueia a ação para status operacional %s", async (status) => {
    db.students = [profile("ativo", { status, activated_at: new Date().toISOString() })];
    render(<RegistrationManager />);
    await loaded("Perfil ativo");
    const button = card("Perfil ativo").getByRole("button", { name: "Transformar em lead" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("mantém a etapa visível quando o banco bloqueia uma matrícula ativa não refletida no cartão", async () => {
    db.students = [profile("desatualizado")];
    db.rpc.mockResolvedValue({ data: null, error: { message: "Matrícula ativa: alteração bloqueada." } });
    render(<RegistrationManager />);
    await loaded("Perfil desatualizado");
    fireEvent.click(card("Perfil desatualizado").getByRole("button", { name: "Transformar em lead" }));
    await waitFor(() => expect(db.toast.error).toHaveBeenCalledWith("Matrícula ativa: alteração bloqueada."));
    expect(screen.getByRole("button", { name: "Novos (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leads (0)" })).toBeInTheDocument();
    expect(db.toast.success).not.toHaveBeenCalled();
  });
});
