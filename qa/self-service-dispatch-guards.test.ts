import { assertResponseVariable, validateFlowNode } from '../supabase/functions/_shared/automation-flow.ts';

Deno.test('dispatcher ACK checkpoint cannot be overwritten by an external custom reply variable', () => {
  let rejected = 0;
  for (const validate of [
    () => assertResponseVariable('_dispatch_content_ack'),
    () => validateFlowNode('content', { wait_for_reply: true, save_response_as: 'custom', custom_variable: '_dispatch_content_ack' }),
  ]) {
    try { validate(); } catch (error) {
      if (!(error instanceof Error) || error.message !== 'flow_response_variable_invalid_or_reserved') throw error;
      rejected += 1;
    }
  }
  if (rejected !== 2) throw new Error('Reserved ACK marker was accepted as a custom response key');
  assertResponseVariable('student_goal');
});
