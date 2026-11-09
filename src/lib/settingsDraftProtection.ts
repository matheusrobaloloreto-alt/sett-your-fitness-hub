import { createContext, useContext, useEffect, useState } from 'react';

export const SettingsDraftContext = createContext<((id: symbol, pending: boolean) => void) | null>(null);
export const settingsExitEvent = 'sett:before-settings-exit';
export const settingsExitMessage = 'Há alterações não salvas nas configurações. Sair e descartar as alterações?';
let approvedExitDepth = 0;

export function runWithSettingsExitConfirmation(action: () => void) {
  if (!window.dispatchEvent(new Event(settingsExitEvent, { cancelable: true }))) return;
  approvedExitDepth++;
  try { action(); } finally { approvedExitDepth--; }
}

export function settingsExitAlreadyApproved() {
  return approvedExitDepth > 0;
}

export function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = '';
}

export function useSettingsDraft(pending: boolean) {
  const register = useContext(SettingsDraftContext);
  const [id] = useState(() => Symbol());
  useEffect(() => {
    if (!pending) return;
    if (!register) {
      const warn = (event: BeforeUnloadEvent) => warnBeforeUnload(event);
      window.addEventListener('beforeunload', warn);
      return () => window.removeEventListener('beforeunload', warn);
    }
    register(id, true);
    return () => register(id, false);
  }, [id, pending, register]);
}
