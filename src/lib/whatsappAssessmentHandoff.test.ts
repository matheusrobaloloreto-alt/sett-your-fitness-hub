import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearWhatsAppAssessmentHandoff,
  persistWhatsAppAssessmentHandoff,
  resolveWhatsAppAssessmentHandoff,
  type WhatsAppAssessmentVideoHandoff,
} from "./whatsappAssessmentHandoff";

const read = (path: string) => readFile(resolve(process.cwd(), path), "utf8");

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const handoff: WhatsAppAssessmentVideoHandoff = {
  version: 1,
  studentId: "student-1",
  chatId: "chat-1",
  messageId: "message-1",
  messageExternalId: "provider-1",
  mediaStoragePath: "company-1/chat-1/video.mp4",
};

describe("WhatsApp -> Studio assessment handoff", () => {
  it("transfers stable chat, message and student ids plus the persisted media path", async () => {
    const [chat, studio] = await Promise.all([
      read("src/pages/admin/WhatsAppChat.tsx"),
      read("src/pages/admin/PrescriptionStudio.tsx"),
    ]);

    expect(chat).toContain("whatsappAssessmentHandoff");
    expect(chat).toContain("chatId: selectedChat.id");
    expect(chat).toContain("messageId: msg.id");
    expect(chat).toContain("studentId: selectedChat.student_id");
    expect(chat).toContain("mediaStoragePath: msg.media_storage_path || null");
    expect(chat).toContain("persistWhatsAppAssessmentHandoff(handoff)");
    expect(studio).toContain("resolveWhatsAppAssessmentHandoff(location.state)");
    expect(studio).toContain("clearWhatsAppAssessmentHandoff()");
    expect(chat).not.toContain("fallbackUrl: mediaSrc");
  });

  it("restores the selected student and video after a full-page navigation loses history.state", () => {
    const storage = new MemoryStorage();
    persistWhatsAppAssessmentHandoff(handoff, storage, 1_000);

    expect(resolveWhatsAppAssessmentHandoff(null, storage, 1_001)).toEqual(handoff);
  });

  it("rejects malformed or expired persisted handoffs", () => {
    const malformedStorage = new MemoryStorage();
    malformedStorage.setItem("sett:whatsapp-assessment-handoff:v1", "not-json");
    expect(resolveWhatsAppAssessmentHandoff(null, malformedStorage, 1_001)).toBeNull();

    const expiredStorage = new MemoryStorage();
    persistWhatsAppAssessmentHandoff(handoff, expiredStorage, 1_000);
    expect(resolveWhatsAppAssessmentHandoff(null, expiredStorage, 1_000 + 15 * 60_000 + 1)).toBeNull();
  });

  it("clears the persisted transfer only after the video was consumed", () => {
    const storage = new MemoryStorage();
    persistWhatsAppAssessmentHandoff(handoff, storage, 1_000);
    clearWhatsAppAssessmentHandoff(storage);

    expect(resolveWhatsAppAssessmentHandoff(null, storage, 1_001)).toBeNull();
  });

  it("keeps SPA navigation usable when session storage is unavailable", () => {
    const blockedStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };

    expect(() => persistWhatsAppAssessmentHandoff(handoff, blockedStorage, 1_000)).not.toThrow();
    expect(resolveWhatsAppAssessmentHandoff({ whatsappAssessmentHandoff: handoff }, blockedStorage, 1_001)).toEqual(handoff);
    expect(() => clearWhatsAppAssessmentHandoff(blockedStorage)).not.toThrow();
  });

  it("validates tenant, student, chat and message before loading private media", async () => {
    const assessment = await read("src/components/VideoAssessment.tsx");

    expect(assessment).toContain('.from("whatsapp_chats")');
    expect(assessment).toContain('.eq("company_id", companyId)');
    expect(assessment).toContain('.eq("student_id", studentId)');
    expect(assessment).toContain('.from("whatsapp_messages")');
    expect(assessment).toContain('.eq("chat_id", handoff.chatId)');
    expect(assessment).toContain('.eq("id", handoff.messageId)');
    expect(assessment).toContain('.from("whatsapp-media")');
    expect(assessment).toContain(".download(storagePath)");
    expect(assessment).toContain('functions.invoke<WhatsAppFetchMediaResponse>("whatsapp-manager"');
  });

  it("keeps the handoff on failure and exposes an explicit retry", async () => {
    const [studio, assessment] = await Promise.all([
      read("src/pages/admin/PrescriptionStudio.tsx"),
      read("src/components/VideoAssessment.tsx"),
    ]);

    expect(studio).toContain("onInitialVideoConsumed={consumeWhatsAppAssessmentHandoff}");
    expect(studio).not.toContain("loadVideoFromUrl(initialVideoUrl).finally");
    expect(assessment).toContain("Tentar carregar novamente");
    expect(assessment).toContain("onInitialVideoConsumed?.()");
    expect(assessment).not.toContain(".finally(() => onInitialVideoConsumed?.())");
  });

  it("invalidates an in-flight transfer when the selected student or handoff changes", async () => {
    const [studio, assessment] = await Promise.all([
      read("src/pages/admin/PrescriptionStudio.tsx"),
      read("src/components/VideoAssessment.tsx"),
    ]);

    expect(studio).toContain("key={studentId}");
    expect(assessment).toContain("const initialVideoRequestRef = useRef(0)");
    expect(assessment).toContain("const isCurrentRequest = () => initialVideoRequestRef.current === requestVersion");
    expect(assessment).toContain("if (!shouldContinue()) return false");
    expect(assessment).toContain("if (initialVideoRequestRef.current === requestVersion) initialVideoRequestRef.current += 1");
  });
});
