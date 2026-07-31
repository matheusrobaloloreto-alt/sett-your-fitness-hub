// cardioEngine.ts — Motor DETERMINÍSTICO de prescrição de cardio (corrida/ciclismo/natação).
// Porta a Metodologia BN que vivia só no SYSTEM_PROMPT da IA: Karvonen, regra dos 10%,
// deload, linhas vermelhas TSB/EVA, polarizado/piramidal, sync com musculação.
// Saída 100% completa e enviável SEM IA. A IA, quando ligada, só refina TEXTO (camada externa).
// Alinhado a src/lib/periodization.ts (microciclos ordinário/choque/regenerativo; mesociclos base→polimento).

export interface CardioInput {
  sport?: string;
  goal?: string;
  duration_weeks?: number | string;
  days_per_week?: number | string;
  session_duration?: number | string; // min
  current_volume?: number | string;
  block_number?: number | string | null;
  previous_plan_context?: CardioPlan | null;
  program_sequence?: {
    sequence_number?: number | string | null;
    total_cycles?: number | string | null;
    start_date?: string | null;
    end_date?: string | null;
    phase?: string | null;
  } | null;
  fcmax?: number | string | null;
  fcrep?: number | string | null;
  age?: number | string | null;
  idade?: number | string | null;
  experience_months?: number | string | null;
  tsb?: number | string | null;
  eva?: Record<string, number | string> | null;
  injuries?: string | null;
  equipment?: string | null;
  diet_type?: string | null;
  prescription_integration?: {
    readiness?: { status?: string | null } | null;
    risk_screening?: {
      red_flags?: unknown[];
      yellow_flags?: unknown[];
      pain_regions?: unknown[];
    } | null;
    prescription_decision?: { blocked_progressions?: unknown[] } | null;
  } | null;
  strength_plan_context?: { days_per_week?: number; workouts?: Array<{ day?: any; focus?: string; has_heavy_legs?: boolean }> } | null;
  [k: string]: unknown;
}

type ZoneKey = "z1" | "z2" | "z3" | "z4" | "z5";
interface ZoneRange { min: number; max: number }
export interface FcZones {
  fcmax: number; fcrep: number; fc_reserva: number; estimated: boolean;
  z1: ZoneRange; z2: ZoneRange; z3: ZoneRange; z4: ZoneRange; z5: ZoneRange;
}
export interface CardioSession {
  day: string; type: string; title: string; sport: string;
  warmup_min: number; main_min: number; cooldown_min: number; total_min: number;
  distance_km: number | null; zone: string; fc_target: string;
  intervals: string | null; notes: string;
}
export interface CardioWeek {
  week_number: number; type: "base" | "desenvolvimento" | "qualidade" | "deload";
  microcycle: "ordinario" | "choque" | "regenerativo";
  volume_km: number | null; volume_hours: number; focus: string; sessions: CardioSession[];
}
export interface CardioPlan {
  plan_name: string; sport: string; goal: string; model: "polarizado" | "piramidal";
  duration_weeks: number; level: string;
  volume_weekly_km: number | null; volume_weekly_hours: number;
  fc_zones: FcZones;
  safety_check: { tsb_status: string; eva_status: string; restrictions: string[] };
  weeks: CardioWeek[];
  complementary_strength: string[];
  nutrition_alert: string; general_tips: string; warnings: string[];
  coach_notes?: string[];
  program_sequence?: {
    sequence_number: number;
    total_cycles: number | null;
    phase: string;
    start_date: string | null;
    end_date: string | null;
    previous_plan_used: boolean;
  };
  generated_by: string;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return isNaN(n) ? NaN : n;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

function sequenceMeta(input: CardioInput) {
  const sequenceNumber = Math.max(1, Math.round(num(input.program_sequence?.sequence_number ?? input.block_number)) || 1);
  const position = ((sequenceNumber - 1) % 4) + 1;
  const inferred = position === 1 ? "base" : position === 2 ? "acumulacao" : position === 3 ? "intensificacao" : "consolidacao";
  const requested = String(input.program_sequence?.phase || "").toLowerCase();
  const phase = /acumul/.test(requested) ? "acumulacao"
    : /intens/.test(requested) ? "intensificacao"
      : /(consol|deload|regener)/.test(requested) ? "consolidacao"
        : /base/.test(requested) ? "base" : inferred;
  return {
    sequence_number: sequenceNumber,
    total_cycles: Number(input.program_sequence?.total_cycles) || null,
    phase,
    start_date: input.program_sequence?.start_date || null,
    end_date: input.program_sequence?.end_date || null,
    previous_plan_used: Boolean(input.previous_plan_context),
  };
}

function previousVolume(input: CardioInput, sport: string): number {
  const weeks = Array.isArray(input.previous_plan_context?.weeks) ? input.previous_plan_context!.weeks : [];
  const usable = weeks.filter((week) => week?.type !== "deload").slice(-2);
  if (!usable.length) return NaN;
  if (sport === "natacao") return Math.max(...usable.map((week) => num(week.volume_hours)).filter(Number.isFinite));
  return Math.max(...usable.map((week) => num(week.volume_km)).filter(Number.isFinite));
}

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const ZONE_LABEL: Record<ZoneKey, string> = { z1: "Z1", z2: "Z2", z3: "Z3", z4: "Z4", z5: "Z5" };
// pace corrida (min/km) e velocidade ciclismo (km/h) por zona
const RUN_PACE: Record<ZoneKey, number> = { z1: 7.2, z2: 6.3, z3: 5.6, z4: 5.0, z5: 4.5 };
const BIKE_KMH: Record<ZoneKey, number> = { z1: 20, z2: 26, z3: 31, z4: 35, z5: 40 };
// natação: metros/min por zona (≈3:00 → 1:55 por 100m) — sessões de piscina saem em METROS
const SWIM_M_MIN: Record<ZoneKey, number> = { z1: 33, z2: 38, z3: 43, z4: 48, z5: 52 };
// ciclismo: cadência sugerida e faixa aproximada de %FTP por zona (se tiver medidor de potência)
const BIKE_CADENCE: Record<ZoneKey, string> = { z1: "85–95 rpm", z2: "85–95 rpm", z3: "85–95 rpm", z4: "90–100 rpm", z5: "95–105 rpm" };
const BIKE_FTP: Record<ZoneKey, string> = { z1: "<55%", z2: "56–75%", z3: "76–90%", z4: "91–105%", z5: ">106%" };
// intervalados ESPECÍFICOS por esporte (antes eram os mesmos p/ corrida, pedal e piscina)
const INTERVALS: Record<"corrida" | "ciclismo" | "natacao", Record<"z3" | "z4" | "z5", string>> = {
  corrida: { z3: "6x4 min Z3 c/ 90s Z1", z4: "5x6 min Z4 c/ 2 min Z1", z5: "8x400 m (ou 8x90s) Z5 c/ 90s Z1" },
  ciclismo: { z3: "3x12 min Z3 c/ 4 min leve (85–95 rpm)", z4: "3x10 min Z4 c/ 5 min leve (90–100 rpm)", z5: "6x2 min Z5 c/ 3 min leve (95–105 rpm)" },
  natacao: { z3: "4x200 m Z3 c/ 30s de parede", z4: "6x100 m Z4 c/ 20s de parede", z5: "10x50 m forte c/ 30s de parede" },
};

export function normalizeCardioSport(s?: string): "corrida" | "ciclismo" | "natacao" {
  const x = (s || "corrida")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (x.includes("cicl") || x.includes("bike") || x.includes("pedal")) return "ciclismo";
  if (x.includes("nata") || x.includes("swim") || x.includes("piscina")) return "natacao";
  if (x.includes("corr") || x === "run" || x === "running") return "corrida";
  throw new Error("Modalidade não suportada. Use corrida, ciclismo ou natação.");
}

// ── Zonas Karvonen ───────────────────────────────────────────────────────────
export function computeFcZones(input: CardioInput): FcZones {
  let estimated = false;
  let fcmax = num(input.fcmax);
  const age = num(input.age) || num(input.idade);
  if (!fcmax || fcmax < 120) { fcmax = !isNaN(age) && age > 0 ? Math.round(220 - age) : 185; estimated = true; }
  let fcrep = num(input.fcrep);
  if (!fcrep || fcrep < 30) { fcrep = 65; estimated = true; }
  const reserva = Math.max(1, fcmax - fcrep);
  const z = (lo: number, hi: number): ZoneRange => ({
    min: Math.round(fcrep + lo * reserva),
    max: Math.round(fcrep + hi * reserva),
  });
  return {
    fcmax, fcrep, fc_reserva: reserva, estimated,
    z1: z(0.50, 0.60), z2: z(0.60, 0.70), z3: z(0.70, 0.80), z4: z(0.80, 0.90), z5: z(0.90, 1.00),
  };
}

function resolveLevel(input: CardioInput): { level: "iniciante" | "intermediario" | "avancado"; assumed: boolean } {
  const m = num(input.experience_months);
  if (isNaN(m) || m <= 0) return { level: "iniciante", assumed: true };
  if (m < 6) return { level: "iniciante", assumed: false };
  if (m <= 12) return { level: "intermediario", assumed: false };
  return { level: "avancado", assumed: false };
}

// ── Linhas vermelhas (TSB/EVA) + teto de zona por nível ──────────────────────
function resolveSafety(input: CardioInput, level: string) {
  const restrictions: string[] = [];
  let tsb_status = "ok", eva_status = "ok";
  let maxZone = 5, regenOnly = false, contraindicated = false;

  const tsb = num(input.tsb);
  if (!isNaN(tsb)) {
    if (tsb < -20) { maxZone = Math.min(maxZone, 2); tsb_status = "linha_vermelha"; restrictions.push("TSB < -20: proibido Z3/Z4/Z5 — apenas Z1–Z2 regenerativo."); }
    else if (tsb < -10) { tsb_status = "atencao"; }
  }

  const evaObj = (input.eva && typeof input.eva === "object") ? input.eva : {};
  const evaVals = Object.values(evaObj).map(num).filter((n) => !isNaN(n));
  const evaMax = evaVals.length ? Math.max(...evaVals) : 0;
  if (evaMax >= 7) { contraindicated = true; eva_status = "linha_vermelha"; restrictions.push("EVA ≥ 7: contraindicação absoluta — parar a modalidade e buscar avaliação médica."); }
  else if (evaMax >= 5) { regenOnly = true; maxZone = Math.min(maxZone, 1); eva_status = "linha_vermelha"; restrictions.push("EVA 5–6: apenas regeneração ativa; encaminhar fisioterapia."); }
  else if (evaMax >= 3) { eva_status = "atencao"; maxZone = Math.min(maxZone, 3); restrictions.push("EVA 3–4: volume reduzido ~30% e troca de impacto por água/bicicleta."); }

  const integration = input.prescription_integration;
  const redFlags = Array.isArray(integration?.risk_screening?.red_flags) ? integration!.risk_screening!.red_flags! : [];
  const yellowFlags = Array.isArray(integration?.risk_screening?.yellow_flags) ? integration!.risk_screening!.yellow_flags! : [];
  const blocked = Array.isArray(integration?.prescription_decision?.blocked_progressions)
    ? integration!.prescription_decision!.blocked_progressions!
    : [];
  if (redFlags.length) {
    regenOnly = true;
    maxZone = Math.min(maxZone, 1);
    restrictions.push("Red flag na integração anamnese + avaliação: manter apenas regeneração até revisão do professor.");
  } else if (integration?.readiness?.status === "cautela" || yellowFlags.length || blocked.length) {
    maxZone = Math.min(maxZone, 3);
    restrictions.push("Avaliação integrada em cautela: intensidade limitada a Z3 e progressão condicionada à revisão técnica.");
  }

  if (level === "iniciante") maxZone = Math.min(maxZone, 2);
  else if (level === "intermediario") maxZone = Math.min(maxZone, 4);

  return { tsb_status, eva_status, restrictions, maxZone, regenOnly, contraindicated, evaMax };
}

function resolveModel(input: CardioInput, level: string, tsb: number): "polarizado" | "piramidal" {
  const goal = (input.goal || "").toLowerCase();
  const longDist = /(maraton|ironman|meia|half|21|42|100|ultra|longo|long)/.test(goal);
  const shortDist = /(5\s?k|10\s?k|5km|10km|sprint|olimpic|olímpic)/.test(goal);
  if (!isNaN(tsb) && tsb < -20) return "polarizado";
  if (level !== "iniciante" && shortDist && !longDist) return "piramidal";
  return "polarizado";
}

function daySpread(d: number): string[] {
  const map: Record<number, string[]> = {
    1: ["Sábado"],
    2: ["Terça", "Sábado"],
    3: ["Segunda", "Quarta", "Sábado"],
    4: ["Segunda", "Terça", "Quinta", "Sábado"],
    5: ["Segunda", "Terça", "Quarta", "Sexta", "Sábado"],
    6: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
  };
  return map[clamp(d, 1, 6)] || map[3];
}

// Periodização determinística (espelha src/lib/periodization.ts)
function periodize(N: number, perf: boolean) {
  const blockLen = N <= 6 ? N : 4;
  const deload = new Set<number>();
  if (N >= 4) { for (let w = blockLen; w <= N; w += blockLen) deload.add(w); deload.add(N); }
  const shock = new Set<number>();
  deload.forEach((d) => { if (d - 1 >= 2 && !deload.has(d - 1)) shock.add(d - 1); });
  const out: Array<{ week: number; micro: "ordinario" | "choque" | "regenerativo"; type: CardioWeek["type"] }> = [];
  for (let i = 0; i < N; i++) {
    const week = i + 1;
    const frac = N === 1 ? 1 : week / N;
    let micro: "ordinario" | "choque" | "regenerativo" = "ordinario";
    let type: CardioWeek["type"] = frac <= 1 / 3 ? "base" : frac <= 2 / 3 ? "desenvolvimento" : "qualidade";
    if (shock.has(week)) { micro = "choque"; type = "qualidade"; }
    if (deload.has(week)) { micro = "regenerativo"; type = "deload"; }
    out.push({ week, micro, type });
  }
  return out;
}

function fcTarget(zones: FcZones, zk: ZoneKey): string {
  return `FC ${zones[zk].min}–${zones[zk].max} bpm`;
}

function distanceFor(sport: string, zk: ZoneKey, mainMin: number): number | null {
  if (sport === "corrida") return round1(mainMin / RUN_PACE[zk]);
  if (sport === "ciclismo") return round1((BIKE_KMH[zk] * mainMin) / 60);
  return null; // natação: distância em metros vai nas notes/intervals
}

interface SessionSpec { kind: "longo" | "facil" | "limiar" | "qualidade" | "regeneracao" | "descanso"; zone: ZoneKey; long?: boolean; intervals?: string }

function buildSession(spec: SessionSpec, day: string, sport: string, sessionMin: number, factor: number, zones: FcZones): CardioSession {
  const zk = spec.zone;
  const warmup = spec.kind === "descanso" ? 0 : 10;
  const cooldown = spec.kind === "descanso" ? 0 : spec.kind === "regeneracao" ? 5 : 8;
  let mainBase = sessionMin - warmup - cooldown;
  if (spec.long) mainBase = Math.round(sessionMin * 1.25) - warmup - cooldown;
  if (spec.kind === "descanso") mainBase = 0;
  if (spec.kind === "regeneracao") mainBase = Math.round((sessionMin - 15) * 0.7);
  const main = Math.max(spec.kind === "descanso" ? 0 : 15, Math.round(mainBase * factor));
  const total = warmup + main + cooldown;
  const dist = spec.kind === "descanso" ? null : distanceFor(sport, zk, main);

  const titles: Record<SessionSpec["kind"], string> = {
    longo: "Longo aeróbico", facil: "Treino leve", limiar: "Limiar", qualidade: "Intervalado de qualidade",
    regeneracao: "Regenerativo", descanso: "Descanso / mobilidade",
  };
  const types: Record<SessionSpec["kind"], string> = {
    longo: "longo_z2", facil: "base_z2", limiar: "limiar_z4", qualidade: "potencia_z5",
    regeneracao: "regeneracao", descanso: "descanso",
  };
  let notes = "";
  if (spec.kind === "longo") notes = "Ritmo confortável de conversa; foco em volume aeróbico e eficiência.";
  else if (spec.kind === "facil") notes = "Bem leve — sustenta a base e acelera a recuperação. Não force o ritmo.";
  else if (spec.kind === "limiar") notes = "Esforço controlado no limiar; mantenha a técnica nos blocos fortes.";
  else if (spec.kind === "qualidade") notes = "Aquecer bem antes; máxima qualidade nos tiros, recuperação ativa entre eles.";
  else if (spec.kind === "regeneracao") notes = "Carga muito baixa, só para circular sangue e recuperar. Sem ir à falha.";
  else notes = "Dia de descanso ativo: mobilidade, alongamento leve e respiração.";

  // ── Especificidade por esporte (antes o texto era o mesmo p/ os 3) ──
  if (spec.kind !== "descanso") {
    if (sport === "natacao") {
      const meters = Math.round((main * SWIM_M_MIN[zk]) / 50) * 50;
      notes += ` Volume da sessão: ≈${meters} m.`;
      if (spec.kind === "facil" || spec.kind === "longo") notes += " Termine com 4x50 m de educativo (técnica/respiração bilateral).";
      if (spec.kind === "regeneracao") notes += " Nado solto + pernada com prancha, sem cronômetro.";
    } else if (sport === "ciclismo") {
      notes += ` Cadência: ${BIKE_CADENCE[zk]}.`;
      if (zk === "z3" || zk === "z4" || zk === "z5") notes += ` Com medidor de potência: ${ZONE_LABEL[zk]} ≈ ${BIKE_FTP[zk]} do FTP.`;
    } else if (sport === "corrida" && spec.kind === "facil") {
      notes += " Se estiver bem: 4–6x100 m de strides (acelerações leves) no fim, sem dor.";
    }
    // Fueling por duração — orientação prática, sem prescrição clínica.
    if (spec.kind === "longo" && main >= 75) {
      notes += sport === "natacao"
        ? " Hidrate na borda a cada ~20 min."
        : " Acima de 75 min: 30–60 g de carboidrato/hora + eletrólitos.";
    }
  }

  return {
    day, type: types[spec.kind], title: titles[spec.kind], sport: spec.kind === "descanso" ? "descanso" : sport,
    warmup_min: warmup, main_min: main, cooldown_min: cooldown, total_min: total,
    distance_km: dist, zone: ZONE_LABEL[zk], fc_target: spec.kind === "descanso" ? "—" : fcTarget(zones, zk),
    intervals: spec.intervals ?? null, notes,
  };
}

function nutritionAlert(diet?: string | null): string {
  const d = (diet || "").toLowerCase();
  if (d.includes("emagre")) return "Priorize Z1 e tiros curtos; mantenha déficit calórico moderado, proteína alta e boa hidratação. Evite Z2 muito longo em jejum prolongado.";
  if (d.includes("hipert") || d.includes("massa")) return "Mantenha o cardio leve (Z1–Z2), 2–3x/semana e até ~150 min totais, para não interferir no ganho de massa. Carboidrato suficiente ao redor dos treinos.";
  return "Ajuste o carboidrato ao volume da semana, reforce hidratação e sono. Reponha eletrólitos nas sessões longas.";
}

function complementaryStrength(sport: string): string[] {
  if (sport === "ciclismo") return ["Cadeia posterior (stiff leve / ponte) 3x12", "Core e lombar (prancha, bird-dog) 3x40s", "Mobilidade de quadril e flexores antes do pedal"];
  if (sport === "natacao") return ["Estabilização escapular (Y-T-W) 3x12", "Manguito rotador — rotação externa 3x15", "Core anti-extensão (prancha) 3x40s"];
  return ["Glúteo médio (abdução em pé) 2x15/lado", "Panturrilha — elevação 3x15", "Prancha + anti-rotação 3x30–45s", "Agachamento unilateral leve 2x10/perna"];
}

// ── Motor principal ──────────────────────────────────────────────────────────
export function buildCardioProgram(input: CardioInput): CardioPlan {
  const sport = normalizeCardioSport(input.sport);
  const sequence = sequenceMeta(input);
  const N = clamp(Math.round(num(input.duration_weeks)) || 6, 1, 16);
  let sessionMin = clamp(Math.round(num(input.session_duration)) || 60, 20, 180);
  const { level, assumed } = resolveLevel(input);

  // ── Calibração pelo volume ATUAL da anamnese (regra dos ~10%: semana 1 nunca muito acima do que já faz) ──
  // current_volume: km/semana (corrida/pedal). Estima a semana 1 e escala a duração-base das sessões.
  const reportedVolume = num(input.current_volume);
  const inheritedVolume = previousVolume(input, sport);
  const currentVol = Number.isFinite(reportedVolume) && reportedVolume > 0 ? reportedVolume : inheritedVolume;
  let volCalibrated = false;
  if (!isNaN(currentVol) && currentVol > 0 && sport !== "natacao") {
    const d0 = clamp(Math.round(num(input.days_per_week)) || 3, 1, 6);
    const paceKmMin = sport === "corrida" ? 1 / RUN_PACE.z2 : BIKE_KMH.z2 / 60; // km por minuto em Z2
    const estWeek1Km = ((d0 - 1) * Math.max(15, sessionMin - 18) + Math.max(15, Math.round(sessionMin * 1.25) - 18)) * paceKmMin;
    if (estWeek1Km > 0) {
      const scale = clamp(currentVol * 1.1 / estWeek1Km, 0.6, 1.15); // parte de ~volume atual +10%, nunca corta >40%
      if (Math.abs(scale - 1) > 0.07) { sessionMin = clamp(Math.round(sessionMin * scale), 20, 180); volCalibrated = true; }
    }
  }
  if (sport === "natacao" && Number.isFinite(currentVol) && currentVol > 0) {
    const d0 = clamp(Math.round(num(input.days_per_week)) || 3, 1, 6);
    sessionMin = clamp(Math.round((currentVol * 60 / d0) * 1.05), 20, 180);
    volCalibrated = true;
  }
  if (sequence.phase === "acumulacao") sessionMin = clamp(Math.round(sessionMin * 1.05), 20, 180);
  if (sequence.phase === "intensificacao") sessionMin = clamp(Math.round(sessionMin * 1.08), 20, 180);
  if (sequence.phase === "consolidacao") sessionMin = clamp(Math.round(sessionMin * 0.85), 20, 180);
  const zones = computeFcZones(input);
  const tsbNum = num(input.tsb);
  const safety = resolveSafety(input, level);
  const model = resolveModel(input, level, tsbNum);
  const perf = /(performance|prova|competi|maraton|ironman|sub)/.test((input.goal || "").toLowerCase());

  let days = clamp(Math.round(num(input.days_per_week)) || 3, 1, 6);
  if (level === "iniciante") days = Math.min(days, 3);
  else if (level === "intermediario") days = Math.min(days, 4);
  if (safety.evaMax >= 3) days = Math.max(1, days - 1); // EVA 3-4 reduz volume

  const phases = periodize(N, perf);
  const weeks: CardioWeek[] = [];
  let prevFactor = 1.0;

  for (const ph of phases) {
    let factor: number;
    if (perf && ph.week === N) factor = 0.5; // TAPER: última semana antes da prova — chegar fresco
    else if (ph.type === "deload") factor = 0.6;
    else if (ph.micro === "choque") { factor = round1(Math.min(prevFactor * 1.05, 1.6)); prevFactor = factor; }
    else { factor = ph.week === 1 ? 1.0 : round1(Math.min(prevFactor * 1.08, 1.6)); prevFactor = factor; }

    const dayList = daySpread(days);
    const specs: SessionSpec[] = [];

    // Quantas sessões "fortes" por tipo de semana, respeitando teto de zona / restrições
    const canHard = !safety.regenOnly && !safety.contraindicated && safety.maxZone >= 3;
    let hardCount = 0;
    if (canHard) {
      if (ph.type === "desenvolvimento") hardCount = 1;
      else if (ph.type === "qualidade") hardCount = model === "piramidal" ? 2 : 1;
    }
    // Polarizado nas 3 primeiras semanas: no máximo 1 sessão forte
    if (model === "polarizado" && ph.week <= 3) hardCount = Math.min(hardCount, 1);
    hardCount = Math.min(hardCount, Math.max(0, days - 1));

    // Monta as specs por dia
    for (let i = 0; i < days; i++) {
      const isLast = i === days - 1; // último dia = longo (fim de semana)
      if (safety.contraindicated) { specs.push({ kind: "descanso", zone: "z1" }); continue; }
      if (safety.regenOnly) { specs.push({ kind: "regeneracao", zone: "z1" }); continue; }
      if (ph.type === "deload") { specs.push({ kind: isLast ? "facil" : "regeneracao", zone: "z2" }); continue; }
      if (isLast) { specs.push({ kind: "longo", zone: "z2", long: true }); continue; }
      if (hardCount > 0) {
        hardCount--;
        const hz: ZoneKey = clamp(safety.maxZone, 3, 5) >= 4 && ph.type === "qualidade" ? (safety.maxZone >= 5 && model === "piramidal" ? "z5" : "z4") : "z3";
        const intervals = INTERVALS[sport][hz as "z3" | "z4" | "z5"]; // específico por esporte
        specs.push({ kind: hz === "z3" ? "limiar" : "qualidade", zone: hz, intervals });
      } else {
        specs.push({ kind: "facil", zone: "z2" });
      }
    }

    const sessions = specs.map((sp, i) => buildSession(sp, dayList[i] || DAYS[i % 7], sport, sessionMin, factor, zones));
    const volume_hours = round1(sessions.reduce((s, x) => s + x.total_min / 60, 0));
    const volume_km = sport === "natacao" ? null : round1(sessions.reduce((s, x) => s + (x.distance_km || 0), 0));
    const focusMap: Record<CardioWeek["type"], string> = {
      base: "Base aeróbica e técnica — ritmo fácil com folga de esforço.",
      desenvolvimento: "Acúmulo de volume com um estímulo de limiar controlado.",
      qualidade: "Intensidade e qualidade — pico do bloco, perto do limiar/VO₂.",
      deload: "Semana regenerativa (deload): volume e intensidade reduzidos para supercompensar.",
    };
    weeks.push({
      week_number: ph.week, type: ph.type, microcycle: ph.micro,
      volume_km, volume_hours,
      focus: perf && ph.week === N ? "Taper: volume bem reduzido para chegar descansado e afiado na prova." : focusMap[ph.type],
      sessions,
    });
  }

  // Volume de referência (1ª semana não-deload)
  const ref = weeks.find((w) => w.type !== "deload") || weeks[0];

  // ALUNO vê (alertas, vermelho) = SOMENTE restrições de segurança reais (TSB/EVA/contraindicação).
  const warnings: string[] = [...safety.restrictions];
  // Notas internas / para o treinador — NUNCA exibidas ao aluno (não vão pro canal de warnings).
  const coach_notes: string[] = [];
  if (zones.estimated) coach_notes.push("Zonas de FC estimadas (FCmax/FCrep aproximados). Recomende teste de esforço para maior precisão.");
  if (assumed) coach_notes.push("Nível de experiência não informado — assumido conservador (iniciante). Ajuste se o atleta tiver mais base.");
  if (input.strength_plan_context) coach_notes.push("Sincronizado com a musculação: evite Z4/Z5 no dia e na véspera de MMII pesado; corrida fácil só após a força, ≥6h de intervalo.");
  if (volCalibrated) coach_notes.push(`Volume inicial calibrado pelo volume atual da anamnese (~${round1(currentVol)} km/sem): semana 1 parte de perto do que o atleta já faz (+~10%).`);
  if (input.previous_plan_context) coach_notes.push(`Continuidade longitudinal aplicada a partir do ciclo anterior; fase atual: ${sequence.phase}.`);
  if (perf) coach_notes.push("Última semana em taper (fator 0,5) para chegar descansado na prova.");
  coach_notes.push("Plano base gerado pela metodologia BN (determinístico). Revise antes de prescrever ao aluno.");

  let tips = "Aqueça progressivamente e desaqueça em toda sessão. Hidrate-se antes, durante e depois — principalmente nos longos. Priorize 7–9h de sono: é onde a adaptação acontece. Respeite as zonas: correr fácil de verdade é o que sustenta a evolução. Dor articular acima de leve → reduza o impacto e avise o treinador.";
  if (input.strength_plan_context) tips += " Nos dias de musculação pesada de pernas, faça só cardio leve (Z1–Z2) e depois da força.";

  return {
    plan_name: `Plano BN de ${sport} — ${level}`,
    sport, goal: String(input.goal || "Evolução de performance"), model,
    duration_weeks: N, level,
    volume_weekly_km: ref.volume_km, volume_weekly_hours: ref.volume_hours,
    fc_zones: zones,
    safety_check: { tsb_status: safety.tsb_status, eva_status: safety.eva_status, restrictions: safety.restrictions },
    weeks,
    complementary_strength: complementaryStrength(sport),
    nutrition_alert: nutritionAlert(input.diet_type),
    general_tips: tips,
    warnings,
    coach_notes,
    program_sequence: sequence,
    generated_by: "bn_cardio_engine_v2",
  };
}

/** Invariante: nunca persistir plano sem semanas/sessões reais. */
export function assertCardioPlanComplete(plan: CardioPlan): void {
  const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
  if (weeks.length === 0) throw new Error("cardio plan inválido: sem semanas");
  for (const w of weeks) {
    if (!Array.isArray(w.sessions) || w.sessions.length === 0) {
      throw new Error(`cardio plan inválido: semana ${w?.week_number} sem sessões`);
    }
  }
}
