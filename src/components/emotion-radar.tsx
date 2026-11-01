import { useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import type { RadarRow, WindowKey } from "@/lib/emotions";

export interface RadarSeries {
  key: WindowKey;
  label: string;
  color: string;
}

interface EmotionRadarProps {
  data: RadarRow[];
  series: RadarSeries[];
  height?: number;
}

/**
 * The spider-web map. Soft, editorial, not clinical: thin grid lines,
 * translucent filled polygons, one calm color per window. The difficult axes
 * are never colored as alarms — it's a portrait of a season.
 */
export function EmotionRadar({ data, series, height = 320 }: EmotionRadarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-muted-foreground"
      >
        composing…
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="oklch(0.2 0.014 60 / 0.22)" strokeOpacity={1} />
        <PolarAngleAxis
          dataKey="label"
          tick={{
            fill: "var(--color-muted-foreground)",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
          }}
        />
        <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
        {series.map((s) => (
          <Radar
            key={s.key}
            name={s.label}
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            fill={s.color}
            fillOpacity={0.16}
            isAnimationActive
            animationDuration={700}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}
