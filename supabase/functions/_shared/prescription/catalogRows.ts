/** Fetch every relation row, including exercises with many legacy target aliases. */
export async function fetchExerciseRelations({
  supabase, table, columns, exerciseIds, companyId, chunkSize = 80,
}: {
  supabase: any;
  table: string;
  columns: string;
  exerciseIds: string[];
  companyId?: string | null;
  chunkSize?: number;
}) {
  const rows: any[] = [];
  const pageSize = 500;
  for (let index = 0; index < exerciseIds.length; index += chunkSize) {
    const ids = exerciseIds.slice(index, index + chunkSize);
    for (let offset = 0; ; offset += pageSize) {
      let query = supabase.from(table).select(columns).in("exercise_id", ids)
        .order("exercise_id", { ascending: true });
      if (table === "exercise_muscle_targets") query = query.order("muscle_group_id", { ascending: true });
      if (companyId) query = query.eq("company_id", companyId);
      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) return { data: rows, error };
      const page = data ?? [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
  }
  return { data: rows, error: null };
}
