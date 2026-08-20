const STAGING_NAME_RE =
  /^(\d{3})__([0-9a-f]{16})__([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(mp4|mov|webm|m4v|3gp)$/i;

export function localStagingFileName(remoteName) {
  const name = String(remoteName || "");
  if (!STAGING_NAME_RE.test(name)) {
    throw new Error("Nome remoto de staging inválido.");
  }
  return name;
}

export function stagingCodeFromName(remoteName) {
  const match = String(remoteName || "").match(STAGING_NAME_RE);
  if (!match) throw new Error("Nome remoto de staging inválido.");
  return match[1];
}

export function selectLatestStagingItems(items) {
  const latestByCode = new Map();
  for (const item of items || []) {
    const match = String(item?.name || "").match(STAGING_NAME_RE);
    if (!match) continue;
    const candidate = {
      ...item,
      cod: match[1],
      ts: Date.parse(item.created_at || "") || 0,
    };
    const current = latestByCode.get(candidate.cod);
    if (
      !current || candidate.ts > current.ts ||
      (candidate.ts === current.ts && candidate.name > current.name)
    ) {
      latestByCode.set(candidate.cod, candidate);
    }
  }
  return [...latestByCode.values()].sort((a, b) => a.cod.localeCompare(b.cod));
}

export function stagingNamesForSuccessfulCommits(processed, successfulIds) {
  const names = [];
  const seen = new Set();
  for (const item of processed || []) {
    if (!successfulIds.has(item.exerciseId)) continue;
    const remoteName = localStagingFileName(item.remoteName);
    if (!seen.has(remoteName)) {
      seen.add(remoteName);
      names.push(remoteName);
    }
  }
  return names;
}
