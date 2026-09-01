import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/admin/WhatsAppChat.tsx"),
  "utf8",
);

const preRegistrationPopover = source.match(
  /<PopoverContent[\s\S]*?Pré-cadastro completo[\s\S]*?<\/PopoverContent>/,
)?.[0] ?? "";

describe("WhatsApp pre-registration popover", () => {
  it("bounds the panel to the available viewport and keeps only the body scrollable", () => {
    expect(source).toContain('aria-label="Abrir pré-cadastro"');
    expect(preRegistrationPopover).toContain("collisionPadding={8}");
    expect(preRegistrationPopover).toContain(
      "max-h-[min(var(--radix-popover-content-available-height,calc(100dvh-1rem)),calc(100dvh-1rem))]",
    );
    expect(preRegistrationPopover).toContain("flex-col");
    expect(preRegistrationPopover).toContain(
      '<div className="shrink-0 border-b border-border px-4 py-3">',
    );
    expect(preRegistrationPopover).toContain(
      '<ScrollArea className="min-h-0 flex-1">',
    );
    expect(preRegistrationPopover).not.toContain('className="max-h-[72vh]"');
  });
});
