import { beforeEach, describe, expect, it, vi } from "vitest";
const accessMocks = vi.hoisted(() => ({ invoke: vi.fn(), panel: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: accessMocks.invoke } } }));
vi.mock("@/lib/whatsappChatPanel", async original => ({ ...await original<typeof import("@/lib/whatsappChatPanel")>(), requestWhatsAppChatPanel: accessMocks.panel }));
import { generateStudentLoginAccess, isRenewalOverdue, preflightStudentLoginAccess, openStudentChat, renewalMessage, studentCanonicalContact, sameStudentContactRecipient, studentContactErrorMessage, normalizeStudentChatPhone } from "./studentChat";

describe("renewal date boundary", () => {
  it.each([
    [-1, true, 'venceu'],
    [0, false, 'vence hoje'],
    [1, false, 'falta'],
  ] as const)('classifies a renewal at offset %s consistently with its draft', (daysLeft, overdue, wording) => {
    expect(isRenewalOverdue(daysLeft)).toBe(overdue);
    expect(renewalMessage({ daysLeft, paymentLink: 'https://example.test' })).toContain(wording);
  });
});

describe("student chat recipient normalization", () => {
  it("keeps an explicit Australian E.164 destination instead of adding Brazil", () => {
    expect(normalizeStudentChatPhone("+61 416 060 587")).toBe("61416060587");
  });

  it("uses the persisted non-Brazilian country for a number stored without plus", () => {
    expect(normalizeStudentChatPhone("61416060587", "AU")).toBe("61416060587");
  });

  it("keeps the legacy Brazilian default for local numbers", () => {
    expect(normalizeStudentChatPhone("(48) 99143-2057", "BR")).toBe("5548991432057");
  });

  it("rejects a malformed Brazilian mobile destination", () => {
    expect(normalizeStudentChatPhone("42077707180", "BR")).toBeNull();
  });
});


describe('student login access proof', () => {
  const input = { companyId: 'company-synthetic', studentId: 'student-synthetic', remoteJid: '5548999990001@s.whatsapp.net' };
  const ready = () => ({ ...input, ready: true, chatId: null, preflightToken: 'synthetic-token', stateFingerprint: 'before', expiresAt: new Date(Date.now() + 120000).toISOString() });
  beforeEach(() => { accessMocks.invoke.mockReset(); accessMocks.panel.mockReset().mockReturnValue(true); });
  it('blocks credential generation after a failed read-only preflight and exposes the actual edge error', async () => {
    accessMocks.invoke.mockResolvedValue({ data: null, error: { message: 'generic HTTP', context: { json: async () => ({ error: 'synthetic identity blocked' }) } } });
    await expect(generateStudentLoginAccess(input)).rejects.toThrow('synthetic identity blocked');
    expect(accessMocks.invoke.mock.calls.map(([name]) => name)).toEqual(['whatsapp-manager']);
  });
  it.each([{ companyId: 'other' }, { studentId: 'other' }, { remoteJid: '5548988880002@s.whatsapp.net' }, { expiresAt: '2000-01-01T00:00:00Z' }, { ready: false }, { stateFingerprint: '' }, { preflightToken: '' }, { chatId: undefined }])('rejects invalid preflight ACK %j without generating', async patch => {
    accessMocks.invoke.mockResolvedValue({ data: { ...ready(), ...patch }, error: null });
    await expect(generateStudentLoginAccess(input)).rejects.toThrow();
    expect(accessMocks.invoke).toHaveBeenCalledTimes(1);
  });
  it('read-only verification alone never generates credentials', async () => {
    accessMocks.invoke.mockResolvedValue({ data: ready(), error: null });
    await preflightStudentLoginAccess(input);
    expect(accessMocks.invoke.mock.calls.map(([name]) => name)).toEqual(['whatsapp-manager']);
  });
  it('requires full generation ACK and retains the post-generation fingerprint', async () => {
    accessMocks.invoke.mockResolvedValueOnce({ data: ready(), error: null }).mockResolvedValueOnce({ data: { ...ready(), email: 'student@example.invalid', password: 'synthetic', loginSendToken: 'send-proof', stateFingerprint: 'after' }, error: null });
    expect((await generateStudentLoginAccess(input)).stateFingerprint).toBe('after');
    expect(accessMocks.invoke.mock.calls[1][1].body).toMatchObject({ action: 'generate-login-credentials', preflight_token: 'synthetic-token', company_id: input.companyId, student_id: input.studentId });
  });
  it('rejects old unscoped generation response', async () => {
    accessMocks.invoke.mockResolvedValueOnce({ data: ready(), error: null }).mockResolvedValueOnce({ data: { email: 'student@example.invalid', password: 'synthetic' }, error: null });
    await expect(generateStudentLoginAccess(input)).rejects.toThrow('não confirmou');
  });
  it('passes access proof into the panel without looking up a different chat', async () => {
    await openStudentChat({ navigate: vi.fn(), routePrefix: 'admin', ...input, message: 'synthetic draft', verifiedLoginAccess: ready() as Awaited<ReturnType<typeof preflightStudentLoginAccess>>, loginAccess: { studentId: input.studentId, preflightToken: 'send-proof' } });
    expect(accessMocks.panel).toHaveBeenCalledWith(expect.objectContaining({ studentId: input.studentId, phone: '5548999990001', loginAccess: { studentId: input.studentId, preflightToken: 'send-proof' } }));
    expect(accessMocks.invoke).not.toHaveBeenCalled();
  });
  it('never falls back to a hidden phone for access', () => {
    expect(studentCanonicalContact({ phone: '48999990001', whatsapp: null }).ready).toBe(false);
    expect(studentCanonicalContact({ phone: '48988880002', whatsapp: '48999990001' }).divergent).toBe(true);
  });
});


it('compares BR9 recipient identity without equating another subscriber', () => {
 expect(sameStudentContactRecipient('5548999990001', '554899990001')).toBe(true);
 expect(sameStudentContactRecipient('5548999990001', '5548988880002')).toBe(false);
 expect(studentCanonicalContact({ whatsapp: '5548999990001', phone: '554899990001', country_code: 'BR' }).ready).toBe(true);
});


it.each([
 ['contact_version_conflict', 'Recarregue'],
 ['contact_ownership_conflict', 'outro aluno'],
 ['contact_chat_ownership_conflict', 'vínculo'],
 ['contact_confirmation_required', 'confirmação'],
 ['contact_reconciliation_confirmation_required', 'explicitamente'],
 ['contact_country_invalid', 'país'],
])('explains contact RPC error %s without leaking SQL', (message, expected) => {
 const text = studentContactErrorMessage({ code: 'PT409', message });
 expect(text).toContain(expected); expect(text).not.toContain(message);
});
it('hides unknown database details behind an actionable contact error', () => {
 const text = studentContactErrorMessage({ code: 'XX000', message: 'private SQL table constraint and values' });
 expect(text).toContain('Recarregue'); expect(text).not.toContain('SQL');
});


it('uses a password-free route handle when no panel is mounted', async () => {
 accessMocks.panel.mockReturnValue(false);
 const navigate = vi.fn();
 const input = { companyId: 'company-synthetic', studentId: 'student-synthetic', remoteJid: '5548999990001@s.whatsapp.net' };
 await openStudentChat({ ...input, navigate, routePrefix: 'admin', message: 'synthetic-password', loginAccess: { studentId: input.studentId, preflightToken: 'synthetic-proof' }, verifiedLoginAccess: { ...input, ready: true, chatId: null, preflightToken: 'preflight', stateFingerprint: 'snapshot', expiresAt: new Date(Date.now() + 120000).toISOString() } });
 expect(navigate).toHaveBeenCalled();
 const navigation = navigate.mock.calls[0][1].state;
 expect(navigation.loginDraftId).toBeTruthy();
 expect(JSON.stringify(navigation)).not.toContain('synthetic-password');
 expect(JSON.stringify(navigation)).not.toContain('synthetic-proof');
});
