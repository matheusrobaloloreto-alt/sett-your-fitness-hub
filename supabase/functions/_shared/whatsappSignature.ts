export function normalizeWhatsAppSignatureName(name: string): string {
  return name.replace(/[\r\n*_~`]/g, " ").replace(/\s+/g, " ").trim();
}

export function formatSignedWhatsAppMessage(content: string, name: string): string {
  const signature = normalizeWhatsAppSignatureName(name);
  if (!signature) throw new Error("Preencha seu nome no perfil antes de assinar mensagens.");
  const prefix = `*${signature}*`;
  const text = content.trim();
  return text === prefix || text.startsWith(`${prefix}\n`) ? text : `${prefix}\n${text}`.trim();
}
