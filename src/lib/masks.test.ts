import { describe, expect, it } from "vitest";
import { formatPhone, formatPhoneForCountry } from "./masks";

describe("phone mask", () => {
  it("preserves an international E.164 number pasted with leading whitespace", () => {
    expect(formatPhone("  +351 912 345 678")).toBe("+351912345678");
  });

  it("keeps the Brazilian visual mask for local numbers", () => {
    expect(formatPhone("48991432057")).toBe("(48) 99143-2057");
  });

  it("does not truncate a stored international number without plus", () => {
    expect(formatPhoneForCountry("351912345678", "PT")).toBe("351912345678");
  });

  it("preserves E.164 formatting for an international number", () => {
    expect(formatPhoneForCountry("+44 7700 900123", "GB")).toBe("+447700900123");
  });
});
