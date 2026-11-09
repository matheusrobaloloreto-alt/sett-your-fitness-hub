import { useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';
import { SettingsDraftContext, settingsExitAlreadyApproved, settingsExitEvent, settingsExitMessage, warnBeforeUnload } from '@/lib/settingsDraftProtection';

export function SettingsDraftGuard({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Set<symbol>>(() => new Set());
  const register = useCallback((id: symbol, pending: boolean) => {
    setDrafts(previous => {
      if (previous.has(id) === pending) return previous;
      const next = new Set(previous);
      if (pending) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const hasDrafts = drafts.size > 0;
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const { pathname } = useLocation();
  const [editorPathname] = useState(pathname);

  useEffect(() => {
    // The route animation can keep the outgoing screen mounted briefly.
    if (!hasDrafts || pathname !== editorPathname) return;
    const normalized = (path: string) => path.replace(/\/+$/, '').toLowerCase();
    const samePage = (path?: string) => !path || normalized(path) === normalized(pathname);
    const pathOf = (to: Parameters<typeof navigator.push>[0]) =>
      typeof to === 'string' ? to.split(/[?#]/, 1)[0] : to.pathname;

    // BrowserRouter doesn't provide useBlocker. Scope its navigator to this
    // mounted editor, letting same-page tab changes and session redirects pass.
    const { push, replace, go } = navigator;
    let current = { state: window.history.state, url: window.location.href };
    const readPosition = () => { current = { state: window.history.state, url: window.location.href }; };
    const allowExit = () => settingsExitAlreadyApproved() || window.confirm(settingsExitMessage);
    let restorePending = false;
    const onExplicitExit = (event: Event) => { if (restorePending || !allowExit()) event.preventDefault(); };
    const onPopState = (event: PopStateEvent) => {
      const currentIndex: unknown = current.state?.idx;
      const nextIndex: unknown = event.state?.idx;
      if (restorePending) {
        restorePending = false;
        if (window.location.href !== current.url || event.state?.key !== current.state?.key) {
          window.history.pushState(current.state, '', current.url);
        }
        event.stopImmediatePropagation();
        return;
      }
      if (!samePage(window.location.pathname) && !allowExit()) {
        event.stopImmediatePropagation();
        if (typeof currentIndex === 'number' && typeof nextIndex === 'number' && currentIndex !== nextIndex) {
          restorePending = true;
          window.history.go(currentIndex - nextIndex);
        } else {
          // Untracked same-document entry: restore this editor without replaying a guessed offset.
          window.history.pushState(current.state, '', current.url);
        }
        return;
      }
      readPosition();
    };
    navigator.push = (...args) => {
      if (restorePending || (!samePage(pathOf(args[0])) && !allowExit())) return;
      push.apply(navigator, args);
      readPosition();
    };
    navigator.replace = (...args) => {
      const target = pathOf(args[0]);
      const sessionRedirect = target === '/' || target === '/auth';
      if (!sessionRedirect && (restorePending || (!samePage(target) && !allowExit()))) return;
      replace.apply(navigator, args);
      readPosition();
    };
    navigator.go = delta => { if (!restorePending) go.call(navigator, delta); };
    window.addEventListener('beforeunload', warnBeforeUnload);
    window.addEventListener('popstate', onPopState, true);
    window.addEventListener(settingsExitEvent, onExplicitExit);
    return () => {
      navigator.push = push;
      navigator.replace = replace;
      navigator.go = go;
      window.removeEventListener('beforeunload', warnBeforeUnload);
      window.removeEventListener('popstate', onPopState, true);
      window.removeEventListener(settingsExitEvent, onExplicitExit);
    };
  }, [editorPathname, hasDrafts, navigator, pathname]);

  return <SettingsDraftContext.Provider value={register}>{children}</SettingsDraftContext.Provider>;
}
