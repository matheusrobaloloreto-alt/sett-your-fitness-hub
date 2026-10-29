import { useEffect, useState } from 'react';
import { DEFAULT_PLATFORM_CONTENT, fetchPublicPlatformContent, type LandingContent } from './platformContent';
export function usePublicPlatformContent() {
  const [content, setContent] = useState<LandingContent>(DEFAULT_PLATFORM_CONTENT.cms);
  useEffect(() => { let active = true; void fetchPublicPlatformContent().then(value => { if (active) setContent(value); }).catch(() => { /* Static public copy remains available when CMS is unavailable. */ }); return () => { active = false; }; }, []);
  return content;
}
