import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCompanyDashboardSnapshot, type CompanyDashboardSnapshot, type DashboardRenewalRow } from "./companyDashboardSnapshot";
import { dashboardRenewalsForPeriod, openDashboardRenewalDraft, readDashboardRenewalQueue } from "./dashboardRenewals";
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from "../../supabase/functions/_shared/company-product-settings";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn(), panel: vi.fn(), settings: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, functions: { invoke: mocks.invoke } } }));
vi.mock("@/lib/companyProductSettings", () => ({ fetchCompanyProductSettings: mocks.settings }));
vi.mock("@/lib/whatsappChatPanel", () => ({ requestWhatsAppChatPanel: mocks.panel }));

const studentId = "student-a";
const companyId = "company-a";
const idHigh = "00000000-0000-0000-0000-000000000009";
const idLow = "00000000-0000-0000-0000-000000000001";
const contract = (patch: Partial<DashboardRenewalRow> = {}): DashboardRenewalRow => ({
  id: idLow, student_id: studentId, status: "active", created_at: "2026-11-10T12:00:00Z",
  end_date: "2026-11-30", trainer_id: null, students: null, plans: { name: "Plano" }, ...patch,
});

describe("dashboard renewal enrollment selection", () => {
  it.each([
    ["2026-11-10T08:30:00-03:00", "2026-11-10T11:00:00Z", idLow],
    ["2026-11-10T12:00:00.000002+00:00", "2026-11-10T12:00:00.000001Z", idLow],
    ["2026-11-10T09:00:00.123456-03:00", "2026-11-10T12:00:00.123455+00:00", idLow],
    ["2026-11-10T09:00:00.12-03:00", "2026-11-10T12:00:00.120000Z", idHigh],
    ["2026-11-10T12:00:00.000001Z", "2026-11-10T12:00:00Z", idLow],
  ])("orders %s and %s as timestamptz, then UUID descending", (lowTimestamp, highTimestamp, expected) => {
    const rows = [
      contract({ id: idHigh, created_at: highTimestamp }),
      contract({ id: idLow, created_at: lowTimestamp }),
    ];
    expect(dashboardRenewalsForPeriod(rows, "all", "2026-11-10").map(row => row.contract.id)).toEqual([expected]);
  });

  it("chooses the checkout enrollment before month or deadline filtering", () => {
    const rows = [
      contract({ end_date: "2026-12-01", created_at: "2026-10-01T00:00:00Z" }),
      contract({ id: idHigh, status: "awaiting_training", end_date: "2026-11-10" }),
    ];
    expect(dashboardRenewalsForPeriod(rows, "currentMonth", "2026-11-10")).toEqual([]);
    expect(dashboardRenewalsForPeriod(rows, "all", "2026-11-10")).toEqual([{ contract: rows[0], daysLeft: 21 }]);
    rows[0].end_date = null;
    expect(dashboardRenewalsForPeriod(rows, "all", "2026-11-10")).toEqual([]);
  });
});

describe("dashboard renewal snapshot compatibility", () => {
  const snapshot: CompanyDashboardSnapshot = {
    version: 1, companyId, asOfDate: "2026-11-10",
    stats: { totalStudents: 1, interestedStudents: 0, pendingStudents: 0, awaitingRenewalStudents: 0, inactiveStudents: 0, trainers: 0 },
    planChart: [], trainerMap: {}, cycleCountdowns: [],
    renewals: { expiringContracts: [], awaitingRenewal: [], cycleCountdowns: [], trainerMap: {} },
    alerts: { pendingActions: [], birthdays: [], missingWorkouts: [], awaitingTrainer: [], awaitingTrainingDate: [], missingEnrollment: [], incompleteBilling: [], recentStudents: [] },
    monthlyPrescriptions: [], pendingFeedback: [], contactCadence: [], cohortFeedback: [], atRiskStudents: [],
  };

  it.each([
    {},
    { expiringContracts: [] },
    { expiringContracts: [{ id: idLow }] },
    { renewalQueueVersion: 1, expiringContracts: [contract(), { id: idHigh }] },
    { renewalQueueVersion: 1, expiringContracts: [contract({ created_at: "2026-11-10" })] },
  ])("flags old or mixed renewal data without rejecting other sections (%j)", queue => {
    const parsed = parseCompanyDashboardSnapshot({ ...snapshot, ...queue }, companyId);
    expect(readDashboardRenewalQueue(parsed)).toBeNull();
    expect(parsed.stats.totalStudents).toBe(1);
    expect(parsed.alerts).toBe(snapshot.alerts);
    expect(parsed.renewals).toBe(snapshot.renewals);
  });

  it.each([{ rows: [] }, { rows: [contract()] }])("accepts a confirmed complete queue (%j)", ({ rows }) => {
    const parsed = parseCompanyDashboardSnapshot({ ...snapshot, renewalQueueVersion: 1, expiringContracts: rows }, companyId);
    expect(readDashboardRenewalQueue(parsed)).toEqual(rows);
  });
});

describe("manual dashboard renewal draft", () => {
  const phone = "5548999990001";
  const student = { id: studentId, company_id: companyId, full_name: "Aluna Teste", phone, whatsapp: phone, country_code: "BR" };
  const chat = { id: "chat-a", company_id: companyId, student_id: studentId, remote_jid: phone + "@s.whatsapp.net" };

  function setReads(studentRow: Partial<typeof student> = {}, chats = [chat]) {
    const studentQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { ...student, ...studentRow }, error: null }) };
    const chatsQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: chats, error: null }) };
    mocks.from.mockImplementation((table: string) => table === "students" ? studentQuery : chatsQuery);
    return { studentQuery, chatsQuery };
  }

  const draft = (copyDraft?: (message: string) => Promise<void>) =>
    openDashboardRenewalDraft({ companyId, contract: contract(), daysLeft: 0, navigate: vi.fn(), routePrefix: "admin", copyDraft });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.invoke.mockResolvedValue({ data: { token: "test-token" }, error: null });
    mocks.panel.mockReturnValue(true);
    mocks.settings.mockResolvedValue({ settings: DEFAULT_COMPANY_PRODUCT_SETTINGS, version: 0 });
  });

  it.each([
    [chat.student_id, "5548988880002@s.whatsapp.net"],
    ["another-student", chat.remote_jid],
    [chat.student_id, "5548999990001@lid"],
  ])("rejects incorrect chat %s / %s before generating a payment link", async (student_id, remote_jid) => {
    setReads({}, [{ ...chat, student_id, remote_jid }]);
    const copy = vi.fn().mockResolvedValue(undefined);
    await expect(draft(copy)).rejects.toThrow(/conversa.*não corresponde/i);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.panel).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it("rejects divergent legacy fields even if the linked chat matches one of them", async () => {
    setReads({ phone: "5548988880002" });
    await expect(draft()).rejects.toThrow(/confirme o WhatsApp/i);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects a linked chat with no canonical contact to verify it against", async () => {
    setReads({ phone: "", whatsapp: "" });
    await expect(draft()).rejects.toThrow(/confirme o WhatsApp/i);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("reads the fresh scoped destination before the only effect and opens an editable draft", async () => {
    const { studentQuery, chatsQuery } = setReads();
    await expect(draft()).resolves.toBe("chat");
    expect(studentQuery.eq.mock.calls).toEqual([["company_id", companyId], ["id", studentId]]);
    expect(chatsQuery.eq).toHaveBeenCalledWith("company_id", companyId);
    expect(chatsQuery.range.mock.invocationCallOrder[0]).toBeLessThan(mocks.invoke.mock.invocationCallOrder[0]);
    expect(mocks.from.mock.calls).toEqual([["students"], ["whatsapp_chats"]]);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("public-payment-context", {
      body: { action: "create-renewal-link", studentId, renewalOfEnrollmentId: idLow },
    });
    expect(mocks.panel).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      companyId, studentId, chatId: chat.id, phone, mode: "draft",
      eventDraft: expect.objectContaining({ renewalEnrollmentId: idLow }),
      prefillMessage: expect.stringMatching(/vence hoje.*test-token/),
    }));
  });

  it("preserves an international DDI and rejects a conversation with the same number linked to another student", async () => {
    const phone = "441234567890";
    const contact = { country_code: "GB", phone: `+${phone}`, whatsapp: `+${phone}` };
    const remote_jid = `${phone}@s.whatsapp.net`;
    setReads(contact, [{ ...chat, remote_jid }]);
    await expect(draft()).resolves.toBe("chat");
    expect(mocks.panel).toHaveBeenCalledWith(expect.objectContaining({ chatId: chat.id, phone }));
    mocks.invoke.mockClear();
    setReads(contact, [{ ...chat, remote_jid, student_id: "other" }]);
    await expect(draft()).rejects.toThrow(/conversa.*não corresponde/i);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("opens a new draft from a single valid legacy phone when there is no linked conversation", async () => {
    setReads({ whatsapp: "" }, []);
    await expect(draft()).resolves.toBe("chat");
    expect(mocks.panel).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ chatId: null, studentId, phone, mode: "draft" }));
  });

  it("does not confuse a Singapore draft with an unrelated Brazilian conversation", async () => {
    setReads({ country_code: "SG", phone: "+6581234567", whatsapp: "+6581234567" },
      [{ ...chat, student_id: "other", remote_jid: "5565981234567@s.whatsapp.net" }]);
    await expect(draft()).resolves.toBe("chat");
    expect(mocks.panel).toHaveBeenCalledWith(expect.objectContaining({ chatId: null, phone: "6581234567" }));
  });

  it("retains the manual clipboard fallback with no conversation or registered contact", async () => {
    setReads({ phone: "", whatsapp: "" }, []);
    const copy = vi.fn().mockResolvedValue(undefined);
    await expect(draft(copy)).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("test-token"));
    expect(mocks.panel).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
