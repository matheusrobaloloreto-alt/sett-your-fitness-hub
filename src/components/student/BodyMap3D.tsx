import { useState, useMemo } from "react";

interface RegionColors {
  [region: string]: string;
}

interface BodyMap3DProps {
  regionColors: RegionColors;
  muscleVolumes: { muscleGroup: string; volume: number }[];
}

// Map internal region keys to SVG muscle data-muscle keys
const REGION_TO_SVG: Record<string, string[]> = {
  chest: ["peito"],
  shoulders: ["ombros"],
  traps: ["trapezio"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["antebraco"],
  abs: ["abdomen", "obliquos"],
  "upper-back": ["dorsais", "romboides", "infraespinhal"],
  "lower-back": ["lombar"],
  glutes: ["gluteos"],
  quads: ["quadriceps", "adutores", "hip_flexor"],
  hamstrings: ["posterior"],
  calves: ["panturrilha", "tibial"],
};

const SVG_TO_REGION: Record<string, string> = {};
Object.entries(REGION_TO_SVG).forEach(([region, svgKeys]) => {
  svgKeys.forEach(k => { SVG_TO_REGION[k] = region; });
});

const SVG_LABELS: Record<string, string> = {
  peito: "Peitoral",
  ombros: "Deltoides",
  trapezio: "Trapézio",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebraco: "Antebraço",
  abdomen: "Abdômen",
  obliquos: "Oblíquos",
  dorsais: "Dorsais",
  romboides: "Romboides",
  infraespinhal: "Infraespinhal",
  lombar: "Lombar",
  gluteos: "Glúteos",
  quadriceps: "Quadríceps",
  adutores: "Adutores",
  hip_flexor: "Flexor do Quadril",
  posterior: "Posterior",
  panturrilha: "Panturrilha",
  tibial: "Tibial",
};

function getMuscleColor(svgKey: string, regionColors: RegionColors): string | undefined {
  const region = SVG_TO_REGION[svgKey];
  if (region && regionColors[region]) return regionColors[region];
  return undefined;
}

interface MusclePathProps {
  d: string;
  muscle: string;
  regionColors: RegionColors;
  onHover: (muscle: string | null) => void;
  hoveredMuscle: string | null;
}

function MusclePath({ d, muscle, regionColors, onHover, hoveredMuscle }: MusclePathProps) {
  const color = getMuscleColor(muscle, regionColors);
  const isHovered = hoveredMuscle === muscle;
  return (
    <path
      d={d}
      fill={color || "hsl(var(--muted))"}
      stroke={color ? "hsl(220 70% 35%)" : "hsl(var(--border))"}
      strokeWidth={color ? 0.5 : 0.3}
      opacity={isHovered ? 0.8 : 1}
      style={{ transition: "fill 0.4s ease", cursor: "pointer" }}
      onMouseEnter={() => onHover(muscle)}
      onMouseLeave={() => onHover(null)}
    />
  );
}

function FrontBody({ regionColors, onHover, hoveredMuscle }: { regionColors: RegionColors; onHover: (m: string | null) => void; hoveredMuscle: string | null }) {
  const mp = (d: string, muscle: string) => (
    <MusclePath key={d.slice(0,20)+muscle} d={d} muscle={muscle} regionColors={regionColors} onHover={onHover} hoveredMuscle={hoveredMuscle} />
  );

  return (
    <svg viewBox="0 0 200 480" className="w-full max-w-[180px]" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <ellipse cx="100" cy="32" rx="22" ry="28" fill="hsl(var(--muted))" stroke="none" />
      {/* Neck/shoulder base skin */}
      <path d="M88,56 Q80,56 76,62 L72,72 Q70,78 74,80 L86,76 L100,74 L114,76 L126,80 Q130,78 128,72 L124,62 Q120,56 112,56 Z" fill="hsl(var(--muted))" stroke="none" />

      {/* Traps */}
      {mp("M86,56 L100,56 L100,72 L86,72 Q82,68 82,62 Z", "trapezio")}
      {mp("M100,56 L114,56 Q118,62 118,68 L118,72 L100,72 Z", "trapezio")}

      {/* Shoulders */}
      {mp("M76,62 Q64,64 60,78 L58,92 Q58,100 64,104 L72,100 L80,90 L86,76 L86,72 Q82,66 76,62 Z", "ombros")}
      {mp("M124,62 Q136,64 140,78 L142,92 Q142,100 136,104 L128,100 L120,90 L114,76 L114,72 Q118,66 124,62 Z", "ombros")}

      {/* Chest */}
      {mp("M80,76 L100,74 L100,120 L84,118 Q76,114 74,104 L74,88 Z", "peito")}
      {mp("M100,74 L120,76 L126,88 L126,104 Q124,114 116,118 L100,120 Z", "peito")}
      <line x1="100" y1="76" x2="100" y2="120" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />

      {/* Biceps */}
      {mp("M64,106 Q56,112 54,128 L52,152 Q52,164 58,168 L66,166 Q74,162 74,148 L76,126 L76,98 Q72,100 64,106 Z", "biceps")}
      {mp("M136,106 Q144,112 146,128 L148,152 Q148,164 142,168 L134,166 Q126,162 126,148 L124,126 L124,98 Q128,100 136,106 Z", "biceps")}

      {/* Forearms */}
      {mp("M56,170 Q48,178 46,198 L44,228 Q44,238 50,244 L56,242 Q64,236 64,220 L66,196 L66,178 Q62,172 56,170 Z", "antebraco")}
      {mp("M144,170 Q152,178 154,198 L156,228 Q156,238 150,244 L144,242 Q136,236 136,220 L134,196 L134,178 Q138,172 144,170 Z", "antebraco")}

      {/* Hands */}
      <ellipse cx="46" cy="256" rx="7" ry="10" fill="hsl(var(--muted))" stroke="none" />
      <ellipse cx="154" cy="256" rx="7" ry="10" fill="hsl(var(--muted))" stroke="none" />

      {/* Abs */}
      {mp("M92,122 L100,122 L100,148 L92,148 Z", "abdomen")}
      {mp("M100,122 L108,122 L108,148 L100,148 Z", "abdomen")}
      {mp("M92,150 L100,150 L100,174 L92,174 Z", "abdomen")}
      {mp("M100,150 L108,150 L108,174 L100,174 Z", "abdomen")}
      {mp("M92,176 L100,176 L100,200 L94,202 Z", "abdomen")}
      {mp("M100,176 L108,176 L106,202 L100,200 Z", "abdomen")}
      <line x1="100" y1="122" x2="100" y2="200" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />
      <line x1="92" y1="148" x2="108" y2="148" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />
      <line x1="92" y1="174" x2="108" y2="174" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />

      {/* Obliques */}
      {mp("M82,120 L92,120 L92,204 L86,210 Q78,206 76,190 L76,140 Q76,124 82,120 Z", "obliquos")}
      {mp("M108,120 L118,120 Q124,124 124,140 L124,190 Q122,206 114,210 L108,204 Z", "obliquos")}

      {/* Hip flexors */}
      {mp("M80,212 L100,206 L100,224 L84,226 Q80,224 80,218 Z", "hip_flexor")}
      {mp("M100,206 L120,212 Q120,218 120,224 L116,226 L100,224 Z", "hip_flexor")}

      {/* Adductors */}
      {mp("M92,228 L100,226 L100,310 Q98,318 96,318 Q92,316 90,300 L88,260 Z", "adutores")}
      {mp("M100,226 L108,228 L112,260 L110,300 Q108,316 104,318 Q102,318 100,310 Z", "adutores")}

      {/* Quads */}
      {mp("M80,228 L92,226 L88,260 L86,310 Q84,330 82,334 L78,334 Q72,326 72,306 L72,268 Q72,240 80,228 Z", "quadriceps")}
      {mp("M108,226 L120,228 Q128,240 128,268 L128,306 Q128,326 122,334 L118,334 Q116,330 114,310 L112,260 Z", "quadriceps")}
      <line x1="86" y1="260" x2="86" y2="330" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />
      <line x1="114" y1="260" x2="114" y2="330" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />

      {/* Knees */}
      <rect x="80" y="338" width="16" height="12" rx="5" fill="hsl(var(--muted))" stroke="none" />
      <rect x="104" y="338" width="16" height="12" rx="5" fill="hsl(var(--muted))" stroke="none" />

      {/* Tibialis / Calves front */}
      {mp("M80,354 Q76,360 76,380 L76,418 Q76,432 82,436 L88,434 Q92,428 92,412 L92,378 Q92,358 88,354 Z", "tibial")}
      {mp("M112,354 Q108,358 108,378 L108,412 Q108,428 112,434 L118,436 Q124,432 124,418 L124,380 Q124,360 120,354 Z", "tibial")}

      {/* Feet */}
      <ellipse cx="84" cy="448" rx="12" ry="6" fill="hsl(var(--muted))" stroke="none" />
      <ellipse cx="116" cy="448" rx="12" ry="6" fill="hsl(var(--muted))" stroke="none" />
    </svg>
  );
}

function BackBody({ regionColors, onHover, hoveredMuscle }: { regionColors: RegionColors; onHover: (m: string | null) => void; hoveredMuscle: string | null }) {
  const mp = (d: string, muscle: string) => (
    <MusclePath key={d.slice(0,20)+muscle} d={d} muscle={muscle} regionColors={regionColors} onHover={onHover} hoveredMuscle={hoveredMuscle} />
  );

  return (
    <svg viewBox="0 0 200 480" className="w-full max-w-[180px]" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <ellipse cx="100" cy="32" rx="22" ry="28" fill="hsl(var(--muted))" stroke="none" />
      {/* Neck/shoulder base */}
      <path d="M88,56 Q80,56 76,62 L72,72 Q70,78 74,80 L86,76 L100,74 L114,76 L126,80 Q130,78 128,72 L124,62 Q120,56 112,56 Z" fill="hsl(var(--muted))" stroke="none" />

      {/* Traps */}
      {mp("M86,56 L100,56 L100,90 L88,96 Q82,90 82,80 L82,64 Z", "trapezio")}
      {mp("M100,56 L114,56 L118,64 L118,80 Q118,90 112,96 L100,90 Z", "trapezio")}

      {/* Rear delts */}
      {mp("M76,62 Q64,64 60,78 L58,92 Q58,100 64,104 L72,100 L80,90 L86,76 L86,72 Q82,66 76,62 Z", "ombros")}
      {mp("M124,62 Q136,64 140,78 L142,92 Q142,100 136,104 L128,100 L120,90 L114,76 L114,72 Q118,66 124,62 Z", "ombros")}

      {/* Rhomboids */}
      {mp("M88,76 L100,74 L100,108 L90,112 Q86,108 86,98 Z", "romboides")}
      {mp("M100,74 L112,76 L114,98 Q114,108 110,112 L100,108 Z", "romboides")}

      {/* Infraspinatus */}
      {mp("M86,78 Q78,80 76,92 L78,98 L90,96 L92,88 L92,80 Z", "infraespinhal")}
      {mp("M114,78 Q122,80 124,92 L122,98 L110,96 L108,88 L108,80 Z", "infraespinhal")}
      <line x1="100" y1="74" x2="100" y2="108" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />

      {/* Lats */}
      {mp("M78,98 L90,96 L92,114 L94,170 L92,188 Q86,196 80,192 L76,178 L74,148 Q74,112 78,98 Z", "dorsais")}
      {mp("M110,96 L122,98 Q126,112 126,148 L124,178 L120,192 Q114,196 108,188 L106,170 L108,114 Z", "dorsais")}

      {/* Triceps */}
      {mp("M64,106 Q56,112 54,128 L52,152 Q52,164 58,168 L66,166 Q74,162 74,148 L76,126 L76,98 Q72,100 64,106 Z", "triceps")}
      {mp("M136,106 Q144,112 146,128 L148,152 Q148,164 142,168 L134,166 Q126,162 126,148 L124,126 L124,98 Q128,100 136,106 Z", "triceps")}

      {/* Forearms */}
      {mp("M56,170 Q48,178 46,198 L44,228 Q44,238 50,244 L56,242 Q64,236 64,220 L66,196 L66,178 Q62,172 56,170 Z", "antebraco")}
      {mp("M144,170 Q152,178 154,198 L156,228 Q156,238 150,244 L144,242 Q136,236 136,220 L134,196 L134,178 Q138,172 144,170 Z", "antebraco")}

      {/* Hands */}
      <ellipse cx="46" cy="256" rx="7" ry="10" fill="hsl(var(--muted))" stroke="none" />
      <ellipse cx="154" cy="256" rx="7" ry="10" fill="hsl(var(--muted))" stroke="none" />

      {/* Erector spinae / Lower back */}
      {mp("M92,110 L100,108 L100,200 L96,206 Q90,200 90,186 L90,130 Z", "lombar")}
      {mp("M100,108 L108,110 L110,130 L110,186 Q110,200 104,206 L100,200 Z", "lombar")}
      <line x1="100" y1="108" x2="100" y2="200" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />

      {/* Glutes */}
      {mp("M76,198 L100,204 L100,248 Q98,258 92,260 L82,258 Q74,252 74,238 L74,212 Z", "gluteos")}
      {mp("M100,204 L124,198 L126,212 L126,238 Q126,252 118,258 L108,260 Q102,258 100,248 Z", "gluteos")}
      <line x1="100" y1="204" x2="100" y2="250" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />

      {/* Hamstrings */}
      {mp("M78,264 L98,262 L96,340 Q94,352 90,354 L84,354 Q78,350 76,336 L74,300 Z", "posterior")}
      {mp("M102,262 L122,264 L126,300 L124,336 Q122,350 116,354 L110,354 Q106,352 104,340 Z", "posterior")}
      <line x1="100" y1="262" x2="100" y2="348" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />

      {/* Knees */}
      <rect x="82" y="358" width="14" height="12" rx="5" fill="hsl(var(--muted))" stroke="none" />
      <rect x="104" y="358" width="14" height="12" rx="5" fill="hsl(var(--muted))" stroke="none" />

      {/* Calves */}
      {mp("M78,374 Q74,380 74,398 L76,428 Q78,440 84,442 L90,440 Q96,436 96,420 L96,394 Q96,378 92,374 Z", "panturrilha")}
      {mp("M108,374 Q104,378 104,394 L104,420 Q104,436 110,440 L116,442 Q122,440 124,428 L126,398 Q126,380 122,374 Z", "panturrilha")}
      <line x1="84" y1="380" x2="84" y2="436" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />
      <line x1="116" y1="380" x2="116" y2="436" stroke="hsl(var(--border))" strokeWidth="0.2" opacity="0.2" />

      {/* Feet */}
      <ellipse cx="84" cy="454" rx="12" ry="6" fill="hsl(var(--muted))" stroke="none" />
      <ellipse cx="116" cy="454" rx="12" ry="6" fill="hsl(var(--muted))" stroke="none" />
    </svg>
  );
}

type View = "front" | "back" | "both";

export function BodyMap3D({ regionColors, muscleVolumes }: BodyMap3DProps) {
  const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null);
  const [view, setView] = useState<View>("both");

  const hoveredLabel = hoveredMuscle ? SVG_LABELS[hoveredMuscle] : null;
  const hoveredVolume = useMemo(() => {
    if (!hoveredMuscle) return null;
    const region = SVG_TO_REGION[hoveredMuscle];
    if (!region) return null;
    const mapping = Object.entries(REGION_TO_SVG).find(([r]) => r === region);
    if (!mapping) return null;
    // Find volume from muscleVolumes for this region
    const vol = muscleVolumes.find(m => {
      const regionKeys = Object.entries(REGION_TO_SVG);
      return regionKeys.some(([r, svgKeys]) => r === region && m.muscleGroup.toLowerCase().includes(SVG_LABELS[svgKeys[0]]?.toLowerCase() || ""));
    });
    return vol?.volume;
  }, [hoveredMuscle, muscleVolumes]);

  const viewButtons: { key: View; label: string }[] = [
    { key: "front", label: "Frente" },
    { key: "back", label: "Costas" },
    { key: "both", label: "Ambos" },
  ];

  return (
    <div className="relative w-full">
      {/* View toggle */}
      <div className="flex justify-center gap-2 mb-3">
        {viewButtons.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-1 text-xs rounded-full font-medium transition-colors ${
              view === key
                ? "bg-foreground text-background"
                : "bg-transparent text-muted-foreground border border-border hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body SVGs */}
      <div className="flex justify-center gap-6 items-start">
        {view !== "back" && (
          <div className="text-center">
            <FrontBody regionColors={regionColors} onHover={setHoveredMuscle} hoveredMuscle={hoveredMuscle} />
            <p className="text-[10px] text-muted-foreground mt-1 font-sans">Frente</p>
          </div>
        )}
        {view !== "front" && (
          <div className="text-center">
            <BackBody regionColors={regionColors} onHover={setHoveredMuscle} hoveredMuscle={hoveredMuscle} />
            <p className="text-[10px] text-muted-foreground mt-1 font-sans">Costas</p>
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      {hoveredLabel && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur border border-border rounded-md px-3 py-1 text-xs font-sans text-foreground pointer-events-none z-10">
          {hoveredLabel}
          {hoveredVolume != null && <span className="ml-2 text-muted-foreground">{hoveredVolume.toLocaleString("pt-BR")}kg</span>}
        </div>
      )}
    </div>
  );
}
