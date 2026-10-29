import { useState } from 'react';
import { Info } from 'lucide-react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface SettingHelpProps { label: string; what: string; edits: string; effect: string }
/** A non-submitting help button. Portal + collision padding keep help inside the viewport. */
export function SettingHelp({ label, what, edits, effect }: SettingHelpProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (hover || focus || pinned);
  const dismiss = () => { setPinned(false); setDismissed(true); };
  return <TooltipProvider delayDuration={0}><Tooltip open={open}>
    <span className="inline-flex align-middle" onMouseEnter={() => { setHover(true); setDismissed(false); }} onMouseLeave={() => setHover(false)}>
      <TooltipTrigger asChild><button type="button" aria-label={`Sobre ${label}`} aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onFocus={() => { setFocus(true); setDismissed(false); }} onBlur={() => { setFocus(false); setPinned(false); }}
        onClick={() => { if (pinned) dismiss(); else { setPinned(true); setDismissed(false); } }}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } }}><Info aria-hidden="true" className="h-4 w-4" /></button></TooltipTrigger>
    </span>
    <TooltipPrimitive.Portal><TooltipContent side="bottom" align="start" sideOffset={4} avoidCollisions collisionPadding={16}
      onEscapeKeyDown={dismiss}
      className="w-64 max-w-[calc(100vw-2rem)] space-y-2 break-words p-3 text-left text-sm font-normal">
      <span className="block"><strong>O que é: </strong>{what}</span><span className="block"><strong>O que muda: </strong>{edits}</span><span className="block"><strong>Efeito: </strong>{effect}</span>
    </TooltipContent></TooltipPrimitive.Portal>
  </Tooltip></TooltipProvider>;
}
