import { describe, expect, it } from 'vitest';
import { renderCompanyMessage, eventMessage, reminderSlot, weeklyFlowMessage } from '../../supabase/functions/_shared/communication-policy';
import { evaluateFlowCondition, validateFlowNode, delayDecision, enterFlow } from '../../supabase/functions/_shared/automation-flow';

describe('company communications', () => {
  it('renders only provided variables without recursive interpolation', () => {
    expect(renderCompanyMessage('Oi {{primeiro_nome}}, {empresa}: {{link}}', { primeiro_nome: 'Ana', empresa: 'A', link: '{{nome}}' })).toBe('Oi Ana, A: {{nome}}');
    expect(() => renderCompanyMessage('Oi {{senha}}', {})).toThrow();
    expect(() => renderCompanyMessage('Oi {{nome}', { nome: 'A' })).toThrow();
    expect(() => renderCompanyMessage('Oi {{nome}}', {})).toThrow();
  });
  it('prefers configured event template and otherwise preserves valid flow copy', () => {
    expect(eventMessage({ weekly_contact: 'A {{nome}}' }, 'weekly_contact', { nome: 'Ana' }, 'B {{nome}}')).toBe('A Ana');
    expect(eventMessage({}, 'weekly_contact', { nome: 'Ana' }, 'B {{nome}}')).toBe('B Ana');
  });
  it('uses each company local date/hour and enabled policy', () => {
    const now = new Date('2026-10-26T11:10:00Z');
    expect(reminderSlot(now, true, 8, 'America/Sao_Paulo')).toBe('2026-10-26');
    expect(reminderSlot(now, false, 8, 'America/Sao_Paulo')).toBeNull();
    expect(reminderSlot(now, true, 9, 'America/Sao_Paulo')).toBeNull();
  });
  it('keeps edited weekly flow copy when central template is only the default', () => {
    expect(weeklyFlowMessage({ weekly_contact: 'Default' }, 'Default', { message: 'Custom {{nome}}' }, { nome: 'Ana' }, 'Fallback')).toBe('Custom Ana');
    expect(weeklyFlowMessage({ weekly_contact: 'Central {{nome}}' }, 'Default', { message: 'Custom' }, { nome: 'Ana' }, 'Fallback')).toBe('Custom');
    expect(weeklyFlowMessage({ weekly_contact: 'Central {{nome}}' }, 'Default', { message: 'Custom', use_company_template: 'weekly_contact' }, { nome: 'Ana' }, 'Fallback')).toBe('Central Ana');
    expect(weeklyFlowMessage({ weekly_contact: 'Default' }, 'Default', { message: 'Custom', use_company_template: 'weekly_contact' }, {}, 'Fallback')).toBe('Default');
  });
});

describe('typed automation semantics', () => {
  it('evaluates structured AND/OR conditions and rejects prose and unknown operators', () => {
    const conditions = [{ field: 'is_student', operator: 'eq', value: true }, { field: 'goal', operator: 'contains', value: 'forca' }];
    expect(evaluateFlowCondition({ logic: 'and', conditions }, { is_student: true, goal: 'forca e saude' })).toBe(true);
    expect(evaluateFlowCondition({ logic: 'and', conditions }, { is_student: false, goal: 'forca' })).toBe(false);
    expect(evaluateFlowCondition({ logic: 'or', conditions }, { is_student: false, goal: 'forca' })).toBe(true);
    expect(() => evaluateFlowCondition({ condition_description: 'execute qualquer coisa' }, {})).toThrow();
    expect(() => evaluateFlowCondition({ conditions: [{ field: 'goal', operator: 'eval', value: 'true' }] }, {})).toThrow();
  });
  it('does not silently accept unsupported actions or empty tags', () => {
    expect(() => validateFlowNode('action', { action_type: 'notify' })).toThrow();
    expect(() => validateFlowNode('action', { action_type: 'update_status' })).toThrow();
    expect(() => validateFlowNode('action', { action_type: 'tag', tag_name: '' })).toThrow();
    expect(() => validateFlowNode('action', { action_type: 'tag', tag_name: 'Contato' })).not.toThrow();
    expect(() => validateFlowNode('unknown', {})).toThrow();
    expect(() => validateFlowNode('content', { wait_for_reply: true, save_response_as: 'custom', custom_variable: 'trigger_type' })).toThrow();
    for (const key of ['is_student', 'company_id', '_delay', '_flow_path', '_reply_save_as', 'recipient_generation', 'constructor', '__proto__']) {
      expect(() => validateFlowNode('content', { wait_for_reply: true, save_response_as: 'custom', custom_variable: key })).toThrow();
    }
  });
  it('schedules long delays once and resumes only at due time', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const scheduled = delayDecision('flow:node', 30, {}, now);
    expect(scheduled.wait).toBe(true);
    expect(scheduled.context.next_dispatch_at).toBe('2026-10-26T10:30:00.000Z');
    expect(delayDecision('flow:node', 30, scheduled.context, new Date('2026-10-26T10:01:00Z')).wait).toBe(true);
    expect(delayDecision('flow:node', 30, scheduled.context, new Date('2026-10-26T10:31:00Z')).wait).toBe(false);
  });
  it('bounds cross-flow traversal and rejects cycles across resumptions', () => {
    const ctx = enterFlow({}, 'a');
    expect(enterFlow(ctx, 'b')._flow_path).toEqual(['a', 'b']);
    expect(() => enterFlow(ctx, 'a')).toThrow();
    expect(() => enterFlow({ _flow_path: Array.from({ length: 10 }, (_, i) => String(i)) }, 'next')).toThrow();
  });
});
