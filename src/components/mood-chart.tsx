import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LABEL_TEXT, type TimelineEntry } from "@/lib/emotions";

interface MoodChartProps {
  entries: TimelineEntry[];
  height?: number;
}

function fmtMonthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[(m || 1) - 1]} ${d}`;
}

/** A calm mood-over-time area chart built from stored sentiment scores. */
export function MoodChart({ entries, height = 200 }: MoodChartProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const data = useMemo(
    () =>
      entries.map((e) => ({
        date: e.date,
        label: fmtMonthDay(e.date),
        score: e.sentiment_score,
        mood: LABEL_TEXT[e.sentiment_label],
      })),
    [entries],
  );

  if (!mounted) {
    return <div style={{ height }} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
          interval="preserveStartEnd"
          minTickGap={32}
          axisLine={false}
          tickLine={false}
        />
        <YAxis domain={[-1, 1]} hide />
        <Tooltip
          cursor={{ stroke: "var(--color-border)" }}
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--color-popover-foreground)",
          }}
          labelFormatter={(label) => String(label)}
          formatter={(value: number, _name, item) => [
            (item?.payload?.mood as string) ?? value.toFixed(2),
            "mood",
          ]}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="var(--color-chart-5)"
          strokeWidth={2}
          fill="url(#moodFill)"
          isAnimationActive
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
