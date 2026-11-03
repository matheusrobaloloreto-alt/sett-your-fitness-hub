/** Shared normalization for human-readable search; never use for identity matching. */
export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('pt-BR');
}
