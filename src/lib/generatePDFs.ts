// ============================================================================
// generatePDFs.ts — BN Performance Training
// Gera UM PDF SEPARADO por modalidade, alinhado ao schema REAL das edge functions
// de IA (ai-prescribe-workout / ai-running-plan / ai-nutrition-plan).
// Entregável do aluno: completo, legível e bonito. Client-side (jsPDF).
// ============================================================================
import { jsPDF } from "jspdf";
import { studentEffortLabel, studentFacingEffortText } from "@/lib/weeklyStrengthPeriodization";

// Paleta BN
const NAVY: [number, number, number]   = [27, 43, 74];
const BEGE: [number, number, number]   = [139, 115, 85];
const BEGE_L: [number, number, number] = [245, 237, 216];
const AMBER: [number, number, number]  = [192, 120, 40];
const AMBER_L: [number, number, number]= [254, 243, 226];
const GRAY: [number, number, number]   = [107, 114, 128];
const TEXT: [number, number, number]   = [55, 65, 81];
const LIGHT: [number, number, number]  = [241, 245, 249];
const GREEN: [number, number, number]  = [22, 130, 90];

const MARGIN = 14;

export interface PDFMeta {
  studentName: string;
  date: string;
  professional?: string;
  cref?: string;
  company?: string; // P18 — nome da empresa no rodapé (multitenancy); default "BN Performance Training".
}

// ── Helpers genéricos ──────────────────────────────────────────────────────
const first = (...vals: any[]) => vals.find((v) => v !== undefined && v !== null && v !== "");

// jsPDF (fontes padrão) só renderiza WinAnsi. Mapeia glifos comuns (setas/símbolos)
// para equivalentes seguros e remove o resto fora do range — evita texto "espaçado".
const GLYPHS: Record<string, string> = {
  "→": ">", "⟶": ">", "➔": ">", "➜": ">", "⇒": ">", "»": ">",
  "←": "<", "↔": "-", "↑": "^", "↓": "v", "↳": "-", "↪": "-", "⤷": "-",
  "⚙": "*", "⚠": "!", "✓": "-", "✔": "-", "✗": "x", "★": "*", "☆": "*",
  "≥": ">=", "≤": "<=", "≈": "~", "°": "o", "·": "·",
};
function sanitize(s: string): string {
  if (!s) return s;
  let out = s.replace(/[←-⇿⌀-➿⬀-⯿✓✔✗★☆≥≤≈]/g,
    (c) => GLYPHS[c] ?? "");
  // remove quaisquer outros codepoints altos não suportados (preserva Latin-1 acentuado, travessões, aspas, bullet)
  const supportedPunctuation = "–—‘’“”•…";
  out = Array.from(out)
    .filter((character) => (character.codePointAt(0) || 0) <= 0xff || supportedPunctuation.includes(character))
    .join("");
  return out;
}
const asText = (v: any) =>
  sanitize(v == null ? "" : typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : JSON.stringify(v));
const studentText = (v: any) => studentFacingEffortText(asText(v));

function W(doc: jsPDF) { return doc.internal.pageSize.getWidth(); }
function H(doc: jsPDF) { return doc.internal.pageSize.getHeight(); }

// Garante espaço vertical; abre nova página se necessário. Retorna o novo y.
function ensure(doc: jsPDF, y: number, need: number): number {
  if (y + need > H(doc) - 20) { doc.addPage(); return 20; }
  return y;
}

function header(doc: jsPDF, title: string, subtitle: string, meta: PDFMeta) {
  const w = W(doc);
  doc.setFillColor(...BEGE);
  doc.rect(0, 0, w, 3, "F");
  doc.setFillColor(...NAVY);
  doc.rect(0, 3, w, 30, "F");
  doc.setFillColor(...BEGE);
  doc.roundedRect(MARGIN, 9, 16, 16, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("BN", MARGIN + 8, 19.5, { align: "center" });
  doc.setFontSize(13);
  doc.text(title, MARGIN + 22, 15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.setTextColor(200, 190, 170);
  doc.text(subtitle, MARGIN + 22, 22);
  doc.setFontSize(7);
  doc.text(`${meta.studentName}  ·  ${meta.date}`, w - MARGIN, 15, { align: "right" });
}

// Stamp de rodapé + numeração em TODAS as páginas (chamado no fim).
function stampFooters(doc: jsPDF, meta: PDFMeta) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const w = W(doc), h = H(doc);
    doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
    doc.line(MARGIN, h - 14, w - MARGIN, h - 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(`${meta.professional || "Matheus Loreto"}  ·  ${meta.cref || "CREF 040718-G/SC"}  ·  ${meta.company || "BN Performance Training"}`, MARGIN, h - 9);
    doc.text(`${p}/${pages}`, w - MARGIN, h - 9, { align: "right" });
  }
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  y = ensure(doc, y, 14);
  const w = W(doc);
  doc.setFillColor(...NAVY);
  doc.rect(MARGIN, y, w - MARGIN * 2, 7, "F");
  doc.setFillColor(...BEGE);
  doc.rect(MARGIN, y, 1.8, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(sanitize(text).toUpperCase(), MARGIN + 4, y + 4.8);
  return y + 12;
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxW: number, lh = 4.5): number {
  if (!text) return y;
  const lines = doc.splitTextToSize(sanitize(text), maxW);
  y = ensure(doc, y, lines.length * lh);
  doc.text(lines, x, y);
  return y + lines.length * lh;
}

// Caixa de destaque (nota/alerta)
function calloutBox(doc: jsPDF, text: string, y: number, kind: "info" | "warn" = "info"): number {
  if (!text) return y;
  const w = W(doc);
  const fill = kind === "warn" ? AMBER_L : LIGHT;
  const fg = kind === "warn" ? AMBER : GRAY;
  const lines = doc.splitTextToSize(sanitize(text), w - MARGIN * 2 - 8);
  const boxH = lines.length * 4.5 + 6;
  y = ensure(doc, y, boxH + 2);
  doc.setFillColor(...fill);
  doc.roundedRect(MARGIN, y, w - MARGIN * 2, boxH, 2, 2, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...fg);
  doc.text(lines, MARGIN + 4, y + 5);
  return y + boxH + 4;
}

// Linha de métricas em cards
function statCards(doc: jsPDF, cards: [string, string][], y: number): number {
  const w = W(doc);
  const n = cards.length || 1;
  const cw = (w - MARGIN * 2) / n;
  y = ensure(doc, y, 22);
  cards.forEach(([val, lbl], i) => {
    const x = MARGIN + i * cw;
    doc.setDrawColor(...LIGHT); doc.setFillColor(255, 255, 255);
    doc.roundedRect(x + 1, y, cw - 2, 18, 2, 2, "FD");
    doc.setFillColor(...BEGE);
    doc.rect(x + 1, y, 1.5, 18, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text(String(val), x + cw / 2, y + 8, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(...GRAY);
    doc.text(String(lbl), x + cw / 2, y + 14, { align: "center" });
  });
  return y + 24;
}

function warningsBlock(doc: jsPDF, warnings: any[], y: number): number {
  const list = (warnings || []).map(asText).map(studentFacingEffortText).filter(Boolean);
  if (!list.length) return y;
  y = sectionTitle(doc, "Avisos de seguranca", y);
  list.forEach((w) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...AMBER);
    y = wrapText(doc, `•  ${w}`, MARGIN + 2, y, W(doc) - MARGIN * 2 - 4, 4.5) + 1.5;
  });
  return y + 2;
}

// ── 1. PDF de MUSCULAÇÃO ────────────────────────────────────────────────────
const PHASE_LABEL: Record<string, string> = {
  mobilidade: "Mobilidade",
  ativacao_core: "Ativação — Core",
  ativacao_especifica: "Ativação específica",
  controle_motor: "Controle motor",
  pliometria: "Pliometria",
  forca_global: "Força global",
  forca_especifica: "Força específica",
};

const STRENGTH_METHOD_LABELS: Record<string, string> = {
  biset: "Bi-set",
  triset: "Tri-set",
  superset: "Super-set",
  giantset: "Série gigante",
  circuito: "Circuito",
  dropset: "Drop-set",
  restpause: "Rest-pause",
  cluster: "Cluster-set",
  isometria: "Isometria",
  pico_contracao: "Pico de contração",
  pico_alongamento: "Pico de alongamento",
};

export function strengthExerciseMethodSummary(exercise: any): string {
  const weeks = Array.isArray(exercise?.weekly_prescription) ? exercise.weekly_prescription : [];
  return weeks
    .filter((week: any) => week?.method)
    .map((week: any) => {
      const label = STRENGTH_METHOD_LABELS[String(week.method)] || String(week.method);
      const seconds = Number(week.method_seconds);
      return `S${Number(week.week) || "?"} ${label}${Number.isFinite(seconds) && seconds > 0 ? ` ${seconds}s` : ""}`;
    })
    .join(" · ");
}

export function generateStrengthPDF(plan: any, meta: PDFMeta): jsPDF {
  const doc = new jsPDF();
  const w = W(doc);
  header(doc, "Prescrição de Musculação", asText(first(plan.cycle_name, "Treino de Força")), meta);
  let y = 42;

  doc.setTextColor(...TEXT); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(
    `Objetivo: ${asText(first(plan.objective, "—"))}   ·   Duração: ${asText(first(plan.duration_weeks, "—"))} semanas   ·   Bloco ${asText(first(plan.block, plan.block_number, 1))}`,
    MARGIN, y);
  y += 7;

  if (plan.biomechanical_notes) y = calloutBox(doc, studentFacingEffortText(asText(plan.biomechanical_notes)), y, "info");
  if (plan.weekly_structure) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    y = wrapText(doc, `Estrutura semanal: ${studentFacingEffortText(asText(plan.weekly_structure))}`, MARGIN, y + 1, w - MARGIN * 2, 4.5) + 3;
  }

  (plan.workouts || []).forEach((wk: any) => {
    const title = `${asText(first(wk.name, wk.day_label, wk.day))}${wk.split_focus ? " — " + asText(wk.split_focus) : ""}`;
    y = sectionTitle(doc, title, y);
    if (wk.duration_min) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(`Duração estimada: ${asText(wk.duration_min)} min`, MARGIN + 2, y - 3);
    }

    const exercises = (wk.exercises || []).slice().sort(
      (a: any, b: any) => (first(a.exercise_order, 99) as number) - (first(b.exercise_order, 99) as number)
    );
    let lastPhase = "";
    exercises.forEach((ex: any) => {
      const phase = asText(ex.phase);
      if (phase && phase !== lastPhase) {
        y = ensure(doc, y, 7);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...BEGE);
        doc.text((PHASE_LABEL[phase] || phase).toUpperCase(), MARGIN + 2, y);
        y += 4.5; lastPhase = phase;
      }
      y = ensure(doc, y, 9);
      const name = asText(first(ex.exercise_name, ex.name, "Exercício"));
      const sets = asText(first(ex.sets, "—"));
      const reps = asText(first(ex.reps, "—"));
      const rawIntensity = asText(first(ex.load_percent_1rm, ex.intensity));
      const intens = rawIntensity
        ? studentFacingEffortText(rawIntensity)
        : (ex.rir ? studentEffortLabel(asText(ex.rir), { compact: true }) || "" : "");
      const rest = asText(first(ex.rest_seconds, ex.rest));
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
      doc.text(`•  ${name}`, MARGIN + 2, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...TEXT);
      const detail = [
        `${sets}x${reps}`,
        intens,
        ex.tempo ? `tempo ${asText(ex.tempo)}` : "",
        rest ? `descanso ${rest}${/^\d+$/.test(rest) ? "s" : ""}` : "",
      ].filter(Boolean).join("  ·  ");
      doc.text(detail, w - MARGIN, y, { align: "right" });
      y += 4.2;
      const cue = studentFacingEffortText(asText(first(ex.cues, ex.cue)));
      if (cue) {
        doc.setFontSize(7); doc.setTextColor(...GRAY);
        y = wrapText(doc, `↳ ${cue}`, MARGIN + 5, y, w - MARGIN * 2 - 6, 3.8) + 0.8;
      }
      const methodSummary = strengthExerciseMethodSummary(ex);
      if (methodSummary) {
        doc.setFontSize(6.9); doc.setTextColor(...AMBER);
        y = wrapText(doc, `Método semanal: ${methodSummary}`, MARGIN + 5, y, w - MARGIN * 2 - 6, 3.7) + 0.8;
      }
      if (ex.biomechanical_note) {
        doc.setFontSize(6.8); doc.setTextColor(...BEGE);
        y = wrapText(doc, `⚙ ${studentFacingEffortText(asText(ex.biomechanical_note))}`, MARGIN + 5, y, w - MARGIN * 2 - 6, 3.6) + 0.8;
      }
    });
    if (wk.notes) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...GRAY);
      y = wrapText(doc, studentFacingEffortText(asText(wk.notes)), MARGIN + 2, y + 1, w - MARGIN * 2 - 4, 3.8) + 2;
    }
    y += 3;
  });

  if (plan.progression_protocol) {
    y = sectionTitle(doc, "Progressão para o próximo bloco", y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TEXT);
    y = wrapText(doc, studentFacingEffortText(asText(plan.progression_protocol)), MARGIN + 2, y, w - MARGIN * 2 - 4) + 3;
  }

  y = warningsBlock(doc, plan.warnings, y);
  stampFooters(doc, meta);
  return doc;
}

// ── 2. PDF de CORRIDA / NATAÇÃO / CICLISMO ──────────────────────────────────
export function generateCardioPDF(plan: any, meta: PDFMeta, sportLabel: string): jsPDF {
  const doc = new jsPDF();
  const w = W(doc);
  header(doc, `Prescrição de ${sportLabel}`, studentText(first(plan.plan_name, "Plano de Treino")), meta);
  let y = 42;

  doc.setTextColor(...TEXT); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const vol = first(plan.volume_weekly_km, plan.volume_weekly_hours);
  doc.text(
    `Modelo: ${studentText(first(plan.model, "—"))}   ·   Duração: ${studentText(first(plan.duration_weeks, "—"))} semanas${vol ? `   ·   Volume: ${studentText(vol)}${plan.volume_weekly_km ? " km/sem" : " h/sem"}` : ""}`,
    MARGIN, y);
  y += 8;

  // Zonas de FC
  const z = plan.fc_zones;
  if (z) {
    y = sectionTitle(doc, "Zonas de frequência cardíaca", y);
    if (z.estimated) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...AMBER);
      doc.text("⚠ Valores estimados. Recomenda-se teste de esforço para maior precisão.", MARGIN + 2, y - 3);
      y += 1;
    }
    const zones = ["z1", "z2", "z3", "z4", "z5"];
    const zw = (w - MARGIN * 2) / 5;
    y = ensure(doc, y, 20);
    zones.forEach((zk, i) => {
      const zd = z[zk]; if (!zd) return;
      const x = MARGIN + i * zw;
      doc.setFillColor(...BEGE_L);
      doc.roundedRect(x + 1, y, zw - 2, 16, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
      doc.text(zk.toUpperCase(), x + zw / 2, y + 6, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...TEXT);
      doc.text(`${studentText(first(zd.min, "—"))}-${studentText(first(zd.max, "—"))}`, x + zw / 2, y + 12, { align: "center" });
    });
    y += 22;
  }

  // Check de segurança
  const sc = plan.safety_check;
  if (sc) {
    const parts = [
      sc.tsb_status ? `TSB: ${studentText(sc.tsb_status)}` : "",
      sc.eva_status ? `EVA: ${studentText(sc.eva_status)}` : "",
      (sc.restrictions && sc.restrictions.length) ? `Restrições: ${studentText(sc.restrictions)}` : "",
    ].filter(Boolean).join("   ·   ");
    if (parts) { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY); doc.text(parts, MARGIN, y); y += 6; }
  }

  // Plano semana a semana (schema real = weeks[].sessions[]) — fallback p/ sample_week
  const weeks = plan.weeks;
  if (Array.isArray(weeks) && weeks.length) {
    weeks.forEach((wk: any) => {
      const wkTitle = `Semana ${studentText(first(wk.week_number, "?"))}${wk.type ? " — " + studentText(wk.type) : ""}`;
      y = sectionTitle(doc, wkTitle, y);
      const meta2 = [
        wk.volume_km ? `${studentText(wk.volume_km)} km` : (wk.volume_hours ? `${studentText(wk.volume_hours)} h` : ""),
        wk.tss_total_estimado ? `TSS ~${studentText(wk.tss_total_estimado)}` : "",
        wk.focus ? studentText(wk.focus) : "",
        wk.resumo ? studentText(wk.resumo) : "",
      ].filter(Boolean).join("  ·  ");
      if (meta2) { doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...GRAY); y = wrapText(doc, meta2, MARGIN + 2, y, w - MARGIN * 2 - 4, 4) + 1; }
      (wk.sessions || []).forEach((s: any) => {
        y = ensure(doc, y, 9);
        const day = studentText(first(s.day, s.dia, ""));
        const titleS = studentText(first(s.title, s.type, s.workout, "Sessão"));
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); doc.setTextColor(...NAVY);
        doc.text(`${day}${day ? " · " : ""}${titleS}`, MARGIN + 2, y);
        const right = [s.zone ? studentText(s.zone) : "", s.total_min ? `${studentText(s.total_min)}min` : "", s.distance_km ? `${studentText(s.distance_km)}km` : ""].filter(Boolean).join(" · ");
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...TEXT);
        if (right) doc.text(right, w - MARGIN, y, { align: "right" });
        y += 4.2;
        const sub = [s.fc_target ? studentText(s.fc_target) : "", s.intervals ? studentText(s.intervals) : ""].filter(Boolean).join("  ·  ");
        if (sub) { doc.setFontSize(7); doc.setTextColor(...GRAY); y = wrapText(doc, `↳ ${sub}`, MARGIN + 5, y, w - MARGIN * 2 - 6, 3.8) + 0.6; }
        if (s.notes) { doc.setFontSize(6.8); doc.setTextColor(...GRAY); y = wrapText(doc, studentText(s.notes), MARGIN + 5, y, w - MARGIN * 2 - 6, 3.6) + 0.6; }
      });
      y += 3;
    });
  } else if (Array.isArray(plan.sample_week) && plan.sample_week.length) {
    y = sectionTitle(doc, "Semana representativa", y);
    plan.sample_week.forEach((day: any) => {
      y = ensure(doc, y, 8);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
      doc.text(studentText(first(day.day, day.dia, "")), MARGIN + 2, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TEXT);
      y = wrapText(doc, studentText(first(day.workout, day.treino, day.description, "Descanso")), MARGIN + 30, y, w - MARGIN * 2 - 32, 4.5) + 3;
    });
  }

  // Força complementar
  const comp = (plan.complementary_strength || []).map(studentText).filter(Boolean);
  if (comp.length) {
    y = sectionTitle(doc, "Força complementar", y);
    comp.forEach((c: string) => { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TEXT); y = wrapText(doc, `•  ${c}`, MARGIN + 2, y, w - MARGIN * 2 - 4, 4.2) + 1; });
    y += 2;
  }

  if (plan.nutrition_alert) y = calloutBox(doc, `Nutrição: ${studentText(plan.nutrition_alert)}`, y, "info");
  if (plan.general_tips) {
    y = sectionTitle(doc, "Orientações gerais", y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TEXT);
    y = wrapText(doc, studentText(plan.general_tips), MARGIN + 2, y, w - MARGIN * 2 - 4) + 3;
  }

  y = warningsBlock(doc, plan.warnings, y);
  stampFooters(doc, meta);
  return doc;
}

// ── 3. PDF de NUTRIÇÃO ──────────────────────────────────────────────────────
const CTX_LABEL: Record<string, string> = {
  treino: "dia de treino", descanso: "descanso", pre_treino: "pré-treino", pos_treino: "pós-treino",
};

// ── Helpers de layout exclusivos da Nutrição ────────────────────────────────

// Mede a altura que um bloco de texto vai ocupar (sem desenhar) — para paginação
// segura de cards (evita cortar no fim da página).
function measureLines(doc: jsPDF, text: string, maxW: number, fontSize: number, lh: number): number {
  if (!text) return 0;
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(sanitize(text), maxW).length * lh;
}

// Banner energético navy: caixa preenchida + pílulas de macro + linha de hidratação.
function energyBanner(doc: jsPDF, es: any, y: number): number {
  const w = W(doc);
  const innerW = w - MARGIN * 2;
  const pills: [string, string][] = [
    [`${asText(first(es.target_kcal, "—"))}`, "kcal / dia"],
    [`${asText(first(es.protein_total_g, "—"))} g`, "Proteína"],
    [`${asText(first(es.carbs_total_g, "—"))} g`, "Carboidrato"],
    [`${asText(first(es.fat_total_g, "—"))} g`, "Gordura"],
  ];
  const subParts = [
    es.tmb_kcal != null ? `TMB ${asText(es.tmb_kcal)} kcal` : "",
    es.get_kcal != null ? `GET ${asText(es.get_kcal)} kcal` : "",
    es.deficit_surplus_percent != null
      ? `${Number(es.deficit_surplus_percent) >= 0 ? "Superavit +" : "Deficit "}${asText(es.deficit_surplus_percent)}%`
      : "",
  ].filter(Boolean).join("   ·   ");
  const hydration = es.hydration_ml != null ? `${asText(es.hydration_ml)} ml` : "";

  const hasFooter = !!(subParts || hydration);
  const bannerH = 14 + 22 + (hasFooter ? 9 : 4);
  y = ensure(doc, y, bannerH + 2);

  // Caixa navy
  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGIN, y, innerW, bannerH, 3, 3, "F");
  doc.setFillColor(...BEGE);
  doc.roundedRect(MARGIN, y, 2.2, bannerH, 3, 3, "F");

  // Eyebrow
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...BEGE_L);
  doc.text("ALVO ENERGETICO DIARIO", MARGIN + 7, y + 9);

  // Pílulas claras arredondadas
  const padX = 6;
  const gap = 3;
  const pillW = (innerW - padX * 2 - gap * (pills.length - 1)) / pills.length;
  const pillY = y + 13;
  const pillH = 21;
  pills.forEach(([val, lbl], i) => {
    const px = MARGIN + padX + i * (pillW + gap);
    doc.setFillColor(...BEGE_L);
    doc.roundedRect(px, pillY, pillW, pillH, 2.5, 2.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text(String(val), px + pillW / 2, pillY + 10, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.6); doc.setTextColor(...BEGE);
    doc.text(String(lbl), px + pillW / 2, pillY + 16.5, { align: "center" });
  });

  // Rodapé do banner: contexto energético + hidratação
  if (hasFooter) {
    const footY = pillY + pillH + 5.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(200, 190, 170);
    if (subParts) doc.text(subParts, MARGIN + 7, footY);
    if (hydration) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BEGE_L);
      doc.text(`Hidratacao  ${hydration}`, w - MARGIN - 7, footY, { align: "right" });
    }
  }

  return y + bannerH + 5;
}

// 3 cards lado a lado do ciclo de carboidratos (alto=verde, moderado=bege, descanso=cinza).
function carbCyclingCards(doc: jsPDF, cc: any, y: number): number {
  const w = W(doc);
  const innerW = w - MARGIN * 2;
  const defs: { lbl: string; kcal: any; carbs: any; fill: [number, number, number]; accent: [number, number, number] }[] = [
    { lbl: "Dia Alto", kcal: first(cc.high_day_kcal, cc.high_kcal), carbs: first(cc.high_day_carbs_g, cc.high_carbs_g, cc.high), fill: [231, 244, 238], accent: GREEN },
    { lbl: "Moderado", kcal: first(cc.moderate_day_kcal, cc.moderate_kcal), carbs: first(cc.moderate_day_carbs_g, cc.moderate_carbs_g, cc.moderate), fill: BEGE_L, accent: BEGE },
    { lbl: "Descanso", kcal: first(cc.rest_day_kcal, cc.rest_kcal), carbs: first(cc.rest_day_carbs_g, cc.rest_carbs_g, cc.rest), fill: LIGHT, accent: GRAY },
  ];
  const cardH = 26;
  const gap = 3;
  const cw = (innerW - gap * 2) / 3;
  y = ensure(doc, y, cardH + 2);
  defs.forEach((d, i) => {
    const x = MARGIN + i * (cw + gap);
    doc.setFillColor(...d.fill);
    doc.roundedRect(x, y, cw, cardH, 2.5, 2.5, "F");
    doc.setFillColor(...d.accent);
    doc.roundedRect(x, y, cw, 1.6, 0.8, 0.8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
    doc.text(d.lbl, x + 4, y + 8);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...d.accent);
    const kcalStr = d.kcal != null ? `${asText(d.kcal)}` : "—";
    doc.text(kcalStr, x + 4, y + 16.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.4); doc.setTextColor(...GRAY);
    doc.text("kcal", x + 4 + doc.getTextWidth(kcalStr) + 1.5, y + 16.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...TEXT);
    doc.text(d.carbs != null ? `${asText(d.carbs)} g de carboidrato` : "carboidrato conforme treino", x + 4, y + 22);
  });
  return y + cardH + 5;
}

// Chip preenchido e arredondado (verde p/ exemplos, âmbar p/ evitar). Quebra de linha automática.
function drawChips(
  doc: jsPDF, items: string[], x: number, y: number, maxW: number,
  fill: [number, number, number], fg: [number, number, number]
): number {
  const chipH = 5.6;
  const padX = 2.4;
  const gap = 2;
  const lh = chipH + 2;
  let cx = x;
  let cy = y;
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
  items.forEach((raw) => {
    const txt = sanitize(raw).replace(/^[•\-–]\s*/, "").trim();
    if (!txt) return;
    const tw = doc.getTextWidth(txt);
    const chipW = tw + padX * 2;
    if (cx + chipW > x + maxW && cx > x) { cx = x; cy += lh; }
    cy = ensure(doc, cy, chipH);
    doc.setFillColor(...fill);
    doc.roundedRect(cx, cy - chipH + 1.4, chipW, chipH, 1.6, 1.6, "F");
    doc.setTextColor(...fg);
    doc.text(txt, cx + padX, cy - 0.6);
    cx += chipW + gap;
  });
  return cy + 2;
}

// Card de "momento" para nutrition_tips: faixa-título navy (branca) + corpo bege-claro + chips.
function tipCard(doc: jsPDF, t: any, y: number): number {
  const w = W(doc);
  const innerW = w - MARGIN * 2;
  const bodyX = MARGIN + 5;
  const bodyMaxW = innerW - 10;

  const title = `${asText(first(t.title, t.titulo, "Dica"))}`;
  const timing = t.timing ? asText(t.timing) : "";
  const goal = first(t.goal, t.objetivo);
  const howMuch = first(t.how_much, t.quantidade_aproximada);
  const exs = (t.examples || t.exemplos || []).map(asText).filter(Boolean);
  const av = (t.avoid || t.evitar || []).map(asText).filter(Boolean);

  // Pré-medir altura do corpo
  let bodyH = 4;
  if (goal != null) bodyH += measureLines(doc, `Objetivo: ${asText(goal)}`, bodyMaxW, 8, 4.2);
  if (howMuch != null) bodyH += measureLines(doc, `Quanto: ${asText(howMuch)}`, bodyMaxW, 8, 4.2);
  if (exs.length) bodyH += 4.5 + Math.ceil(exs.length / 3) * 7.6;
  if (av.length) bodyH += 4.5 + Math.ceil(av.length / 3) * 7.6;
  bodyH += 3;

  const headerH = 9;
  const totalH = headerH + bodyH;
  y = ensure(doc, y, totalH + 3);

  // Corpo bege-claro
  doc.setFillColor(...BEGE_L);
  doc.roundedRect(MARGIN, y, innerW, totalH, 2.5, 2.5, "F");
  // Faixa-título navy
  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGIN, y, innerW, headerH, 2.5, 2.5, "F");
  doc.rect(MARGIN, y + headerH - 3, innerW, 3, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  doc.text(title, MARGIN + 5, y + 6);
  if (timing) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...BEGE_L);
    doc.text(timing, w - MARGIN - 5, y + 6, { align: "right" });
  }

  let cy = y + headerH + 5;
  if (goal != null) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...BEGE);
    doc.text("OBJETIVO", bodyX, cy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TEXT);
    cy = wrapText(doc, asText(goal), bodyX + 16, cy, bodyMaxW - 16, 4.2) + 1;
  }
  if (howMuch != null) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...BEGE);
    doc.text("QUANTO", bodyX, cy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TEXT);
    cy = wrapText(doc, asText(howMuch), bodyX + 16, cy, bodyMaxW - 16, 4.2) + 1;
  }
  if (exs.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...GREEN);
    doc.text("EXEMPLOS", bodyX, cy + 2.5);
    cy = drawChips(doc, exs, bodyX, cy + 6.5, bodyMaxW, [221, 240, 231], [13, 92, 64]);
  }
  if (av.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...AMBER);
    doc.text("EVITAR", bodyX, cy + 2.5);
    cy = drawChips(doc, av, bodyX, cy + 6.5, bodyMaxW, AMBER_L, [150, 90, 25]);
  }

  return y + totalH + 4;
}

// Timeline vertical de blocos periodizados: faixa navy por bloco + foco/estratégia.
function periodizedBlocks(doc: jsPDF, blocks: any[], y: number): number {
  const w = W(doc);
  const innerW = w - MARGIN * 2;
  blocks.forEach((b: any, idx: number) => {
    const weeks = asText(first(b.weeks, b.semanas, `Bloco ${idx + 1}`));
    const load = asText(first(b.training_load, b.carga, ""));
    const focus = asText(first(b.nutrition_focus, b.foco, ""));
    const carb = asText(first(b.carb_strategy, b.estrategia_carbo, ""));
    const recovery = asText(first(b.recovery_priority, b.prioridade_recuperacao, ""));

    const detailParts = [
      focus ? `Foco: ${focus}` : "",
      carb ? `Carbo: ${carb}` : "",
      recovery ? `Recuperacao: ${recovery}` : "",
    ].filter(Boolean).join("   ·   ");

    const detailH = detailParts ? measureLines(doc, detailParts, innerW - 12, 7.5, 4) : 0;
    const headerH = 8;
    const totalH = headerH + (detailH ? detailH + 4 : 2);
    y = ensure(doc, y, totalH + 2);

    // Trilho da timeline (faixa bege fina à esquerda)
    doc.setFillColor(...BEGE);
    doc.rect(MARGIN, y, 2, totalH, "F");
    // Faixa navy do bloco
    doc.setFillColor(...NAVY);
    doc.roundedRect(MARGIN + 2, y, innerW - 2, headerH, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    doc.text(`Semanas ${weeks}`, MARGIN + 6, y + 5.4);
    if (load) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...BEGE_L);
      doc.text(load, w - MARGIN - 4, y + 5.4, { align: "right" });
    }
    if (detailParts) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...TEXT);
      wrapText(doc, detailParts, MARGIN + 6, y + headerH + 4, innerW - 12, 4);
    }
    y += totalH + 2.5;
  });
  return y + 2;
}

// Callout colorido com bullets curtos (quebra texto longo em itens por linha/ponto-e-vírgula).
function bulletCallout(doc: jsPDF, title: string, val: any, y: number, accent: [number, number, number], fill: [number, number, number]): number {
  const w = W(doc);
  const innerW = w - MARGIN * 2;
  const bodyMaxW = innerW - 12;

  // Normaliza para lista de bullets curtos
  let items: string[];
  if (Array.isArray(val)) {
    items = val.map(asText).filter(Boolean);
  } else {
    const raw = asText(val);
    items = raw.split(/\n|(?<=[.;])\s+(?=[A-ZÀ-Ý])/).map((s) => s.trim()).filter(Boolean);
    if (items.length <= 1) items = raw.split(/;\s*/).map((s) => s.trim()).filter(Boolean);
  }
  if (!items.length) return y;

  // Pré-medir
  let bodyH = 0;
  const measured = items.map((it) => {
    const h = measureLines(doc, `–  ${it}`, bodyMaxW, 8, 4.3);
    bodyH += h + 1.2;
    return h;
  });
  const headerH = 8;
  const totalH = headerH + bodyH + 4;
  y = ensure(doc, y, totalH + 3);

  doc.setFillColor(...fill);
  doc.roundedRect(MARGIN, y, innerW, totalH, 2.5, 2.5, "F");
  doc.setFillColor(...accent);
  doc.roundedRect(MARGIN, y, 2.2, totalH, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...accent);
  doc.text(sanitize(title).toUpperCase(), MARGIN + 6, y + 5.6);

  let cy = y + headerH + 4;
  items.forEach((it) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TEXT);
    cy = wrapText(doc, `–  ${it}`, MARGIN + 6, cy, bodyMaxW, 4.3) + 1.2;
  });
  return y + totalH + 4;
}

export function generateNutritionPDF(plan: any, meta: PDFMeta): jsPDF {
  const doc = new jsPDF();
  const w = W(doc);
  header(doc, "Plano Nutricional", asText(first(plan.plan_name, "Orientações práticas")), meta);
  let y = 42;

  // Banner energético — caixa navy preenchida com pílulas de macro + hidratação
  const es = plan.energy_summary;
  if (es && typeof es === "object") {
    y = energyBanner(doc, es, y);
  }

  // Ciclo de carboidratos — 3 cards lado a lado (alto/moderado/descanso)
  const cc = plan.carb_cycling;
  if (cc && typeof cc === "object" && !Array.isArray(cc)) {
    y = sectionTitle(doc, "Ciclo de carboidratos", y);
    y = carbCyclingCards(doc, cc, y);
  } else if (typeof cc === "string" && cc.trim()) {
    y = sectionTitle(doc, "Ciclo de carboidratos", y);
    y = calloutBox(doc, cc, y, "info");
  }

  // Orientações por momento — cada dica = 1 card de momento com chips
  const tips = plan.nutrition_tips || plan.tips || [];
  if (Array.isArray(tips) && tips.length) {
    y = sectionTitle(doc, "Orientações por momento", y);
    tips.forEach((t: any) => {
      if (!t || typeof t !== "object") return;
      y = tipCard(doc, t, y);
    });
    y += 1;
  }

  // Periodização nutricional — timeline de blocos
  const blocks = plan.periodized_blocks;
  if (Array.isArray(blocks) && blocks.length) {
    y = sectionTitle(doc, "Periodização nutricional", y);
    y = periodizedBlocks(doc, blocks.filter((b: any) => b && typeof b === "object"), y);
  }

  // Refeições do dia (quando a IA retornar cardápio estruturado)
  const meals = plan.daily_meals;
  if (Array.isArray(meals) && meals.length) {
    y = sectionTitle(doc, "Plano alimentar do dia", y);
    meals.forEach((m: any) => {
      if (!m || typeof m !== "object") return;
      y = ensure(doc, y, 10);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
      const ctx = m.context ? ` (${CTX_LABEL[m.context] || asText(m.context)})` : "";
      doc.text(`${asText(first(m.meal_name, "Refeição"))}${m.time ? " · " + asText(m.time) : ""}${ctx}`, MARGIN + 2, y);
      const macros = [m.calories ? `${asText(m.calories)}kcal` : "", m.protein_g ? `P${asText(m.protein_g)}` : "", m.carbs_g ? `C${asText(m.carbs_g)}` : "", m.fat_g ? `G${asText(m.fat_g)}` : ""].filter(Boolean).join(" · ");
      if (macros) { doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY); doc.text(macros, w - MARGIN, y, { align: "right" }); }
      y += 5;
      (m.foods || []).forEach((food: any) => {
        y = ensure(doc, y, 5);
        const name = typeof food === "string" ? food : asText(first(food.name, food.nome));
        const qty = typeof food === "object" ? asText(first(food.quantity, food.quantidade)) : "";
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TEXT);
        y = wrapText(doc, `–  ${name}${qty ? `  (${qty})` : ""}`, MARGIN + 5, y, w - MARGIN * 2 - 7, 4.2);
        if (food && food.notes) { doc.setFontSize(6.8); doc.setTextColor(...GRAY); y = wrapText(doc, asText(food.notes), MARGIN + 9, y, w - MARGIN * 2 - 11, 3.6) + 0.5; }
      });
      y += 2.5;
    });
  }

  // Suplementação — cards limpos
  const supp = plan.supplementation;
  if (Array.isArray(supp) && supp.length) {
    y = sectionTitle(doc, "Suplementação", y);
    const innerW = w - MARGIN * 2;
    supp.forEach((s: any) => {
      if (!s || typeof s !== "object") return;
      const name = `${asText(first(s.supplement, s.nome, "Suplemento"))}`;
      const dose = s.dose ? asText(s.dose) : "";
      const line = [s.timing ? asText(s.timing) : "", s.reason ? asText(s.reason) : ""].filter(Boolean).join("  ·  ");
      const lineH = line ? measureLines(doc, line, innerW - 14, 7.2, 3.9) : 0;
      const cardH = 9 + (lineH ? lineH + 2 : 1);
      y = ensure(doc, y, cardH + 2);
      doc.setFillColor(...LIGHT);
      doc.roundedRect(MARGIN, y, innerW, cardH, 2, 2, "F");
      doc.setFillColor(...NAVY);
      doc.roundedRect(MARGIN, y, 2, cardH, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.4); doc.setTextColor(...NAVY);
      doc.text(name, MARGIN + 6, y + 6);
      if (dose) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...AMBER);
        const dw = doc.getTextWidth(dose) + 6;
        doc.setFillColor(...AMBER_L);
        doc.roundedRect(w - MARGIN - dw - 2, y + 2, dw, 5.6, 1.4, 1.4, "F");
        doc.text(dose, w - MARGIN - 2 - dw / 2, y + 5.8, { align: "center" });
      }
      if (line) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(...GRAY);
        wrapText(doc, line, MARGIN + 6, y + 11, innerW - 12, 3.9);
      }
      y += cardH + 3;
    });
    y += 1;
  }

  // Substituições inteligentes — cards limpos (original -> alternativas em verde)
  const subs = plan.substitutions;
  if (Array.isArray(subs) && subs.length) {
    y = sectionTitle(doc, "Substituições inteligentes", y);
    const innerW = w - MARGIN * 2;
    subs.forEach((s: any) => {
      if (!s || typeof s !== "object") return;
      const orig = asText(first(s.original, s.de, "—"));
      const altsRaw = first(s.alternatives, s.alternativas);
      const alts = Array.isArray(altsRaw) ? altsRaw.map(asText).filter(Boolean) : (altsRaw != null ? [asText(altsRaw)] : []);
      const altLine = alts.join("  ·  ");
      const altH = altLine ? measureLines(doc, altLine, innerW - 14, 7.5, 4) : 0;
      const cardH = 8 + (altH ? altH + 2 : 1);
      y = ensure(doc, y, cardH + 2);
      doc.setFillColor(...BEGE_L);
      doc.roundedRect(MARGIN, y, innerW, cardH, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
      doc.text(orig, MARGIN + 5, y + 5.6);
      if (altLine) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GREEN);
        wrapText(doc, `em vez disso: ${altLine}`, MARGIN + 5, y + 10.5, innerW - 10, 4);
      }
      y += cardH + 3;
    });
    y += 1;
  }

  // Protocolos longos — callouts coloridos com bullets curtos
  const protos: { lbl: string; val: any; accent: [number, number, number]; fill: [number, number, number] }[] = [
    { lbl: "Protocolo pré-prova / corrida longa", val: plan.pre_race_gi_protocol, accent: NAVY, fill: LIGHT },
    { lbl: "Estratégia intra-treino", val: plan.intra_workout_protocol, accent: GREEN, fill: [231, 244, 238] },
    { lbl: "Ajustes nos dias de descanso", val: plan.rest_day_adjustments, accent: BEGE, fill: BEGE_L },
    { lbl: "Observações gerais", val: first(plan.general_notes, plan.observations), accent: AMBER, fill: AMBER_L },
  ];
  protos.forEach(({ lbl, val, accent, fill }) => {
    if (val == null || (Array.isArray(val) && !val.length) || (typeof val === "string" && !val.trim())) return;
    y = bulletCallout(doc, lbl, val, y, accent, fill);
  });

  y = warningsBlock(doc, plan.warnings, y);
  stampFooters(doc, meta);
  return doc;
}

// ── PDF da AVALIAÇÃO FUNCIONAL (laudo entregável ao aluno) ───────────────────
// PDF da Avaliação Funcional — réplica da estética de referência (capa + stat cards +
// cobertura do protocolo + cards de foto com miniatura, badge nº e severidade).
// frameImages: dataURLs das fotos na ordem das vistas (opcional).
export function generateAssessmentPDF(data: any, meta: PDFMeta, frameImages?: string[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = W(doc);
  const json = data?.assessment_json ?? data ?? {};
  const vistas: any[] = Array.isArray(json?.vistas) ? json.vistas : [];
  const expected: any[] = Array.isArray(json?.expected_movements) ? json.expected_movements : [];
  const nVistas = vistas.length;
  const nExpected = expected.length || nVistas || 1;
  const totalComp = json?.total_compensacoes ?? vistas.reduce((s: number, v: any) => s + (Array.isArray(v?.compensacoes) ? v.compensacoes.length : 0), 0);
  const coverage = Math.min(100, Math.round((nVistas / nExpected) * 100));
  const prof = meta.professional || "Matheus Loreto";
  const cref = meta.cref || "040718-G/SC";

  // ── Cabeçalho da capa ──
  let y = 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text("RELATÓRIO DE AVALIAÇÃO", MARGIN, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...NAVY);
  doc.text(prof, pageW - MARGIN, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...BEGE);
  doc.text(`CREF ${cref}`, pageW - MARGIN, y + 4.5, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(...NAVY);
  doc.text("Avaliação Funcional", MARGIN, y);
  y += 4;
  doc.setDrawColor(...LIGHT); doc.setLineWidth(0.4); doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 9;

  // ── Pill "AVALIAÇÃO COMPLETA" ──
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  const pillTxt = "AVALIAÇÃO COMPLETA";
  const pillW = doc.getTextWidth(pillTxt) + 10;
  doc.setFillColor(...BEGE_L); doc.roundedRect(MARGIN, y, pillW, 7, 3.5, 3.5, "F");
  doc.setTextColor(...BEGE); doc.text(pillTxt, MARGIN + 5, y + 4.8);
  y += 15;

  // ── Nome + data ──
  doc.setFont("helvetica", "bold"); doc.setFontSize(30); doc.setTextColor(...NAVY);
  doc.text(sanitize(meta.studentName || "Aluno"), MARGIN, y);
  y += 7;
  doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.setTextColor(...GRAY);
  doc.text(meta.date, MARGIN, y);
  y += 9;

  // ── 3 stat cards ──
  const gap = 4;
  const cardW = (pageW - MARGIN * 2 - gap * 2) / 3;
  const cardH = 24;
  const cards: [string, string, string][] = [
    ["FOTOS", String(nVistas), "registradas"],
    ["VISTAS", String(nVistas), `de ${nExpected}`],
    ["COBERTURA", `${coverage}%`, "protocolo"],
  ];
  cards.forEach((c, i) => {
    const x = MARGIN + i * (cardW + gap);
    doc.setDrawColor(...LIGHT); doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");
    doc.setFillColor(...BEGE); doc.roundedRect(x, y, 1.4, cardH, 0.7, 0.7, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...BEGE);
    doc.text(c[0], x + 5, y + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...NAVY);
    doc.text(c[1], x + 5, y + 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(c[2], x + 5, y + 21);
  });
  y += cardH + 10;

  // ── Cobertura do protocolo ──
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...BEGE);
  doc.text("COBERTURA DO PROTOCOLO", MARGIN, y); y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NAVY);
  doc.text("Vistas registradas", MARGIN, y); y += 7;
  const listNames = (expected.length ? expected : vistas.map((v: any) => v?.vista)).map((x: any) => sanitize(String(x || "")));
  const colW = (pageW - MARGIN * 2) / 2;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  let listMaxY = y;
  listNames.forEach((name: string, i: number) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + col * colW;
    const yy = y + row * 6;
    doc.setFillColor(...BEGE); doc.circle(x + 1.5, yy - 1.2, 1.1, "F");
    doc.setTextColor(...TEXT); doc.text(name, x + 5, yy);
    listMaxY = Math.max(listMaxY, yy);
  });
  y = listMaxY + 11;

  // ── Registro fotográfico (título) ──
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...BEGE);
  doc.text("REGISTRO FOTOGRÁFICO", MARGIN, y); y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...NAVY);
  doc.text(`${nVistas} fotos  ·  ${totalComp} compensações`, MARGIN, y); y += 8;

  // ── Cards de foto (um por vista) ──
  const sevColor = (s: string): [number, number, number] => {
    const x = (s || "").toLowerCase();
    if (x.includes("sever") || x.includes("grave") || x.includes("alta")) return [200, 60, 60];
    if (x.includes("moder")) return AMBER;
    return GREEN;
  };
  vistas.forEach((v: any, i: number) => {
    const comps: any[] = Array.isArray(v?.compensacoes) ? v.compensacoes : [];
    const imgSize = 30;
    const cardH2 = Math.max(imgSize + 8, 16 + Math.max(1, comps.length) * 6);
    y = ensure(doc, y, cardH2 + 6);
    doc.setDrawColor(...LIGHT); doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, cardH2, 2.5, 2.5, "FD");
    const imgX = MARGIN + 4, imgY = y + 4;
    if (frameImages && frameImages[i]) {
      try { doc.addImage(frameImages[i], "JPEG", imgX, imgY, imgSize, imgSize); } catch { /* ignora imagem inválida */ }
    } else {
      doc.setFillColor(...LIGHT); doc.roundedRect(imgX, imgY, imgSize, imgSize, 1.5, 1.5, "F");
    }
    doc.setFillColor(...NAVY); doc.roundedRect(imgX, imgY, 9, 6, 1, 1, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1).padStart(2, "0"), imgX + 4.5, imgY + 4.2, { align: "center" });
    const tx = imgX + imgSize + 6;
    let ty = imgY + 3;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(`FOTO ${String(i + 1).padStart(2, "0")} DE ${nVistas}`, tx, ty); ty += 5.5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NAVY);
    doc.text(sanitize(String(v?.vista || "Vista")), tx, ty); ty += 6;
    if (!comps.length) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...GRAY);
      doc.text("Nenhuma compensação registrada", tx, ty);
    } else {
      comps.forEach((c: any) => {
        const sev = sanitize(String(first(c?.severidade, c?.severity, c?.gravidade, "Leve")));
        const col = sevColor(sev);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
        const bw = doc.getTextWidth(sev) + 6;
        doc.setDrawColor(...col); doc.setLineWidth(0.4);
        doc.roundedRect(tx, ty - 3.4, bw, 5, 2.5, 2.5, "D");
        doc.setTextColor(...col); doc.text(sev, tx + 3, ty);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...TEXT);
        const desc = sanitize(String(first(c?.descricao, c?.description, c?.nome, "")));
        const lines = doc.splitTextToSize(desc, pageW - MARGIN - (tx + bw + 3));
        doc.text(lines, tx + bw + 3, ty);
        ty += Math.max(6, lines.length * 4.5 + 1.5);
      });
    }
    y += cardH2 + 6;
  });

  // ── Plano corretivo (mobilizar + ativar) — entregável acionável para o aluno ──
  const plano = json?.plano_corretivo || {};
  const alongarList: string[] = Array.isArray(plano?.alongar) ? plano.alongar : [];
  const ativarList: string[] = Array.isArray(plano?.ativar) ? plano.ativar : [];
  if (alongarList.length || ativarList.length) {
    y = ensure(doc, y, 30);
    y = sectionTitle(doc, "Seu plano corretivo", y);
    const colW = (pageW - MARGIN * 2 - 6) / 2;
    const startY = y;
    const renderCol = (x: number, title: string, items: string[]) => {
      let cy = startY;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
      doc.text(title, x, cy); cy += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...TEXT);
      (items.length ? items : ["—"]).forEach((it) => {
        const lines = doc.splitTextToSize(`•  ${sanitize(String(it))}`, colW);
        doc.text(lines, x, cy); cy += lines.length * 4.4 + 1.5;
      });
      return cy;
    };
    const y1 = renderCol(MARGIN, "MOBILIZAR / ALONGAR", alongarList);
    const y2 = renderCol(MARGIN + colW + 6, "ATIVAR / FORTALECER", ativarList);
    y = Math.max(y1, y2) + 3;
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text("Exercícios da sua biblioteca — seu treinador integra ao plano e progride quando você evoluir.", MARGIN, y);
    y += 7;
  }

  const reportText = asText(first(data?.report_text, json?.relatorio_para_aluno, json?.report_text));
  if (reportText) {
    y = ensure(doc, y, 16);
    y = sectionTitle(doc, "Laudo", y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...TEXT);
    wrapText(doc, reportText, MARGIN, y, pageW - MARGIN * 2, 5);
  }

  stampFooters(doc, meta);
  return doc;
}

// ── Orquestrador ────────────────────────────────────────────────────────────
export interface GeneratedPDF { modality: string; label: string; doc: jsPDF; filename: string; }

export function generateAllPDFs(results: any, meta: PDFMeta): GeneratedPDF[] {
  const out: GeneratedPDF[] = [];
  const safeName = (meta.studentName || "Aluno").replace(/\s+/g, "_");

  if (results.musculacao) {
    out.push({ modality: "musculacao", label: "Musculação", doc: generateStrengthPDF(results.musculacao, meta), filename: `Musculacao_${safeName}.pdf` });
  }
  if (results.corrida) {
    out.push({ modality: "corrida", label: "Corrida", doc: generateCardioPDF(results.corrida, meta, "Corrida"), filename: `Corrida_${safeName}.pdf` });
  }
  if (results.natacao) {
    out.push({ modality: "natacao", label: "Natação", doc: generateCardioPDF(results.natacao, meta, "Natação"), filename: `Natacao_${safeName}.pdf` });
  }
  if (results.ciclismo) {
    out.push({ modality: "ciclismo", label: "Ciclismo", doc: generateCardioPDF(results.ciclismo, meta, "Ciclismo"), filename: `Ciclismo_${safeName}.pdf` });
  }
  if (results.nutricao) {
    out.push({ modality: "nutricao", label: "Nutrição", doc: generateNutritionPDF(results.nutricao, meta), filename: `Nutricao_${safeName}.pdf` });
  }
  return out;
}
