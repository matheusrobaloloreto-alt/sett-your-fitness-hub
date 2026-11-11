import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageClient } from "@supabase/storage-js";
import { resolveWhatsAppAssessmentVideoBlob } from "./whatsappAssessmentVideo";
import type { WhatsAppAssessmentVideoHandoff } from "./whatsappAssessmentHandoff";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  download: vi.fn(),
  createSignedUrl: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
    functions: { invoke: mocks.invoke },
  },
}));

const handoff: WhatsAppAssessmentVideoHandoff = {
  version: 1,
  studentId: "student-1",
  chatId: "chat-1",
  messageId: "message-1",
  messageExternalId: "provider-1",
  mediaStoragePath: "company-1/chat-1/video.mp4",
};
const input = { handoff, companyId: "company-1", studentId: "student-1" };
const video = new Blob(["test video"], { type: "video/mp4" });
const signedUrl = "https://storage.example.test/video.mp4?token=temporary";

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return query;
}

function setupMessage(overrides = {}) {
  const chat = queryResult({ id: "chat-1", remote_jid: "test@s.whatsapp.net" });
  const message = queryResult({
    id: "message-1",
    source: "incoming",
    type: "video",
    media_type: "video/mp4",
    media_storage_path: handoff.mediaStoragePath,
    message_id_external: "provider-1",
    media_url: "https://storage.example.test/previous.mp4",
    ...overrides,
  });
  mocks.from.mockImplementation((table) => table === "whatsapp_chats" ? chat : message);
  return { chat, message };
}

beforeEach(() => {
  vi.resetAllMocks();
  setupMessage();
  mocks.storageFrom.mockReturnValue({ download: mocks.download, createSignedUrl: mocks.createSignedUrl });
  mocks.download.mockResolvedValue({ data: video, error: null });
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl }, error: null });
  mocks.invoke.mockResolvedValue({ data: null, error: new Error("Unavailable") });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => video }));
});

afterEach(() => vi.unstubAllGlobals());

describe("WhatsApp assessment video recovery", () => {
  it("loads the original stored video and keeps the normal path unchanged", async () => {
    expect(await resolveWhatsAppAssessmentVideoBlob(input)).toBe(video);
    expect(mocks.download).toHaveBeenCalledWith(handoff.mediaStoragePath);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("recovers a native Failed to fetch rejection using a fresh signed URL", async () => {
    mocks.download.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await resolveWhatsAppAssessmentVideoBlob(input)).toBe(video);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(handoff.mediaStoragePath, 300);
    expect(fetch).toHaveBeenCalledWith(signedUrl, { credentials: "omit" });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("recovers an HTTP 200 body failure through the installed Storage SDK", async () => {
    const response = new Response("partial video", { headers: { "Content-Type": "video/mp4" } });
    vi.spyOn(response, "blob").mockRejectedValue(new TypeError("Failed to fetch"));
    const storageFetch = vi.fn().mockResolvedValue(response);
    const storage = new StorageClient("https://storage.example.test/storage/v1", {}, storageFetch);
    mocks.download.mockImplementation((path) => storage.from("whatsapp-media").download(path));

    expect(await resolveWhatsAppAssessmentVideoBlob(input)).toBe(video);
    expect(storageFetch).toHaveBeenCalledTimes(1);
    expect(response.blob).toHaveBeenCalledTimes(1);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(handoff.mediaStoragePath, 300);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("also recovers a returned StorageError without contacting the WhatsApp provider", async () => {
    mocks.download.mockResolvedValue({ data: null, error: new Error("Download interrupted") });
    expect(await resolveWhatsAppAssessmentVideoBlob(input)).toBe(video);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(handoff.mediaStoragePath, 300);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("uses the authenticated message recovery when signing the stored object fails", async () => {
    mocks.download.mockRejectedValue(new TypeError("Failed to fetch"));
    mocks.createSignedUrl.mockRejectedValue(new TypeError("Failed to fetch"));
    mocks.invoke.mockResolvedValue({ data: { mediaUrl: signedUrl }, error: null });

    expect(await resolveWhatsAppAssessmentVideoBlob(input)).toBe(video);
    expect(mocks.invoke).toHaveBeenCalledWith("whatsapp-manager", {
      body: {
        action: "fetch-media", companyId: "company-1", chatId: "chat-1",
        messageDbId: "message-1", messageId: "provider-1",
        remoteJid: "test@s.whatsapp.net", fromMe: false, mimeType: "video/mp4",
      },
    });
  });

  it("uses returned base64 when both browser downloads fail", async () => {
    mocks.download.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    mocks.invoke.mockResolvedValue({ data: { mediaUrl: signedUrl, base64: btoa("video"), mimetype: "video/mp4" }, error: null });

    const recovered = await resolveWhatsAppAssessmentVideoBlob(input);
    expect(recovered.type).toBe("video/mp4");
    expect(recovered.size).toBe(5);
  });

  it("can still use the stored message URL if the function rejects at the transport level", async () => {
    mocks.download.mockRejectedValue(new TypeError("Failed to fetch"));
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: new Error("Unavailable") });
    mocks.invoke.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await resolveWhatsAppAssessmentVideoBlob(input)).toBe(video);
    expect(fetch).toHaveBeenCalledWith("https://storage.example.test/previous.mp4", { credentials: "omit" });
  });

  it("retains a usable retry after all downloads fail", async () => {
    mocks.download.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(resolveWhatsAppAssessmentVideoBlob(input)).rejects.toThrow("Não foi possível concluir o download do vídeo");
    mocks.download.mockResolvedValue({ data: video, error: null });
    expect(await resolveWhatsAppAssessmentVideoBlob(input)).toBe(video);
  });

  it("does not recover a stored non-video file as a video", async () => {
    mocks.download.mockResolvedValue({ data: new Blob(["html"], { type: "text/html" }), error: null });
    await expect(resolveWhatsAppAssessmentVideoBlob(input)).rejects.toThrow("O arquivo armazenado não é um vídeo válido");
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects a handoff for another student before reading any private data", async () => {
    await expect(resolveWhatsAppAssessmentVideoBlob({ ...input, studentId: "student-2" })).rejects.toThrow("outro aluno");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("enforces company, student, chat and message filters before downloading", async () => {
    const { chat, message } = setupMessage();
    await resolveWhatsAppAssessmentVideoBlob(input);
    expect(chat.eq.mock.calls).toEqual([["id", "chat-1"], ["company_id", "company-1"], ["student_id", "student-1"]]);
    expect(message.eq.mock.calls).toEqual([["id", "message-1"], ["chat_id", "chat-1"], ["company_id", "company-1"]]);
  });

  it("refuses a missing conversation or a missing message", async () => {
    mocks.from.mockReturnValue(queryResult(null));
    await expect(resolveWhatsAppAssessmentVideoBlob(input)).rejects.toThrow("A conversa não pertence");
    mocks.from.mockImplementation((table) => queryResult(table === "whatsapp_chats" ? { id: "chat-1" } : null));
    await expect(resolveWhatsAppAssessmentVideoBlob(input)).rejects.toThrow("A mensagem de vídeo não foi encontrada");
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each([
    [{ message_id_external: "provider-other" }, "A identidade da mensagem mudou"],
    [{ source: "outgoing" }, "Somente vídeos recebidos"],
    [{ type: "image", media_type: "image/jpeg" }, "não contém um vídeo"],
    [{ media_storage_path: "company-other/chat-1/video.mp4" }, "A referência do vídeo mudou"],
  ])("refuses changed or invalid private media references", async (overrides, error) => {
    setupMessage(overrides);
    await expect(resolveWhatsAppAssessmentVideoBlob(input)).rejects.toThrow(error);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects an out-of-scope storage path even without a persisted path in navigation", async () => {
    setupMessage({ media_storage_path: "company-other/chat-1/video.mp4" });
    await expect(resolveWhatsAppAssessmentVideoBlob({ ...input, handoff: { ...handoff, mediaStoragePath: null } })).rejects.toThrow("não está vinculado");
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });
});
