import { expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { DEFAULT_PLATFORM_PRODUCT_SETTINGS, savePlatformProductSettings } from "./platformSettingsClient";
it("rejects invalid expected versions before any write", async () => {
  rpc.mockReset();
  await expect(savePlatformProductSettings(DEFAULT_PLATFORM_PRODUCT_SETTINGS, -1)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it("requires the next version in a successful server envelope", async () => {
  rpc.mockResolvedValue({ data: { settings: DEFAULT_PLATFORM_PRODUCT_SETTINGS, version: 1 },error:null });
  await expect(savePlatformProductSettings(DEFAULT_PLATFORM_PRODUCT_SETTINGS,1)).rejects.toThrow();
});
it.each(["PT409","40001"])("surfaces %s OCC without silently overwriting a competing save", async code => {
  rpc.mockClear();rpc.mockResolvedValue({ data:null,error:{ code } });
  await expect(savePlatformProductSettings(DEFAULT_PLATFORM_PRODUCT_SETTINGS,1)).rejects.toThrow(/outro master/);
  expect(rpc).toHaveBeenCalledTimes(1);
});
