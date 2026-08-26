import type { UploadOptions } from "tus-js-client";

export const STANDARD_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
export const MAX_WHATSAPP_MEDIA_BYTES = 512 * 1024 * 1024;
export const INLINE_VIDEO_MAX_BYTES = 64 * 1024 * 1024;

export function selectWhatsAppUploadMode(size: number): "standard" | "resumable" {
  if (!Number.isFinite(size) || size < 0) throw new Error("Tamanho de arquivo inválido");
  if (size > MAX_WHATSAPP_MEDIA_BYTES) {
    throw new Error("O arquivo ultrapassa o limite de 512 MB");
  }
  return size <= STANDARD_UPLOAD_MAX_BYTES ? "standard" : "resumable";
}

export function describeWhatsAppMediaDelivery(file: Pick<File, "size" | "type">): {
  mediatype: "image" | "video" | "audio" | "document";
  notice: string | null;
} {
  if (file.type.startsWith("video/")) {
    if (file.size > INLINE_VIDEO_MAX_BYTES) {
      return {
        mediatype: "document",
        notice: "Vídeo grande: será enviado como arquivo para preservar a qualidade.",
      };
    }
    return { mediatype: "video", notice: null };
  }
  if (file.type.startsWith("image/")) return { mediatype: "image", notice: null };
  if (file.type.startsWith("audio/")) return { mediatype: "audio", notice: null };
  return { mediatype: "document", notice: null };
}

type UploadCallback = (file: File, path: string, onProgress?: (percentage: number) => void) => Promise<void>;

type TusUploadLike = {
  findPreviousUploads: () => Promise<unknown[]>;
  resumeFromPreviousUpload: (upload: unknown) => void;
  start: () => void;
};

type TusUploadFactory = (body: File, options: UploadOptions) => TusUploadLike;

function directStorageUploadEndpoint(projectUrl: string): string {
  const parsed = new URL(projectUrl);
  if (parsed.hostname.endsWith(".supabase.co")) {
    parsed.hostname = parsed.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  parsed.pathname = "/storage/v1/upload/resumable";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export async function resumableWhatsAppUpload(args: {
  file: File;
  path: string;
  projectUrl: string;
  accessToken: string;
  onProgress?: (percentage: number) => void;
  uploadFactory?: TusUploadFactory;
}): Promise<void> {
  let uploadFactory = args.uploadFactory;
  if (!uploadFactory) {
    const { Upload } = await import("tus-js-client");
    uploadFactory = (body, options) => new Upload(body, options);
  }

  await new Promise<void>((resolve, reject) => {
    const upload = uploadFactory(args.file, {
      endpoint: directStorageUploadEndpoint(args.projectUrl),
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${args.accessToken}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: STANDARD_UPLOAD_MAX_BYTES,
      metadata: {
        bucketName: "whatsapp-media",
        objectName: args.path,
        contentType: args.file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesTotal > 0) args.onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(reject);
  });
}

export async function uploadWhatsAppMediaWith(args: {
  file: File;
  path: string;
  standardUpload: UploadCallback;
  resumableUpload: UploadCallback;
  onProgress?: (percentage: number) => void;
}): Promise<{ path: string; mode: "standard" | "resumable" }> {
  const mode = selectWhatsAppUploadMode(args.file.size);
  const upload = mode === "standard" ? args.standardUpload : args.resumableUpload;
  await upload(args.file, args.path, args.onProgress);
  return { path: args.path, mode };
}
