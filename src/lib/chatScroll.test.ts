import { describe, expect, it } from "vitest";
import { isChatViewportNearBottom, shouldAutoScrollChat } from "./chatScroll";

describe("WhatsApp chat scroll policy", () => {
  it("does not steal the viewport while the trainer reads old messages", () => {
    expect(isChatViewportNearBottom({ scrollTop: 320, clientHeight: 600, scrollHeight: 2400 })).toBe(false);
    expect(shouldAutoScrollChat({ isInitialLoad: false, isNearBottom: false, isOwnMessage: false })).toBe(false);
  });

  it("follows the conversation on first load, near the bottom or after an own send", () => {
    expect(shouldAutoScrollChat({ isInitialLoad: true, isNearBottom: false, isOwnMessage: false })).toBe(true);
    expect(shouldAutoScrollChat({ isInitialLoad: false, isNearBottom: true, isOwnMessage: false })).toBe(true);
    expect(shouldAutoScrollChat({ isInitialLoad: false, isNearBottom: false, isOwnMessage: true })).toBe(true);
  });
});
