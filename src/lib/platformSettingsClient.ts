import { supabase } from "@/integrations/supabase/client";
import {isSettingsConflict} from "./settingsConflict";
import { getPlatformProductSettings, normalizePlatformProductSettings, publicPlatformCatalog, DEFAULT_PLATFORM_PRODUCT_SETTINGS, type PlatformProductSettings, type PlatformSettingsClient } from "../../supabase/functions/_shared/platform-product-settings";
export * from "../../supabase/functions/_shared/platform-product-settings";
export const FEATURE_LABELS = { hasPrescription: "Prescrição", hasDashboard: "Dashboard", hasRegistration: "Cadastro", hasAnamnesis: "Anamnese", hasStudents: "Alunos", hasAgenda: "Agenda", hasTeam: "Equipe", hasPlans: "Planos", hasAppearance: "Aparência", hasFinancial: "Financeiro", hasWhatsApp: "WhatsApp", hasAutomation: "Automação" };
export type PlatformSettingsEnvelope = { settings: PlatformProductSettings; version: number };
export async function fetchPlatformProductSettings(): Promise<PlatformSettingsEnvelope> {
  return getPlatformProductSettings(supabase as unknown as PlatformSettingsClient);
}
export async function savePlatformProductSettings(settings: PlatformProductSettings, expectedVersion: number): Promise<PlatformSettingsEnvelope> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("Versão inválida. Recarregue a configuração.");
  const normalized = normalizePlatformProductSettings(settings);
  const { data, error } = await supabase.rpc("save_platform_product_settings" as never, { _settings: normalized, _expected_version: expectedVersion } as never);
  if (error) throw new Error(isSettingsConflict(error) ? "Configuração alterada por outro master. Recarregue antes de salvar." : "Não foi possível salvar a configuração.");
  const envelope = data as unknown as PlatformSettingsEnvelope;
  if (!envelope || !Number.isSafeInteger(envelope.version) || envelope.version !== expectedVersion + 1) throw new Error("Resposta de configuração inválida.");
  return { settings: normalizePlatformProductSettings(envelope.settings), version: envelope.version };
}
export async function fetchPublicPlatformCatalog() {
  const { data, error } = await supabase.rpc("get_public_platform_catalog" as never);
  if (error) {
    if (["42883", "PGRST202"].includes(error.code)) return publicPlatformCatalog(DEFAULT_PLATFORM_PRODUCT_SETTINGS);
    throw new Error("Catálogo indisponível. Tente novamente.");
  }
  // Validate public data without trusting it to contain private billing IDs.
  return publicPlatformCatalog(normalizePlatformProductSettings(data));
}
