import { useEffect, useState } from "react";

export function useWhatsAppSignature(userId: string | undefined, companyId: string | null | undefined) {
  const key = userId && companyId ? `sett:whatsapp-signature:${companyId}:${userId}` : null;
  const readPreference = (storageKey: string | null) => {
    try { return Boolean(storageKey && localStorage.getItem(storageKey) === "true"); }
    catch { return false; }
  };
  const [preference, setPreference] = useState(() => ({ key, enabled: readPreference(key) }));
  useEffect(() => {
    setPreference({ key, enabled: readPreference(key) });
    const synchronize = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setPreference({ key, enabled: readPreference(key) });
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, [key]);
  const enabled = Boolean(key && (preference.key === key ? preference.enabled : readPreference(key)));
  const setEnabled = (value: boolean) => {
    if (!key) return;
    setPreference({ key, enabled: value });
    try { localStorage.setItem(key, String(value)); } catch { /* Keep the preference for this session. */ }
  };
  return [enabled, setEnabled] as const;
}
