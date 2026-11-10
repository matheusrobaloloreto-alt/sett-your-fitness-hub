import type { CSSProperties } from "react";

export const DASHBOARD_SECTIONS = {
  indicators: "Indicadores da empresa",
  interested: "Interessados",
  firstTraining: "Primeiros treinos",
  prescriptions: "Próximas prescrições",
  renewals: "Renovações",
  workoutFeedback: "Feedbacks de treino",
  contactCadence: "Cadência de contatos",
  assessments: "Aguardando avaliação",
  cycleFeedback: "Feedback de ciclo pendente",
  birthdays: "Aniversariantes",
  enrollmentQueue: "Fila de matrículas",
};

export type DashboardSection = keyof typeof DASHBOARD_SECTIONS;
export const DEFAULT_DASHBOARD_ORDER = Object.keys(DASHBOARD_SECTIONS) as DashboardSection[];

export const APPEARANCE_EFFECTS = {
  glass: {
    label: "Liquid Glass",
    description: "Controla o desfoque e a transparência das barras, menus e botões do painel.",
    enabled: true, intensity: 50,
  },
  edgeLight: {
    label: "Brilho nas bordas",
    description: "Realça o contorno das barras, menus e cartões.",
    enabled: false, intensity: 50,
  },
  softShadows: {
    label: "Sombras suaves",
    description: "Dá profundidade aos cartões do Dashboard.",
    enabled: false, intensity: 50,
  },
  linenTexture: {
    label: "Textura de linho",
    description: "Adiciona uma trama fina ao fundo do painel.",
    enabled: false, intensity: 50,
  },
  ambientLight: {
    label: "Luz ambiente",
    description: "Adiciona um halo no fundo com a cor principal da empresa.",
    enabled: false, intensity: 50,
  },
};

export type AppearanceEffect = keyof typeof APPEARANCE_EFFECTS;
type EffectSetting = { enabled: boolean; intensity: number };
export type ProfessionalAppearance = {
  dashboardOrder: DashboardSection[];
  effects: Record<AppearanceEffect, EffectSetting>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeProfessionalAppearance(value: unknown): ProfessionalAppearance {
  const settings = asRecord(value);
  const order = Array.isArray(settings.dashboardOrder) ? settings.dashboardOrder : [];
  const validOrder = order.filter((id): id is DashboardSection => typeof id === "string" && Object.hasOwn(DASHBOARD_SECTIONS, id));
  const storedEffects = asRecord(settings.effects);
  const effects = Object.fromEntries((Object.keys(APPEARANCE_EFFECTS) as AppearanceEffect[]).map(id => {
    const { enabled, intensity } = APPEARANCE_EFFECTS[id];
    const stored = asRecord(storedEffects[id]);
    return [id, {
      enabled: typeof stored.enabled === "boolean" ? stored.enabled : enabled,
      intensity: typeof stored.intensity === "number" && Number.isFinite(stored.intensity)
        ? Math.round(Math.min(100, Math.max(0, stored.intensity)))
        : intensity,
    }];
  })) as ProfessionalAppearance["effects"];

  return { dashboardOrder: [...new Set([...validOrder, ...DEFAULT_DASHBOARD_ORDER])], effects };
}

export function appearanceEffectStyles(effects: ProfessionalAppearance["effects"]): CSSProperties {
  const strength = (id: AppearanceEffect) => effects[id].enabled ? effects[id].intensity / 100 : 0;
  const glass = strength("glass");
  return {
    "--sett-effect-glass": glass,
    "--sett-glass-bar-filter": glass ? `blur(${48 * glass}px) saturate(${100 + 100 * glass}%)` : "none",
    "--sett-glass-button-filter": glass ? `blur(${18 * glass}px)` : "none",
    "--sett-glass-launcher-filter": glass ? `blur(${40 * glass}px) saturate(${100 + 100 * glass}%)` : "none",
    "--sett-effect-edge": strength("edgeLight"),
    "--sett-effect-shadow": strength("softShadows"),
    "--sett-effect-texture": strength("linenTexture"),
    "--sett-effect-ambient": strength("ambientLight"),
  } as CSSProperties;
}
