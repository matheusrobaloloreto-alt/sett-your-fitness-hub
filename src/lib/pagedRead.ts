export type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function readPages<T>(page: (from: number, to: number) => Page<T>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < size) return rows;
  }
}

export async function readForIds<T>(ids: string[], page: (ids: string[], from: number, to: number) => Page<T>) {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    rows.push(...await readPages((from, to) => page(batch, from, to)));
  }
  return rows;
}
