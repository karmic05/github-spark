import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { EmotionRadar, type RadarSeries } from "@/components/emotion-radar";
import {
  WINDOW_COLORS,
  WINDOW_KEYS,
  WINDOW_LABELS,
  toRadarRows,
  type EmotionVector,
  type WindowKey,
} from "@/lib/emotions";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/use-user";
import { getEmotionWindows, getInsights } from "@/functions/throughline";

export const Route = createFileRoute("/_app/insights")({
  component: Insights,
});

function Insights() {
  const { user } = useUser();
  const userId = user!.id;
  const [composing, setComposing] = useState(true);

  const insightsQ = useQuery({
    queryKey: ["insights", userId],
    queryFn: () => getInsights({ data: { userId } }),
    staleTime: 60_000,
  });
  const windowsQ = useQuery({
    queryKey: ["windows", userId],
    queryFn: () => getEmotionWindows({ data: { userId } }),
    staleTime: 60_000,
  });

  // Cinematic beat: hold the "reading back…" frame until data is ready
  // (and at least a moment, so the reveal feels composed, not abrupt).
  const settled = !insightsQ.isLoading && !windowsQ.isLoading;
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => setComposing(false), 1500);
    return () => clearTimeout(t);
  }, [settled]);

  if (composing) {
    return (
      <main className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
        <p className="prose-serif animate-pulse text-xl leading-relaxed text-muted-foreground">
          reading back through your entries…
        </p>
      </main>
    );
  }

  const insights = insightsQ.data;
  const windows = windowsQ.data;

  let delay = 0;
  const next = () => (delay += 0.18);

  return (
    <main className="px-5 pt-10">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">What I noticed</p>

      {insights && (
        <h1
          className="prose-serif mt-4 animate-rise text-pretty text-2xl leading-snug text-foreground"
          style={{ animationDelay: `${next()}s` }}
        >
          {insights.headline}
        </h1>
      )}

      {/* The spider-web map. */}
      {windows && (
        <section className="mt-8 animate-rise" style={{ animationDelay: `${next()}s` }}>
          <SpiderWeb windows={windows.windows} />
        </section>
      )}

      {insights && (
        <div className="mt-10 space-y-8">
          {insights.recurring_themes.length > 0 && (
            <Reveal title="Recurring themes" delay={next()}>
              <ul className="space-y-2">
                {insights.recurring_themes.map((t, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <span className="prose-serif text-base text-foreground">{t.theme}.</span>{" "}
                    <span className="text-muted-foreground">{t.note}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {insights.people.length > 0 && (
            <Reveal title="The people who matter" delay={next()}>
              <ul className="space-y-2">
                {insights.people.map((p, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <span className="prose-serif text-base text-foreground">{p.name}.</span>{" "}
                    <span className="text-muted-foreground">{p.note}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {insights.bright_spots.length > 0 && (
            <Reveal title="Bright spots" delay={next()}>
              <ul className="space-y-1.5">
                {insights.bright_spots.map((b, i) => (
                  <li key={i} className="prose-serif text-base leading-relaxed text-foreground">
                    {b}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {insights.hard_patterns.length > 0 && (
            <Reveal title="What the hard weeks share" delay={next()}>
              <ul className="space-y-1.5">
                {insights.hard_patterns.map((h, i) => (
                  <li key={i} className="text-base leading-relaxed text-muted-foreground">
                    {h}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {insights.emotional_arc && (
            <Reveal title="The arc" delay={next()}>
              <p className="prose-serif text-pretty text-lg leading-relaxed text-foreground">
                {insights.emotional_arc}
              </p>
            </Reveal>
          )}

          {insights.surprise && (
            <Reveal title="One thing you might not see" delay={next()}>
              <p
                className="prose-serif text-pretty rounded-2xl border border-border/70 p-5 text-lg leading-relaxed text-foreground"
                style={{ background: WINDOW_COLORS.today.replace(")", " / 0.08)") }}
              >
                {insights.surprise}
              </p>
            </Reveal>
          )}
        </div>
      )}
    </main>
  );
}

function Reveal({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-rise" style={{ animationDelay: `${delay}s` }}>
      <h2 className="prose-serif mb-2 text-sm uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SpiderWeb({
  windows,
}: {
  windows: Record<WindowKey, { emotions: EmotionVector; count: number; judgement: string }>;
}) {
  const available = WINDOW_KEYS.filter((k) => windows[k].count > 0);
  // Default: show All time + last month + last week, so the whole history is
  // reflected (not just recent entries) while keeping a recent-vs-all contrast.
  // Today and quarter are a tap away.
  const DEFAULT_ON: WindowKey[] = ["all", "month", "week"];
  const [active, setActive] = useState<Set<WindowKey>>(
    () => new Set(available.filter((k) => DEFAULT_ON.includes(k))),
  );

  const shown = WINDOW_KEYS.filter((k) => available.includes(k) && active.has(k));

  const vectors = useMemo(() => {
    const map: Partial<Record<WindowKey, EmotionVector>> = {};
    for (const k of shown) map[k] = windows[k].emotions;
    return map;
  }, [shown, windows]);

  const rows = toRadarRows(vectors, shown);
  const series: RadarSeries[] = shown.map((k) => ({
    key: k,
    label: WINDOW_LABELS[k],
    color: WINDOW_COLORS[k],
  }));

  function toggle(k: WindowKey) {
    setActive((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
      <h2 className="prose-serif text-center text-sm text-muted-foreground">
        the shape of your seasons
      </h2>

      <EmotionRadar data={rows} series={series} height={300} />

      {/* Window toggles */}
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {available.map((k) => {
          const on = active.has(k);
          return (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                on
                  ? "border-transparent text-foreground"
                  : "border-border text-muted-foreground opacity-60",
              )}
              style={on ? { background: WINDOW_COLORS[k].replace(")", " / 0.18)") } : undefined}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: WINDOW_COLORS[k] }} />
              {WINDOW_LABELS[k]}
            </button>
          );
        })}
      </div>

      {/* Per-window judgements */}
      <div className="mt-4 grid gap-2">
        {available.map((k) => (
          <div key={k} className="rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: WINDOW_COLORS[k] }} />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {WINDOW_LABELS[k]}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">
              {windows[k].judgement || "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
