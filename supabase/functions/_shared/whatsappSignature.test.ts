import { formatSignedWhatsAppMessage } from "./whatsappSignature.ts";

const cases = [
  ["authenticated name", "Bom dia!", "QA Operator", "*QA Operator*\nBom dia!"],
  [
    "existing signature",
    "*QA Operator*\nBom dia!",
    "QA Operator",
    "*QA Operator*\nBom dia!",
  ],
  ["empty caption", "", "QA Operator", "*QA Operator*"],
  ["signature only", "*QA Operator*", "QA Operator", "*QA Operator*"],
  [
    "markdown and newline normalization",
    "Oi",
    " QA\n*Operator*_~` ",
    "*QA Operator*\nOi",
  ],
  [
    "different client prefix",
    "*Forged User*\nOi",
    "QA Operator",
    "*QA Operator*\n*Forged User*\nOi",
  ],
  [
    "non-prefix mention",
    "Oi *QA Operator*",
    "QA Operator",
    "*QA Operator*\nOi *QA Operator*",
  ],
] as const;

for (const [label, content, name, expected] of cases) {
  Deno.test(`signature formatter: ${label}`, () => {
    const actual = formatSignedWhatsAppMessage(content, name);
    if (actual !== expected) {
      throw new Error(
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  });
}

for (const name of ["", " \n\t", "*_~`\n"]) {
  Deno.test(`signature formatter rejects empty normalized name ${JSON.stringify(name)}`, () => {
    let rejected = false;
    try {
      formatSignedWhatsAppMessage("Oi", name);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Accepted an empty normalized signature");
  });
}
