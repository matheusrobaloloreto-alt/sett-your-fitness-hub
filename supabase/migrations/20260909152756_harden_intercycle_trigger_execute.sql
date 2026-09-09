-- Trigger functions run through their table triggers and must not be exposed as RPCs.
revoke all on function public.assert_intercycle_delivery_scope(),
  public.assert_intercycle_delivery_transition(),
  public.assert_intercycle_invite_scope(),
  public.assert_intercycle_answer_scope(),
  public.assert_intercycle_waiver_scope(),
  public.reconcile_intercycle_delivery_for_cycle_change()
from public, anon, authenticated;
