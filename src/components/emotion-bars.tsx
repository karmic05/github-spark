import { EMOTION_AXES, axisLabel, type EmotionVector } from "@/lib/emotions";

const POSITIVE = new Set(["joy", "calm", "hope", "gratitude"]);

/**
 * A compact read of one entry's eight stored emotion axes. Used when a past day
 * is expanded on the Timeline — the analysis is saved with the entry in
 * the browser, this just renders it. Positive axes read warm, difficult ones a calm
 * muted blue (never an alarm).
 */
export function EmotionBars({ emotions }: { emotions: EmotionVector }) {
  return (
    <div className="space-y-1.5">
      {EMOTION_AXES.map((axis, i) => {
        const v = Math.max(0, Math.min(1, emotions[axis] ?? 0));
        const positive = POSITIVE.has(axis);
        return (
          <div key={axis} className="flex items-center gap-2.5">
            <span className="w-[4.5rem] shrink-0 mono text-[11px] text-muted-foreground">
              {axisLabel(axis)}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-none bg-foreground/10">
              <div
                className="bar-fill h-full rounded-none"
                style={{
                  ["--i" as string]: i,
                  width: `${Math.round(v * 100)}%`,
                  background: positive
                    ? "oklch(0.72 0.15 70)" // ochre
                    : "oklch(0.46 0.13 265)", // indigo ink
                }}
              />
            </div>
            <span className="mono w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
              {Math.round(v * 100)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
