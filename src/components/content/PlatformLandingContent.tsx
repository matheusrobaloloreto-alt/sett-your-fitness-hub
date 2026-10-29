import { Link } from 'react-router-dom';
import { type LandingContent } from '@/lib/platformContent';
export function PlatformLandingHero({ content }: { content: LandingContent }) {
  return <section className="border-b border-line"><div className={`container ${content.layout === 'compact' ? 'py-12' : 'py-20 md:py-32'}`}>
    <p className="text-eyebrow mb-8">— Manifesto / 01</p>
    <h1 className="font-display text-5xl md:text-7xl tracking-tight max-w-5xl whitespace-pre-line break-words">{content.hero_title}</h1>
    <p className="mt-10 max-w-xl text-lg leading-relaxed text-muted-foreground whitespace-pre-line">{content.hero_body}</p>
    <div className="mt-10 flex flex-wrap gap-4"><Link to="/auth?as=trainer" className="bg-navy text-paper px-6 py-3">{content.trainer_cta}</Link><Link to="/auth?as=student" className="border border-foreground px-6 py-3">{content.student_cta}</Link><a href="#planos" className="px-6 py-3">Ver planos ↓</a></div>
  </div></section>;
}
