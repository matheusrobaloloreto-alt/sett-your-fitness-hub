export type DispatchOwner = {
  id: string;
  dispatch_lease_token?: string | null;
};

export type DispatchAttempt = {
  kind: "flow" | "intercycle";
  owner: DispatchOwner;
  key: string;
};

export class DispatchUncertain extends Error {
  constructor() { super("dispatch_uncertain"); }
}

export function assertAcyclicDispatchGraph(edges: Array<{ source_node_id: string; target_node_id: string }>) {
  const outgoing = new Map<string,string[]>();
  const incoming = new Map<string,number>();
  for (const edge of edges) {
    const next = outgoing.get(edge.source_node_id) || [];
    next.push(edge.target_node_id); outgoing.set(edge.source_node_id,next);
    incoming.set(edge.source_node_id,incoming.get(edge.source_node_id) || 0);
    incoming.set(edge.target_node_id,(incoming.get(edge.target_node_id) || 0)+1);
  }
  const ready = [...incoming].filter(([,count]) => count===0).map(([id]) => id);
  let seen=0;
  for (let index=0; index<ready.length; index++) {
    seen++;
    for (const target of outgoing.get(ready[index]) || []) {
      const count=(incoming.get(target) || 0)-1; incoming.set(target,count);
      if (count===0) ready.push(target);
    }
  }
  if (seen!==incoming.size) throw new Error('flow_graph_cycle_unsupported');
}

export async function prepareDispatch(admin: any, attempt: DispatchAttempt) {
  if (!attempt.owner.dispatch_lease_token) throw new Error("dispatch_lease_lost");
  const result = await admin.rpc("prepare_automation_dispatch", {
    _kind: attempt.kind, _owner_id: attempt.owner.id,
    _lease_token: attempt.owner.dispatch_lease_token, _send_key: attempt.key,
  });
  if (result.error) {
    if (String(result.error.message).includes("dispatch_uncertain")) throw new DispatchUncertain();
    throw new Error("dispatch_begin_unavailable");
  }
  if (result.data !== "prepared" && result.data !== "acked") throw new Error("dispatch_begin_invalid");
  return result.data as "prepared" | "acked";
}

export async function acknowledgeDispatch(admin: any, attempt: DispatchAttempt, receipt: string | null) {
  const result = await admin.rpc("ack_automation_dispatch", {
    _kind: attempt.kind, _owner_id: attempt.owner.id,
    _lease_token: attempt.owner.dispatch_lease_token, _send_key: attempt.key,
    _provider_message_id: receipt,
  });
  if (result.error) throw new DispatchUncertain();
}

export function isDispatchGuardRefusal(code: string) {
  return ["dispatch_lease_lost", "weekly_contact_ineligible", "weekly_contact_window_closed",
    "weekly_contact_interval_blocked", "weekly_contact_conversation_active"].includes(code);
}

export async function authorizeDispatch(admin: any, attempt: DispatchAttempt) {
  const result = await admin.rpc("authorize_automation_dispatch", {
    _kind: attempt.kind, _owner_id: attempt.owner.id,
    _lease_token: attempt.owner.dispatch_lease_token, _send_key: attempt.key,
  });
  if (result.error) {
    const code = String(result.error.message || "");
    if (isDispatchGuardRefusal(code)) {
      throw new Error(code);
    }
    throw new DispatchUncertain();
  }
}

// The server locks the owner and checks its own clock, even if an HTTP proxy or
// a DB row lock delayed the request after it left this process.
export async function fencedDispatchUpdate(
  admin: any, kind: DispatchAttempt["kind"], owner: DispatchOwner,
  patch: Record<string, unknown>,
) {
  if (!owner.dispatch_lease_token) throw new Error("dispatch_lease_lost");
  const result = await admin.rpc("checkpoint_automation_dispatch", {
    _kind:kind, _owner_id:owner.id, _lease_token:owner.dispatch_lease_token, _patch:patch,
  });
  if (result.error) throw new Error("dispatch_lease_lost");
}
