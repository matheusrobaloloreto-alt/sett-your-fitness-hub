import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { personalThemeStorageKey } from "@/lib/personalTheme";
import { SUPABASE_AUTH_STORAGE_KEY } from "@/lib/supabaseAuthStorage";

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: "user-a" },
    role: "admin",
    companyId: "company-1",
    loading: false,
  },
  master: {
    viewingCompany: null,
    isViewingCompany: false,
  },
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@/contexts/MasterContext", () => ({
  useMaster: () => mocks.master,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mocks.supabase,
}));

const platformSettings = {
  id: "platform-settings-1",
  primary_color: "#1D2D5C",
  background_color: "#FAFAF7",
  card_color: "#F2F0EA",
  text_color: "#0A0A0A",
  platform_title: "SETT",
  logo_url: null,
  layout_style: "classico",
  company_id: "company-1",
};

let systemDark = false;
let mediaListener: (() => void) | null = null;

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, String(value))),
  };
}

function createQuery(data = platformSettings) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function ThemeProbe() {
  const { themeMode, setThemeMode } = useTheme();
  return (
    <div>
      <span data-testid="theme-mode">{themeMode}</span>
      <button type="button" onClick={() => setThemeMode("dark")}>Escuro</button>
      <button type="button" onClick={() => setThemeMode("light")}>Claro</button>
    </div>
  );
}

describe("ThemeProvider personal theme isolation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: makeStorage(),
    });
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme-mode");
    mocks.auth.user = { id: "user-a" };
    mocks.auth.role = "admin";
    mocks.auth.companyId = "company-1";
    mocks.auth.loading = false;
    mocks.master.viewingCompany = null;
    mocks.master.isViewingCompany = false;
    mocks.supabase.from.mockImplementation(() => createQuery());
    systemDark = false;
    mediaListener = null;
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? systemDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, listener: EventListenerOrEventListenerObject) => {
        mediaListener = typeof listener === "function" ? () => listener(new Event("change")) : null;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("does not leak user A preference to user B on the same device", async () => {
    window.localStorage.setItem(personalThemeStorageKey("user-a"), "light");
    systemDark = true;

    const view = renderProvider();
    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("light"));

    mocks.auth.user = { id: "user-b" };
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark"));
    expect(window.localStorage.getItem(personalThemeStorageKey("user-b"))).toBeNull();
  });

  it("keeps an explicit choice when the system color scheme changes later", async () => {
    systemDark = false;
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("light"));

    await act(async () => {
      screen.getByRole("button", { name: "Escuro" }).click();
    });
    expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark");

    systemDark = false;
    act(() => {
      mediaListener?.();
    });

    expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark");
  });

  it("syncs a same-user storage event without adopting another user's preference", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("light"));

    act(() => {
      window.localStorage.setItem(personalThemeStorageKey("user-b"), "dark");
      window.dispatchEvent(new StorageEvent("storage", {
        key: personalThemeStorageKey("user-b"),
        newValue: "dark",
      }));
    });
    expect(screen.getByTestId("theme-mode")).toHaveTextContent("light");

    act(() => {
      window.localStorage.setItem(personalThemeStorageKey("user-a"), "dark");
      window.dispatchEvent(new StorageEvent("storage", {
        key: personalThemeStorageKey("user-a"),
        newValue: "dark",
      }));
    });

    expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark");
  });

  it("keeps the persisted session user scope while auth is still loading", async () => {
    window.localStorage.setItem("sb-oldproject-auth-token", JSON.stringify({
      user: { id: "old-user" },
    }));
    window.localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify({
      user: { id: "delayed-user" },
    }));
    window.localStorage.setItem(personalThemeStorageKey("old-user"), "light");
    window.localStorage.setItem(personalThemeStorageKey("delayed-user"), "dark");
    systemDark = false;
    mocks.auth.user = null;
    mocks.auth.loading = true;

    const view = renderProvider();

    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark"));
    expect(document.documentElement.dataset.themeMode).toBe("dark");

    mocks.auth.user = { id: "delayed-user" };
    mocks.auth.loading = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark"));
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });

  it("does not lose an in-memory choice after storage quota failure and settings refetch", async () => {
    const setItem = window.localStorage.setItem as unknown as ReturnType<typeof vi.fn>;
    setItem.mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const view = renderProvider();
    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("light"));

    await act(async () => {
      screen.getByRole("button", { name: "Escuro" }).click();
    });
    expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark");

    mocks.auth.companyId = "company-2";
    mocks.supabase.from.mockImplementation(() => createQuery({
      ...platformSettings,
      id: "platform-settings-2",
      primary_color: "#7A4C19",
      company_id: "company-2",
    }));

    await act(async () => {
      view.rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ThemeProvider>
            <ThemeProbe />
          </ThemeProvider>
        </QueryClientProvider>,
      );
    });

    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark"));
  });
});
