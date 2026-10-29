import { expect,it } from "vitest";
import { normalizePlatformProductSettings } from "../../supabase/functions/_shared/platform-product-settings";
it("bounds visual identity to safe colors and image URL, never arbitrary CSS or scripts",()=>{
 const value=normalizePlatformProductSettings({visual:{navy:"#112233",handle:"@synthetic",logo_url:"https://example.org/logo.png"}});
 expect(value.visual.navy).toBe("#112233");expect(value.visual.handle).toBe("@synthetic");
 expect(()=>normalizePlatformProductSettings({visual:{navy:"url(javascript:bad)"}})).toThrow();
 expect(()=>normalizePlatformProductSettings({visual:{logo_url:"javascript:alert(1)"}})).toThrow();
});
