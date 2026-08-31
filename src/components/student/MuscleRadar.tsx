import { useMemo } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";

interface MuscleVolume {
  muscleGroup: string;
  volume: number;
}

interface MuscleRadarProps {
  muscleVolumes: MuscleVolume[];
}

// Aggregates volume per muscle group and renders a radar (spider) chart.
export function MuscleRadar({ muscleVolumes }: MuscleRadarProps) {
  const { data, hasData, maxVolume } = useMemo(() => {
    const agg: Record<string, number> = {};
    muscleVolumes.forEach(({ muscleGroup, volume }) => {
      const anatomicalGroup = canonicalAnatomicalMuscleGroup(muscleGroup);
      if (!anatomicalGroup) return;
      agg[anatomicalGroup] = (agg[anatomicalGroup] || 0) + (volume || 0);
    });

    const entries = Object.entries(agg)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);

    const max = entries.reduce((m, [, v]) => Math.max(m, v), 0);

    return {
      data: entries.map(([muscleGroup, volume]) => ({
        muscleGroup,
        volume,
      })),
      hasData: entries.length >= 3,
      maxVolume: max,
    };
  }, [muscleVolumes]);

  if (!hasData) {
    return (
      <div className="flex h-[260px] flex-col items-center justify-center text-center">
        <p className="text-sm font-sans text-muted-foreground">
          Registre treinos em ao menos 3 grupamentos para visualizar o gráfico de musculatura.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="muscleGroup"
              tick={{
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
                fontFamily: "Inter, sans-serif",
              }}
            />
            <Radar
              name="Volume"
              dataKey="volume"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.35}
              dot={{ r: 2.5, fill: "hsl(var(--primary))" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Volume list */}
      <div className="w-full space-y-1">
        {data.map((m, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-sans">
            <span className="text-foreground min-w-[90px]">{m.muscleGroup}</span>
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${maxVolume > 0 ? (m.volume / maxVolume) * 100 : 0}%` }}
              />
            </div>
            <span className="text-muted-foreground tabular-nums min-w-[70px] text-right">
              {Math.round(m.volume).toLocaleString("pt-BR")}kg
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
