import { LandingNav } from "@/components/landing/LandingNav";
import { PlatformLandingHero } from "@/components/content/PlatformLandingContent";
import { Differentials } from "@/components/landing/Differentials";
import { Pricing } from "@/components/landing/Pricing";
import { ManifestoFooter } from "@/components/landing/ManifestoFooter";

import { usePublicPlatformContent } from "@/lib/platformContentLanding";

export default function Landing() {
  const content = usePublicPlatformContent();
  return (
    <div className="min-h-screen bg-paper text-foreground">
      <LandingNav />
      <main>
        <PlatformLandingHero content={content} />
        {content.show_differentials && <Differentials />}
        <Pricing />
      </main>
      <ManifestoFooter content={content} />
    </div>
  );
}
