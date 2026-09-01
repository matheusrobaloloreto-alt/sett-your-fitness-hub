import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(resolve(process.cwd(), path), "utf8");

describe("WhatsApp -> Studio assessment handoff", () => {
  it("transfers stable chat, message and student ids plus the persisted media path", async () => {
    const chat = await read("src/pages/admin/WhatsAppChat.tsx");

    expect(chat).toContain("whatsappAssessmentHandoff");
    expect(chat).toContain("chatId: selectedChat.id");
    expect(chat).toContain("messageId: msg.id");
    expect(chat).toContain("studentId: selectedChat.student_id");
    expect(chat).toContain("mediaStoragePath: msg.media_storage_path || null");
    expect(chat).not.toContain("fallbackUrl: mediaSrc");
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
