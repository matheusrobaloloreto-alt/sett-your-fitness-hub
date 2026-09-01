export interface WhatsAppAssessmentVideoHandoff {
  version: 1;
  studentId: string;
  chatId: string;
  messageId: string;
  messageExternalId?: string | null;
  mediaStoragePath?: string | null;
}

type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface PersistedWhatsAppAssessmentHandoff {
  version: 1;
  savedAt: number;
  handoff: WhatsAppAssessmentVideoHandoff;
}

const STORAGE_KEY = "sett:whatsapp-assessment-handoff:v1";
const MAX_AGE_MS = 15 * 60_000;

export function isWhatsAppAssessmentVideoHandoff(value: unknown): value is WhatsAppAssessmentVideoHandoff {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WhatsAppAssessmentVideoHandoff>;
  return candidate.version === 1
    && typeof candidate.studentId === "string" && candidate.studentId.length > 0
    && typeof candidate.chatId === "string" && candidate.chatId.length > 0
    && typeof candidate.messageId === "string" && candidate.messageId.length > 0;
}

function browserStorage(storage?: HandoffStorage): HandoffStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function persistWhatsAppAssessmentHandoff(
  handoff: WhatsAppAssessmentVideoHandoff,
  storage?: HandoffStorage,
  now = Date.now(),
) {
  if (!isWhatsAppAssessmentVideoHandoff(handoff)) return;
  try {
    browserStorage(storage)?.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      savedAt: now,
      handoff,
    } satisfies PersistedWhatsAppAssessmentHandoff));
  } catch {
    // O history.state continua sendo o caminho principal; não bloqueia a navegação.
  }
}

export function resolveWhatsAppAssessmentHandoff(
  navigationState: unknown,
  storage?: HandoffStorage,
  now = Date.now(),
): WhatsAppAssessmentVideoHandoff | null {
  const stateHandoff = navigationState && typeof navigationState === "object"
    ? (navigationState as { whatsappAssessmentHandoff?: unknown }).whatsappAssessmentHandoff
    : null;
  if (isWhatsAppAssessmentVideoHandoff(stateHandoff)) return stateHandoff;

  const targetStorage = browserStorage(storage);
  let raw: string | null = null;
  try {
    raw = targetStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const persisted = JSON.parse(raw) as Partial<PersistedWhatsAppAssessmentHandoff>;
    const isFresh = typeof persisted.savedAt === "number"
      && persisted.savedAt <= now
      && now - persisted.savedAt <= MAX_AGE_MS;
    if (persisted.version === 1 && isFresh && isWhatsAppAssessmentVideoHandoff(persisted.handoff)) {
      return persisted.handoff;
    }
  } catch {
    // Entrada inválida ou de versão anterior: remove para não reabrir o aluno errado.
  }

  try {
    targetStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Armazenamento indisponível não pode impedir a abertura normal do Studio.
  }
  return null;
}

export function clearWhatsAppAssessmentHandoff(storage?: HandoffStorage) {
  try {
    browserStorage(storage)?.removeItem(STORAGE_KEY);
  } catch {
    // A limpeza da UI continua mesmo em modo privado/restrito.
  }
}
