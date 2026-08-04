import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const managerSource = readFileSync("src/pages/admin/RegistrationManager.tsx", "utf8");
const edgeSource = readFileSync("supabase/functions/public-registration/index.ts", "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Contrato não encontrado: ${start}`);
  return source.slice(startIndex, endIndex);
}

describe("registration funnel safety contracts", () => {
  it("keeps Kanban drag free of conversion and WhatsApp side effects", () => {
    const moveCardSource = sourceBetween(
      managerSource,
      "const moveCardToStage = async",
      "const createFiscalLinkForStudent",
    );

    expect(moveCardSource).not.toContain('action: "convert-lead"');
    expect(moveCardSource).not.toContain('action: "send-link"');
    expect(moveCardSource).not.toContain("openStudentChat(");
    expect(moveCardSource).toContain("Nenhuma mensagem foi enviada");
  });

  it("prepares fiscal registration without sending a message", () => {
    const convertSource = sourceBetween(
      edgeSource,
      "async function convertLeadToFiscal",
      "type RegistrationLink",
    );

    expect(convertSource).toContain("createRegistrationLink(req, studentId)");
    expect(convertSource).not.toContain("sendRegistrationLink(");
    expect(convertSource).toContain("messageSent: false");
  });

  it("does not use the automatic send-link action from the Kanban UI", () => {
    expect(managerSource).not.toContain('action: "send-link"');
    expect(managerSource).toContain("Abrir conversa sem enviar");
    expect(managerSource).toContain("Copiar mensagem");
  });

  it("keeps profile, chat and pre-registration as independent card actions", () => {
    const cardSource = sourceBetween(
      managerSource,
      "{rows.length === 0 ? (",
      "<div className=\"rounded-lg border border-border bg-secondary/30 p-3\">",
    );

    expect(cardSource).toContain("Ver pré-cadastro");
    expect(cardSource).toContain("Abrir conversa");
    expect(cardSource).toContain("Abrir perfil");
    expect(cardSource).not.toContain('onClick={() => {\n                          if (student.entityType === "student")');
  });
});
