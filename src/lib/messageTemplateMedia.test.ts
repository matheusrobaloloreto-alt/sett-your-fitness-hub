import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMessageTemplateAttachmentPath, isMessageTemplateSendAcknowledged, parseMessageTemplateAttachments, scopedMessageTemplateAttachments } from "@/lib/messageTemplateMedia";
import { STANDARD_UPLOAD_MAX_BYTES } from "@/lib/whatsappMediaUpload";

const mocks = vi.hoisted(() => ({
  companyId: "company-a" as string | null,
  role: "admin",
  order: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(),
  upload: vi.fn(), remove: vi.fn(), sign: vi.fn(), session: vi.fn(), resumable: vi.fn(),
  success: vi.fn(), error: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: mocks.role, companyId: mocks.companyId }) }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => { mocks.eq(...args); return query; },
        order: mocks.order,
        single: mocks.single,
        maybeSingle: mocks.maybeSingle,
        insert: (...args: unknown[]) => { mocks.insert(...args); return query; },
        update: (...args: unknown[]) => { mocks.update(...args); return query; },
        delete: () => { mocks.delete(); return query; },
      };
      return query;
    },
    auth: { getSession: mocks.session },
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.sign }) },
  },
}));
vi.mock("@/lib/whatsappMediaUpload", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/whatsappMediaUpload")>(),
  resumableWhatsAppUpload: mocks.resumable,
}));

import WhatsAppTemplates from "@/pages/admin/WhatsAppTemplates";

const attachment = {
  path: "company-a/templates/template-a/file-a.png",
  name: "foto.png", mimeType: "image/png", size: 123,
};
const existingTemplate = {
  id: "template-a", title: "Existente", name: "Existente", content: "Olá {{nome}}",
  shortcut: "ola", attachments: [attachment],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.companyId = "company-a";
  mocks.role = "admin";
  mocks.order.mockResolvedValue({ data: [], error: null });
  mocks.single.mockResolvedValue({ data: { id: "saved-template" }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://signed.example/media" }, error: null });
  mocks.session.mockResolvedValue({ data: { session: { access_token: "test-session" } }, error: null });
  mocks.resumable.mockResolvedValue(undefined);
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("message template attachment contract", () => {
  it("requires a positive acknowledgement and an identifier, including persistence-warning responses", () => {
    for (const payload of [null, [], {}, { success: false, messageId: "provider-id" }, { ok: true },
      { success: true, messageId: " " }, { ok: true, message: { id: 123 } }, { success: false, ok: true, messageId: "provider-id" }]) {
      expect(isMessageTemplateSendAcknowledged(payload)).toBe(false);
    }
    expect(isMessageTemplateSendAcknowledged({ success: true, messageId: "provider-id", message: null, persistenceWarning: true })).toBe(true);
    expect(isMessageTemplateSendAcknowledged({ ok: true, message: { id: "saved-id" } })).toBe(true);
  });
  it("rejects cross-company and cross-template paths without silently dropping parts", () => {
    expect(scopedMessageTemplateAttachments(undefined, "company-a", "template-a")).toEqual([]);
    expect(scopedMessageTemplateAttachments([attachment], "company-a", "template-a")).toEqual([attachment]);
    expect(() => scopedMessageTemplateAttachments([attachment], "company-b", "template-a")).toThrow();
    expect(() => scopedMessageTemplateAttachments([attachment], "company-a", "template-b")).toThrow();
    expect(() => scopedMessageTemplateAttachments([attachment, {}], "company-a", "template-a")).toThrow();
    expect(() => scopedMessageTemplateAttachments({}, "company-a", "template-a")).toThrow();
    expect(() => scopedMessageTemplateAttachments([attachment], null, "template-a")).toThrow();
  });
  it("accepts ordered image, video, audio and document metadata without extra properties", () => {
    const entries = ["image/png", "video/mp4", "audio/ogg", "application/pdf"].map((mimeType, index) => ({
      ...attachment, mimeType, path: `company-a/templates/template-a/file-${index}.bin`, extra: "ignored",
    }));
    expect(parseMessageTemplateAttachments(entries)).toEqual(entries.map(({ extra: _extra, ...entry }) => entry));
    expect(parseMessageTemplateAttachments([attachment])).not.toBe(attachment);
  });

  it.each([undefined, null, {}, "[]", 1])("keeps legacy non-array values harmless (%s)", (value) => {
    expect(parseMessageTemplateAttachments(value)).toEqual([]);
  });

  it("rejects malformed fields, non-finite or fractional sizes and unsafe storage paths", () => {
    const invalid = [
      null, [], 1, {}, { ...attachment, name: " " }, { ...attachment, size: "1" },
      { ...attachment, size: -1 }, { ...attachment, size: NaN }, { ...attachment, size: Infinity },
      { ...attachment, size: 1.5 }, { ...attachment, size: Number.MAX_SAFE_INTEGER + 1 },
      { ...attachment, mimeType: "image" }, { ...attachment, mimeType: "text/html; charset=utf-8" },
      ...["../file.png", "company-a/templates/template-a/../file.png", "company-a/chat/file.png",
        "/company-a/templates/template-a/file.png", "https://example.com/file.png",
        "company-a/templates/template-a/file.png?token=secret", "company-a/templates/template-a/%2e%2e.png",
      ].map((path) => ({ ...attachment, path })),
    ];
    expect(parseMessageTemplateAttachments([...invalid, attachment])).toEqual([attachment]);
  });

  it("creates randomized company/template paths and sanitizes file extensions", () => {
    expect(createMessageTemplateAttachmentPath("company-a", "template-a", "minha foto.JPG"))
      .toBe("company-a/templates/template-a/00000000-0000-4000-8000-000000000001.jpg");
    expect(createMessageTemplateAttachmentPath("company-a", "template-a", "README")).toMatch(/\.bin$/);
    expect(createMessageTemplateAttachmentPath("company-a", "template-a", "name.mp4?x=1")).toMatch(/\.mp4x1$/);
    expect(() => createMessageTemplateAttachmentPath("../company", "template-a", "photo.png")).toThrow();
    expect(() => createMessageTemplateAttachmentPath("company-a", "template/a", "photo.png")).toThrow();
  });
});

async function openNew() {
  const view = render(createElement(WhatsAppTemplates));
  await screen.findByText("Nenhum template criado.");
  fireEvent.click(screen.getByRole("button", { name: /Novo/ }));
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: " Boas-vindas " } });
  return view;
}

async function uploadFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText("Selecionar anexos"), { target: { files } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Anexar" })).toBeEnabled());
}

describe("WhatsApp template editor", () => {
  it.each(["cancel", "unmount", "company switch"])("retains submitted files after a committed save loses its ACK and reconciliation fails: %s", async (action) => {
    const view = await openNew();
    await uploadFiles([new File(["pdf"], "manual.pdf", { type: "application/pdf" })]);
    let committed: unknown;
    mocks.insert.mockImplementation((payload) => { committed = payload; });
    mocks.single.mockRejectedValueOnce(new Error("ACK lost"));
    mocks.maybeSingle.mockRejectedValueOnce(new Error("read unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("ACK lost"));
    expect(committed).toMatchObject({ attachments: [{ path: mocks.upload.mock.calls[0][0] }] });
    if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    else if (action === "unmount") view.unmount();
    else { await act(async () => { mocks.companyId = "company-b"; view.rerender(createElement(WhatsAppTemplates)); }); }
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("reconciles a committed save before retry without repeating the insert", async () => {
    await openNew();
    await uploadFiles([new File(["pdf"], "manual.pdf", { type: "application/pdf" })]);
    let committed: Record<string, unknown>;
    mocks.insert.mockImplementation((payload) => { committed = payload; });
    mocks.single.mockRejectedValueOnce(new Error("ACK lost"));
    mocks.maybeSingle.mockRejectedValueOnce(new Error("read unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("ACK lost"));
    mocks.maybeSingle.mockImplementationOnce(async () => ({ data: committed, error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Template criado"));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("id", "00000000-0000-4000-8000-000000000001");
    expect(mocks.eq).toHaveBeenCalledWith("company_id", "company-a");
  });

  it("recognizes an exact saved snapshot when the initial ACK is lost", async () => {
    await openNew();
    await uploadFiles([new File(["pdf"], "manual.pdf", { type: "application/pdf" })]);
    let committed: Record<string, unknown>;
    mocks.insert.mockImplementation((payload) => { committed = payload; });
    mocks.single.mockRejectedValueOnce(new Error("ACK lost"));
    mocks.maybeSingle.mockImplementationOnce(async () => ({ data: committed, error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Template criado"));
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("requires text or media, then saves media-only templates using name=title and the upload template ID", async () => {
    await openNew();
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
    await uploadFiles([
      new File(["photo"], "foto.png", { type: "image/png" }),
      new File(["document"], "manual.pdf", { type: "application/pdf" }),
    ]);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Template criado"));
    const payload = mocks.insert.mock.calls[0][0];
    expect(payload).toMatchObject({ id: "00000000-0000-4000-8000-000000000001", company_id: "company-a", name: "Boas-vindas", title: "Boas-vindas", content: "", shortcut: null });
    expect(payload).not.toHaveProperty("created_by");
    expect(payload.attachments).toHaveLength(2);
    for (const [index, item] of payload.attachments.entries()) {
      expect(item.path).toBe(mocks.upload.mock.calls[index][0]);
      expect(item.path).toContain(`company-a/templates/${payload.id}/`);
    }
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("saves legacy text templates with an empty attachment list", async () => {
    await openNew();
    fireEvent.change(screen.getByLabelText("Conteúdo"), { target: { value: " Olá {{nome}} " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalled());
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ name: "Boas-vindas", content: "Olá {{nome}}", attachments: [] });
  });

  it("routes large media through the existing resumable uploader and displays progress", async () => {
    await openNew();
    let finish!: () => void;
    mocks.resumable.mockImplementation((args) => {
      args.onProgress(42);
      return new Promise<void>((resolve) => { finish = resolve; });
    });
    fireEvent.change(screen.getByLabelText("Selecionar anexos"), {
      target: { files: [new File([new Uint8Array(STANDARD_UPLOAD_MAX_BYTES + 1)], "video.mp4", { type: "video/mp4" })] },
    });
    await screen.findByText("42%");
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await act(async () => { finish(); });
    await screen.findByRole("button", { name: "Remover video.mp4" });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.resumable.mock.calls[0][0].path).toContain("company-a/templates/");
  });

  it("keeps the editor and media on save failure and reports the database error", async () => {
    await openNew();
    await uploadFiles([new File(["pdf"], "manual.pdf", { type: "application/pdf" })]);
    mocks.single.mockResolvedValueOnce({ data: null, error: { message: "attachments column missing" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("attachments column missing"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Template criado"));
  });

  it("excludes failed uploads while retaining successful files in a batch", async () => {
    await openNew();
    mocks.upload.mockResolvedValueOnce({ error: { message: "storage denied" } });
    await uploadFiles([
      new File(["pdf"], "failed.pdf", { type: "application/pdf" }),
      new File(["ogg"], "audio.ogg", { type: "audio/ogg" }),
    ]);
    expect(mocks.error).toHaveBeenCalledWith("failed.pdf: storage denied");
    expect(screen.queryByRole("button", { name: "Remover failed.pdf" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover audio.ogg" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalled());
    expect(mocks.insert.mock.calls[0][0].attachments).toHaveLength(1);
  });

  it("removes new draft files on removal/cancel, but leaves saved media intact when editing is cancelled", async () => {
    const view = await openNew();
    await uploadFiles([new File(["pdf"], "manual.pdf", { type: "application/pdf" })]);
    fireEvent.click(screen.getByRole("button", { name: "Remover manual.pdf" }));
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
    await uploadFiles([new File(["pdf"], "other.pdf", { type: "application/pdf" })]);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    view.unmount();

    mocks.order.mockResolvedValue({ data: [existingTemplate], error: null });
    render(createElement(WhatsAppTemplates));
    fireEvent.click(await screen.findByRole("button", { name: "Editar Existente" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover foto.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates only the matching template and company, preserving ordered attachments", async () => {
    mocks.order.mockResolvedValue({ data: [existingTemplate], error: null });
    render(createElement(WhatsAppTemplates));
    fireEvent.click(await screen.findByRole("button", { name: "Editar Existente" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Renomeado" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Template atualizado"));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: "Renomeado", title: "Renomeado", attachments: [attachment] }));
    expect(mocks.eq).toHaveBeenCalledWith("id", "template-a");
    expect(mocks.eq).toHaveBeenCalledWith("company_id", "company-a");
  });

  it("blocks edits of media from another company or template without silently discarding it", async () => {
    mocks.order.mockResolvedValue({ data: [{ ...existingTemplate, attachments: [{ ...attachment, path: "company-b/templates/template-a/file.png" }] }], error: null });
    render(createElement(WhatsAppTemplates));
    fireEvent.click(await screen.findByRole("button", { name: "Editar Existente" }));
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("anexos inválidos"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("does not carry late uploads into a different company and cleans up their draft paths", async () => {
    const view = await openNew();
    let finish!: (value: unknown) => void;
    mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText("Selecionar anexos"), { target: { files: [new File(["pdf"], "manual.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    mocks.companyId = "company-b";
    view.rerender(createElement(WhatsAppTemplates));
    await act(async () => { finish({ error: null }); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not delete submitted media when switching companies during a save", async () => {
    const view = await openNew();
    await uploadFiles([new File(["pdf"], "manual.pdf", { type: "application/pdf" })]);
    let finish!: (value: unknown) => void;
    mocks.single.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalled());
    mocks.companyId = "company-b";
    view.rerender(createElement(WhatsAppTemplates));
    await act(async () => { finish({ data: { id: "saved" }, error: null }); });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("never reads unscoped templates when a master has not selected a company", async () => {
    mocks.role = "master";
    render(createElement(WhatsAppTemplates));
    expect(await screen.findByText("Selecione uma empresa.")).toBeInTheDocument();
    expect(mocks.order).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Novo/ })).toBeDisabled();
  });

  it("reports load and delete errors instead of false empty states or success", async () => {
    mocks.order.mockResolvedValueOnce({ data: null, error: { message: "read failed" } });
    render(createElement(WhatsAppTemplates));
    expect(await screen.findByText("Não foi possível carregar os templates.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum template criado.")).not.toBeInTheDocument();
    mocks.order.mockResolvedValue({ data: [existingTemplate], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir Existente" }));
    mocks.single.mockResolvedValueOnce({ data: null, error: { message: "delete denied" } });
    fireEvent.click(screen.getByRole("button", { name: /^Excluir$/ }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("delete denied"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("rejects oversize files before storage and retains the editable draft", async () => {
    await openNew();
    const file = new File(["synthetic"], "oversize.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 512 * 1024 * 1024 + 1 });
    await uploadFiles([file]);
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("512 MB"));
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.resumable).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Remover oversize.mp4" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ignores a prior-company template load resolving after the current company", async () => {
    let finish!: (value: unknown) => void;
    mocks.order.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(createElement(WhatsAppTemplates));
    mocks.companyId = "company-b";
    mocks.order.mockResolvedValueOnce({ data: [{ ...existingTemplate, title: "Empresa B" }], error: null });
    view.rerender(createElement(WhatsAppTemplates));
    await screen.findByRole("button", { name: "Editar Empresa B" });
    await act(async () => { finish({ data: [existingTemplate], error: null }); });
    expect(screen.queryByRole("button", { name: "Editar Existente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Empresa B" })).toBeInTheDocument();
  });
});
