const INTERNAL_DESCRIPTION_PATTERNS = [
  /\bBN\s+Prescription\s+Engine\b/i,
  /\bPrescription\s+Engine\b/i,
  /\brevis(ar|ao|ão)\s+(os\s+)?casos\s+clinicos\b/i,
  /\bcasos\s+clinicos\b/i,
  /\brevis(ar|ao|ão)\s+clinica\b/i,
];

function normalizeForInternalMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isInternalDescriptionChunk(value: string) {
  const normalized = normalizeForInternalMatch(value);
  return INTERNAL_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function sanitizeStudentWorkoutDescription(description: string | null | undefined) {
  if (!description?.trim()) return null;

  const usefulChunks = description
    .split(/(?<=[.!?])\s+|\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .filter((chunk) => !isInternalDescriptionChunk(chunk));

  return usefulChunks.length ? usefulChunks.join(" ") : null;
}
