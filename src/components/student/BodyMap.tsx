import { useMemo } from "react";
import { BodyMap3D } from "./BodyMap3D";

interface MuscleVolume {
  muscleGroup: string;
  volume: number;
}

interface BodyMapProps {
  muscleVolumes: MuscleVolume[];
}

const MUSCLE_MAP: Record<string, { regions: string[]; label: string }> = {
  "Peitoral": { regions: ["chest"], label: "Peitoral" },
  "Peito": { regions: ["chest"], label: "Peito" },
  "Costas": { regions: ["upper-back", "lower-back"], label: "Costas" },
  "Dorsal": { regions: ["upper-back"], label: "Dorsal" },
  "Trapézio": { regions: ["traps"], label: "Trapézio" },
  "Deltoides": { regions: ["shoulders"], label: "Deltoides" },
  "Ombro": { regions: ["shoulders"], label: "Ombro" },
  "Bíceps": { regions: ["biceps"], label: "Bíceps" },
  "Tríceps": { regions: ["triceps"], label: "Tríceps" },
  "Antebraço": { regions: ["forearms"], label: "Antebraço" },
  "Quadríceps": { regions: ["quads"], label: "Quadríceps" },
  "Posterior": { regions: ["hamstrings"], label: "Posterior" },
  "Glúteos": { regions: ["glutes"], label: "Glúteos" },
  "Panturrilha": { regions: ["calves"], label: "Panturrilha" },
  "Abdômen": { regions: ["abs"], label: "Abdômen" },
  "Core": { regions: ["abs"], label: "Core" },
};

function getHeatColor(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));
  if (clamped === 0) return "hsl(220 10% 18%)";
  if (clamped < 0.25) return "hsl(220 60% 30%)";
  if (clamped < 0.5) return "hsl(220 70% 45%)";
  if (clamped < 0.75) return "hsl(30 80% 50%)";
  return "hsl(0 72% 51%)";
}

export function BodyMap({ muscleVolumes }: BodyMapProps) {
  const { regionColors } = useMemo(() => {
    const regionVolumes: Record<string, number> = {};
    let max = 0;

    muscleVolumes.forEach(({ muscleGroup, volume }) => {
      const mapping = Object.entries(MUSCLE_MAP).find(([key]) =>
        muscleGroup.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(muscleGroup.toLowerCase())
      );
      if (mapping) {
        mapping[1].regions.forEach(region => {
          regionVolumes[region] = (regionVolumes[region] || 0) + volume;
          if (regionVolumes[region] > max) max = regionVolumes[region];
        });
      }
    });

    const colors: Record<string, string> = {};
    Object.entries(regionVolumes).forEach(([region, vol]) => {
      colors[region] = getHeatColor(max > 0 ? vol / max : 0);
    });

    return { regionColors: colors };
  }, [muscleVolumes]);

  return (
    <div className="flex flex-col items-center gap-4">
      <BodyMap3D regionColors={regionColors} muscleVolumes={muscleVolumes} />

      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-sans">
        <span>Menos</span>
        <div className="flex gap-0.5">
          {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
            <div key={i} className="w-5 h-3 rounded-sm" style={{ backgroundColor: getHeatColor(v) }} />
          ))}
        </div>
        <span>Mais</span>
      </div>

      {/* Volume list */}
      {muscleVolumes.filter(m => m.volume > 0).length > 0 && (
        <div className="w-full space-y-1">
          {muscleVolumes
            .filter(m => m.volume > 0)
            .sort((a, b) => b.volume - a.volume)
            .map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs font-sans">
                <span className="text-foreground">{m.muscleGroup}</span>
                <span className="text-muted-foreground">{m.volume.toLocaleString("pt-BR")}kg</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
