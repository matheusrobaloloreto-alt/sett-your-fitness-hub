import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearWhatsAppAssessmentHandoff,
  persistWhatsAppAssessmentHandoff,
  resolveStudioWhatsAppAssessmentHandoff,
  resolveWhatsAppAssessmentHandoff,
  resolveWhatsAppAssessmentReturnTo,
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

describe("WhatsApp assessment return navigation", () => {
  const profilePath = "/admin/students/student-1";
  const chatPath = "/admin/whatsapp-chat?chatId=chat-1&filter=with%20video#message-1";
  const locationFor = (path: string) => new URL(path, "https://sett.invalid");
  const transferToProfile = (from: string) => {
    const returnTo = resolveWhatsAppAssessmentReturnTo(locationFor(from), profilePath);
    const search = new URLSearchParams({ tab: "integrada" });
    if (returnTo) search.set("returnTo", returnTo);
    return `${profilePath}?${search.toString()}`;
  };

  it("keeps repeated transfers at one return target with the original chat query and hash", () => {
    const firstTransfer = transferToProfile(chatPath);
    let currentPath = firstTransfer;

    for (let transfer = 0; transfer < 5; transfer += 1) {
      currentPath = transferToProfile(currentPath);
      expect(currentPath).toBe(firstTransfer);
      expect(locationFor(currentPath).searchParams.get("returnTo")).toBe(chatPath);
    }
  });

  it("unwraps an existing recursive profile chain to the original return target", () => {
    let nestedPath = chatPath;
    for (let transfer = 0; transfer < 5; transfer += 1) {
      nestedPath = `${profilePath}?tab=integrada&returnTo=${encodeURIComponent(nestedPath)}#avaliacao`;
    }

    expect(resolveWhatsAppAssessmentReturnTo(locationFor(nestedPath), profilePath)).toBe(chatPath);
    expect(transferToProfile(nestedPath)).toBe(transferToProfile(chatPath));
  });

  it("uses the normal profile fallback when a same-profile chain has no return destination", () => {
    const selfPath = `${profilePath}?tab=integrada#avaliacao`;
    const nestedPath = `${profilePath}/?returnTo=${encodeURIComponent(selfPath)}`;

    expect(resolveWhatsAppAssessmentReturnTo(locationFor(selfPath), profilePath)).toBeNull();
    expect(transferToProfile(nestedPath)).toBe(`${profilePath}?tab=integrada`);
    expect(transferToProfile(transferToProfile(nestedPath))).toBe(`${profilePath}?tab=integrada`);
  });

  it("preserves other routes and student profiles, including their existing return query and hash", () => {
    const otherProfile = "/admin/students/student-2?tab=program&returnTo=%2Fadmin%2Fstudents#treino";
    const chatWithBackslashes = "/admin/whatsapp-chat?search=a\\b#message\\1";

    expect(resolveWhatsAppAssessmentReturnTo(locationFor(chatPath), profilePath)).toBe(chatPath);
    expect(resolveWhatsAppAssessmentReturnTo(locationFor(otherProfile), profilePath)).toBe(otherProfile);
    expect(resolveWhatsAppAssessmentReturnTo(locationFor(chatWithBackslashes), profilePath)).toBe(chatWithBackslashes);
  });

  it.each(["https://example.com/path", "//example.com/path", "/\\example.com/path", "/\n/example.com/path", "/\t/example.com/path", "/\r/example.com/path", "javascript:alert(1)"])(
    "uses the normal profile fallback for an unsafe nested return target %s",
    (returnTo) => {
      const currentPath = `${profilePath}?returnTo=${encodeURIComponent(returnTo)}`;
      expect(resolveWhatsAppAssessmentReturnTo(locationFor(currentPath), profilePath)).toBeNull();
    },
  );
});

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
    expect(chat).toContain('tab: "integrada"');
    expect(chat).toContain("returnTo");
    expect(chat).toContain("`/${studioRoutePrefix}/students/${selectedChat.student_id}?${targetSearch.toString()}`");
    expect(chat).not.toContain("`/${studioRoutePrefix}/studio`");
    expect(studio).toContain("resolveStudioWhatsAppAssessmentHandoff(location.state, { embeddedStudentId })");
    expect(studio.indexOf("resolveStudioWhatsAppAssessmentHandoff(location.state, { embeddedStudentId })")).toBeLessThan(
      studio.indexOf("if (isEmbedded) return;"),
    );
    expect(studio).toContain('setTab("avaliacao")');
    expect(studio).toContain("clearWhatsAppAssessmentHandoff()");
    expect(studio).toContain("delete state.whatsappAssessmentHandoff");
    expect(chat).not.toContain("fallbackUrl: mediaSrc");
    expect(chat).not.toContain("navigate(`/${studioRoutePrefix}/studio`");
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

  it("accepts embedded Studio handoffs only for the currently opened student", () => {
    expect(resolveStudioWhatsAppAssessmentHandoff(
      { whatsappAssessmentHandoff: handoff },
      { embeddedStudentId: "student-1", now: 1_001 },
    )).toEqual(handoff);

    expect(resolveStudioWhatsAppAssessmentHandoff(
      { whatsappAssessmentHandoff: handoff },
      { embeddedStudentId: "student-2", now: 1_001 },
    )).toBeNull();
  });

  it("validates tenant, student, chat and message before loading private media", async () => {
    const [assessment, component] = await Promise.all([
      read("src/lib/whatsappAssessmentVideo.ts"),
      read("src/components/VideoAssessment.tsx"),
    ]);

    expect(component).toContain('import { resolveWhatsAppAssessmentVideoBlob } from "@/lib/whatsappAssessmentVideo"');
    expect(component).toContain("await resolveWhatsAppAssessmentVideoBlob({");
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

  it("lets the embedded student Studio consume only handoffs for the same profile student", async () => {
    const studio = await read("src/pages/admin/PrescriptionStudio.tsx");

    expect(studio).not.toContain("if (isEmbedded) return;\n    const handoff = resolveWhatsAppAssessmentHandoff(location.state)");
    expect(studio).toContain("if (embeddedStudentId && handoff.studentId !== embeddedStudentId) return;");
    expect(studio).toContain("if (!embeddedStudentId) setStudentId(handoff.studentId)");
    expect(studio).toContain('setTab("avaliacao")');
    expect(studio).toContain("setPendingWhatsAppVideo(handoff)");
  });
});
