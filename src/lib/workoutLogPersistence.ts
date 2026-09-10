export type WorkoutLogSaveResult =
  | { ok: true; reason: "saved" | "no_changes" }
  | { ok: false; reason: "not_ready" | "validation_error" | "rpc_error" | "conflict" };

type RpcResult<TData> = { data: TData | null; error: unknown | null };

export async function saveWorkoutLogBatchIfCurrent<TRow, TData extends { conflicts?: unknown[] }>({
  rows,
  save,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  rows: TRow[];
  save: (rows: TRow[]) => Promise<RpcResult<TData>>;
  wait?: (ms: number) => Promise<unknown>;
}): Promise<
  | { ok: true; reason: "saved" | "no_changes"; data: TData | null }
  | { ok: false; reason: "rpc_error"; error: unknown }
  | { ok: false; reason: "conflict"; data: TData }
> {
  if (rows.length === 0) return { ok: true, reason: "no_changes", data: null };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await save(rows);
    if (!result.error && result.data) {
      if (Array.isArray(result.data.conflicts) && result.data.conflicts.length > 0) {
        return { ok: false, reason: "conflict", data: result.data };
      }
      return { ok: true, reason: "saved", data: result.data };
    }
    lastError = result.error || new Error("Resposta vazia ao salvar séries.");
    if (attempt < 2) await wait(500 * (attempt + 1));
  }

  return { ok: false, reason: "rpc_error", error: lastError };
}
