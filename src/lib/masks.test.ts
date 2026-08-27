import { describe, expect, it } from "vitest";
import { formatPhone } from "./masks";

describe("phone mask", () => {
  it("preserves an international E.164 number pasted with leading whitespace", () => {
    expect(formatPhone("  +351 912 345 678")).toBe("+351912345678");
  });

  it("keeps the Brazilian visual mask for local numbers", () => {
    expect(formatPhone("48991432057")).toBe("(48) 99143-2057");
  });
});
