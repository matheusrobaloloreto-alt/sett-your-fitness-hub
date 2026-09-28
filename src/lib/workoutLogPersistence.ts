export type WorkoutLogSaveResult =
  | { ok: true; reason: "saved" | "no_changes" }
  | { ok: false; reason: "not_ready" | "validation_error" | "rpc_error" | "conflict" };

type RpcResult<TData> = { data: TData | null; error: unknown | null };

function isRetryableSaveError(error: unknown) {
  if (!error || typeof error !== "object") return true;
  const { code, status } = error as { code?: string; status?: number };
  if (status === 401 || status === 403) return false;
  if (!code) return true;
  // Validation and authorization errors cannot be fixed by resending the same
  // payload. Retry only transient PostgreSQL failures, or transport errors.
  if (/^[0-9A-Z]{5}$/.test(code)) {
    return code.startsWith("08") || ["40001", "40P01", "55P03", "57014", "53300", "57P01"].includes(code);
  }
  return !code.startsWith("PGRST");
}

export interface WorkoutLogSaveQueue {
  run<TResult>(task: () => Promise<TResult>): Promise<TResult>;
}

/**
 * Autosave, manual save and session completion share the same revision-checked
 * RPC. Keep them ordered so two requests from this device never race using the
 * same base revision.
 */
export function createWorkoutLogSaveQueue(): WorkoutLogSaveQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    run<TResult>(task: () => Promise<TResult>) {
      const result = tail.catch(() => undefined).then(task);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

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
    let result: RpcResult<TData>;
    try {
      result = await save(rows);
    } catch (error) {
      result = { data: null, error };
    }
    if (!result.error && result.data) {
      if (Array.isArray(result.data.conflicts) && result.data.conflicts.length > 0) {
        return { ok: false, reason: "conflict", data: result.data };
      }
      return { ok: true, reason: "saved", data: result.data };
    }
    lastError = result.error || new Error("Resposta vazia ao salvar séries.");
    if (!isRetryableSaveError(lastError)) break;
    if (attempt < 2) await wait(500 * (attempt + 1));
  }

  return { ok: false, reason: "rpc_error", error: lastError };
}
