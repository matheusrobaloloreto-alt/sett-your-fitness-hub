import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { Differentials } from "@/components/landing/Differentials";
import { Pricing } from "@/components/landing/Pricing";
import { ManifestoFooter } from "@/components/landing/ManifestoFooter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper text-foreground">
      <LandingNav />
      <main>
        <Hero />
        <Differentials />
        <Pricing />
      </main>
      <ManifestoFooter />
    </div>
  );
}
