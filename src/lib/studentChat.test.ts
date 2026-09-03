import { describe, expect, it } from "vitest";
import { normalizeStudentChatPhone } from "./studentChat";

describe("student chat recipient normalization", () => {
  it("keeps an explicit Australian E.164 destination instead of adding Brazil", () => {
    expect(normalizeStudentChatPhone("+61 416 060 587")).toBe("61416060587");
  });

  it("uses the persisted non-Brazilian country for a number stored without plus", () => {
    expect(normalizeStudentChatPhone("61416060587", "AU")).toBe("61416060587");
  });

  it("keeps the legacy Brazilian default for local numbers", () => {
    expect(normalizeStudentChatPhone("(48) 99143-2057", "BR")).toBe("5548991432057");
  });
});
