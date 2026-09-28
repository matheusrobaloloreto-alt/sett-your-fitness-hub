import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWhatsAppSignature } from "./useWhatsAppSignature";

const key = (user: string, company: string) => `sett:whatsapp-signature:${company}:${user}`;

describe("WhatsApp signature preference", () => {
  let values: Map<string, string>;
  let getItem: ReturnType<typeof vi.fn>;
  let setItem: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    values = new Map();
    getItem = vi.fn((storageKey: string) => values.get(storageKey) ?? null);
    setItem = vi.fn((storageKey: string, value: string) => values.set(storageKey, value));
    vi.stubGlobal("localStorage", { getItem, setItem });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("começa desligada e só aceita a preferência true explícita", () => {
    const { result, rerender } = renderHook(() => useWhatsAppSignature("user-a", "company-a"));
    expect(result.current[0]).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    values.set(key("user-a", "company-a"), "invalid");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: key("user-a", "company-a") })));
    rerender();
    expect(result.current[0]).toBe(false);
  });

  it("persiste ON/OFF ao reabrir para o mesmo profissional e empresa", () => {
    const first = renderHook(() => useWhatsAppSignature("user-a", "company-a"));
    act(() => first.result.current[1](true));
    expect(values.get(key("user-a", "company-a"))).toBe("true");
    first.unmount();
    const reopened = renderHook(() => useWhatsAppSignature("user-a", "company-a"));
    expect(reopened.result.current[0]).toBe(true);
    act(() => reopened.result.current[1](false));
    expect(values.get(key("user-a", "company-a"))).toBe("false");
    reopened.unmount();
    expect(renderHook(() => useWhatsAppSignature("user-a", "company-a")).result.current[0]).toBe(false);
  });

  it("não transfere a preferência entre profissionais ou empresas", () => {
    const { result, rerender } = renderHook(({ user, company }) => useWhatsAppSignature(user, company), {
      initialProps: { user: "user-a", company: "company-a" },
    });
    act(() => result.current[1](true));
    rerender({ user: "user-b", company: "company-a" });
    expect(result.current[0]).toBe(false);
    rerender({ user: "user-a", company: "company-b" });
    expect(result.current[0]).toBe(false);
    rerender({ user: "user-a", company: "company-a" });
    expect(result.current[0]).toBe(true);
  });

  it("não habilita nem grava sem identidade completa", () => {
    const { result, rerender } = renderHook(({ user, company }: { user?: string; company?: string }) => useWhatsAppSignature(user, company), {
      initialProps: { user: undefined, company: "company-a" },
    });
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(false);
    rerender({ user: "user-a", company: undefined });
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("mantém a preferência da sessão quando o storage está bloqueado", () => {
    getItem.mockImplementation(() => { throw new Error("blocked"); });
    setItem.mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useWhatsAppSignature("user-a", "company-a"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it("sincroniza outra aba, ignora outro escopo e respeita a limpeza", () => {
    const { result } = renderHook(() => useWhatsAppSignature("user-a", "company-a"));
    values.set(key("user-a", "company-a"), "true");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: key("user-b", "company-a") })));
    expect(result.current[0]).toBe(false);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: key("user-a", "company-a") })));
    expect(result.current[0]).toBe(true);
    values.clear();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(result.current[0]).toBe(false);
  });
});
