import { describe, expect, it } from "vitest";
import {
  MAX_WHATSAPP_MEDIA_BYTES,
  STANDARD_UPLOAD_MAX_BYTES,
  describeWhatsAppMediaDelivery,
  resumableWhatsAppUpload,
  selectWhatsAppUploadMode,
  uploadWhatsAppMediaWith,
} from "@/lib/whatsappMediaUpload";

describe("WhatsApp media upload policy", () => {
  it("uses resumable transfer once a file is larger than the reliable standard-upload range", () => {
    expect(selectWhatsAppUploadMode(STANDARD_UPLOAD_MAX_BYTES)).toBe("standard");
    expect(selectWhatsAppUploadMode(STANDARD_UPLOAD_MAX_BYTES + 1)).toBe("resumable");
  });

  it("rejects files beyond the product limit before starting a transfer", () => {
    expect(() => selectWhatsAppUploadMode(MAX_WHATSAPP_MEDIA_BYTES + 1))
      .toThrow("O arquivo ultrapassa o limite de 512 MB");
  });

  it("sends long videos as documents so the provider does not reject the inline-video path", () => {
    expect(describeWhatsAppMediaDelivery({ type: "video/mp4", size: 12 * 1024 * 1024 }))
      .toEqual({ mediatype: "video", notice: null });
    expect(describeWhatsAppMediaDelivery({ type: "video/mp4", size: 80 * 1024 * 1024 }))
      .toEqual({
        mediatype: "document",
        notice: "Vídeo grande: será enviado como arquivo para preservar a qualidade.",
      });
  });

  it("routes large files through the resumable uploader and reports its progress", async () => {
    const calls: string[] = [];
    const progress: number[] = [];
    const file = new File([new Uint8Array(STANDARD_UPLOAD_MAX_BYTES + 1)], "video.mp4", { type: "video/mp4" });

    const result = await uploadWhatsAppMediaWith({
      file,
      path: "company/chat/video.mp4",
      standardUpload: async () => { calls.push("standard"); },
      resumableUpload: async (_file, _path, onProgress) => {
        calls.push("resumable");
        onProgress?.(25);
        onProgress?.(100);
      },
      onProgress: (value) => progress.push(value),
    });

    expect(result).toEqual({ path: "company/chat/video.mp4", mode: "resumable" });
    expect(calls).toEqual(["resumable"]);
    expect(progress).toEqual([25, 100]);
  });

  it("uploads large media to the direct storage host in fixed 6 MB chunks", async () => {
    let options: any;
    const progress: number[] = [];
    const file = new File([new Uint8Array(12)], "clip.mp4", { type: "video/mp4" });

    await resumableWhatsAppUpload({
      file,
      path: "company/chat/clip.mp4",
      projectUrl: "https://demo.supabase.co",
      accessToken: "session-token",
      onProgress: (percentage) => progress.push(percentage),
      uploadFactory: (_body, suppliedOptions) => {
        options = suppliedOptions;
        return {
          findPreviousUploads: async () => [],
          resumeFromPreviousUpload: () => undefined,
          start: () => {
            suppliedOptions.onProgress?.(6, 12);
            suppliedOptions.onSuccess?.();
          },
        };
      },
    });

    expect(options.endpoint).toBe("https://demo.storage.supabase.co/storage/v1/upload/resumable");
    expect(options.chunkSize).toBe(6 * 1024 * 1024);
    expect(options.headers).toEqual({ authorization: "Bearer session-token", "x-upsert": "false" });
    expect(options.metadata).toMatchObject({
      bucketName: "whatsapp-media",
      objectName: "company/chat/clip.mp4",
      contentType: "video/mp4",
    });
    expect(progress).toEqual([50]);
  });
});
