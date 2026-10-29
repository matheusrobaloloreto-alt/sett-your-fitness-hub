export const FLOW_CONDITION_FIELDS = ['is_student', 'name', 'nome', 'email', 'goal', 'payment_status', 'provider_status', 'trigger_type'] as const;
export const FLOW_CONDITION_OPERATORS = ['eq', 'neq', 'contains', 'exists'] as const;
type Data = Record<string, unknown>;
export function assertResponseVariable(key: string): void {
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || /^(is_student|company_id|student_id|trigger_type|recipient_|dispatch_|next_dispatch_at|copy_seed|contacts_last_7d|automation_key|constructor$|prototype$)/.test(key)) throw new Error('flow_response_variable_invalid_or_reserved');
}

export function evaluateFlowCondition(data: Data, context: Data): boolean {
  if (!Array.isArray(data.conditions) || !data.conditions.length || data.conditions.length > 20) throw new Error('flow_condition_requires_structured_rules');
  if (data.logic != null && !['and', 'or'].includes(String(data.logic))) throw new Error('flow_condition_logic_invalid');
  const results = data.conditions.map(rule => {
    if (!rule || !FLOW_CONDITION_FIELDS.includes(rule.field) || !FLOW_CONDITION_OPERATORS.includes(rule.operator)) throw new Error('flow_condition_rule_unsupported');
    if (rule.operator !== 'exists' && !['string', 'boolean', 'number'].includes(typeof rule.value)) throw new Error('flow_condition_value_required');
    if (rule.operator === 'contains' && typeof rule.value !== 'string') throw new Error('flow_condition_contains_requires_text');
    if (rule.field === 'is_student' && rule.operator !== 'exists' && typeof rule.value !== 'boolean') throw new Error('flow_condition_student_requires_boolean');
    const actual = context[rule.field];
    if (rule.operator === 'exists') return actual != null && actual !== '';
    if (rule.operator === 'eq') return actual === rule.value;
    if (rule.operator === 'neq') return actual !== rule.value;
    return typeof actual === 'string' && typeof rule.value === 'string' && actual.toLocaleLowerCase().includes(rule.value.toLocaleLowerCase());
  });
  return data.logic === 'and' ? results.every(Boolean) : results.some(Boolean);
}

export function validateFlowNode(type: string, data: Data): void {
  if (!['start', 'content', 'menu', 'condition', 'action', 'flow_connection', 'flowConnection'].includes(type)) throw new Error('flow_node_type_unsupported');
  if (data.wait_for_reply != null && typeof data.wait_for_reply !== 'boolean') throw new Error('flow_wait_for_reply_requires_boolean');
  for (const key of ['message', 'prompt']) if (data[key] != null && (typeof data[key] !== 'string' || String(data[key]).length > 6000)) throw new Error('flow_message_requires_text');
  if (data.use_company_template != null && (type !== 'content' || data.use_company_template !== 'weekly_contact')) throw new Error('flow_company_template_binding_unsupported');
  if (type === 'condition') evaluateFlowCondition(data, {});
  if (type === 'action' && (data.action_type !== 'tag' || typeof data.tag_name !== 'string' || !data.tag_name.trim() || data.tag_name.length > 80)) throw new Error('flow_action_requires_tag_name; notify/update_status unsupported');
  if (['flowConnection', 'flow_connection'].includes(type) && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(data.target_flow_id || ''))) throw new Error('flow_target_id_required');
  if (data.delay_minutes != null && (!Number.isInteger(data.delay_minutes) || Number(data.delay_minutes) < 0 || Number(data.delay_minutes) > 10080)) throw new Error('flow_delay_invalid_0_to_10080');
  if (data.wait_for_reply) {
    if (data.save_response_as != null && !['name', 'nome', 'email', 'goal', 'custom'].includes(String(data.save_response_as))) throw new Error('flow_response_field_unsupported');
    if (data.save_response_as === 'custom') assertResponseVariable(String(data.custom_variable || ''));
  }
}

export function delayDecision(key: string, minutes: number, context: Data, now = new Date()): { wait: boolean; context: Data } {
  validateFlowNode('content', { delay_minutes: minutes });
  if (!minutes) return { wait: false, context };
  const delay = context._delay as { key?: string; due?: string } | undefined;
  if (delay?.key === key) {
    const due = Date.parse(String(delay.due));
    if (!Number.isFinite(due)) throw new Error('flow_delay_invalid_due_date');
    if (due > now.getTime()) return { wait: true, context: { ...context, next_dispatch_at: delay.due } };
    const resumed = { ...context };
    delete resumed._delay;
    delete resumed.next_dispatch_at;
    return { wait: false, context: resumed };
  }
  const due = new Date(now.getTime() + minutes * 60_000).toISOString();
  return { wait: true, context: { ...context, _delay: { key, due }, next_dispatch_at: due } };
}

export function enterFlow(context: Data, flowId: string): Data {
  const path = Array.isArray(context._flow_path) ? context._flow_path.map(String) : [];
  if (path.includes(flowId) || path.length >= 10) throw new Error('flow_connection_cycle_or_limit');
  return { ...context, _flow_path: [...path, flowId] };
}

interface FlowReadReply { data: unknown; error: unknown }
interface FlowReadQuery extends PromiseLike<FlowReadReply> {
  eq(column: string, value: unknown): FlowReadQuery;
  maybeSingle(): PromiseLike<FlowReadReply>;
}
export interface CompanyFlowReadClient {
  from(table: 'automation_flows' | 'automation_flow_nodes' | 'automation_flow_edges'): { select(columns: string): FlowReadQuery };
}
export interface FlowNodeRecord { id: string; node_type: string; data: Data; label?: string }
export interface FlowEdgeRecord { source_node_id: string; target_node_id: string; source_handle?: string; label?: string }
function record(value: unknown): value is Data { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export async function loadCompanyFlow(client: CompanyFlowReadClient, companyId: string, flowId: string) {
  const flow = await client.from('automation_flows').select('id,company_id,is_active').eq('id', flowId).eq('company_id', companyId).maybeSingle();
  if (flow.error) throw flow.error;
  if (!record(flow.data) || flow.data.is_active !== true) throw new Error('flow_target_missing_inactive_or_foreign');
  const [nodes, edges] = await Promise.all([
    client.from('automation_flow_nodes').select('*').eq('flow_id', flowId),
    client.from('automation_flow_edges').select('*').eq('flow_id', flowId),
  ]);
  if (nodes.error) throw nodes.error;
  if (edges.error) throw edges.error;
  if (!Array.isArray(nodes.data) || !Array.isArray(edges.data)) throw new Error('flow_target_graph_invalid');
  const parsedNodes = nodes.data.map((value: unknown): FlowNodeRecord => {
    if (!record(value) || typeof value.id !== 'string' || typeof (value.node_type || value.type) !== 'string') throw new Error('flow_target_node_invalid');
    return { id: value.id, node_type: String(value.node_type || value.type), data: record(value.data) ? value.data : {}, label: typeof value.label === 'string' ? value.label : undefined };
  });
  const parsedEdges = edges.data.map((value: unknown): FlowEdgeRecord => {
    if (!record(value) || typeof value.source_node_id !== 'string' || typeof value.target_node_id !== 'string') throw new Error('flow_target_edge_invalid');
    return { source_node_id: value.source_node_id, target_node_id: value.target_node_id, source_handle: typeof value.source_handle === 'string' ? value.source_handle : undefined, label: typeof value.label === 'string' ? value.label : undefined };
  });
  const start = parsedNodes.find(n => n.node_type === 'start');
  if (!start) throw new Error('flow_target_start_missing');
  return { nodes: parsedNodes, edges: parsedEdges, startId: start.id };
}
