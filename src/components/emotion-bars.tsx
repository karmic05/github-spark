import { EMOTION_AXES, axisLabel, type EmotionVector } from "@/lib/emotions";

const POSITIVE = new Set(["joy", "calm", "hope", "gratitude"]);

/**
 * A compact read of one entry's eight stored emotion axes. Used when a past day
 * is expanded on the Timeline — the analysis is fetched with the entry from
 * HydraDB, this just renders it. Positive axes read warm, difficult ones a calm
 * muted blue (never an alarm).
 */
export function EmotionBars({ emotions }: { emotions: EmotionVector }) {
  return (
    <div className="space-y-1.5">
      {EMOTION_AXES.map((axis) => {
        const v = Math.max(0, Math.min(1, emotions[axis] ?? 0));
        const positive = POSITIVE.has(axis);
        return (
          <div key={axis} className="flex items-center gap-2.5">
            <span className="w-[4.5rem] shrink-0 text-[11px] text-muted-foreground">
              {axisLabel(axis)}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.round(v * 100)}%`,
                  background: positive
                    ? "oklch(0.78 0.11 67)" // warm amber
                    : "oklch(0.64 0.06 250)", // calm muted blue
                }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
              {Math.round(v * 100)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
