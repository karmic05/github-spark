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
import { loadEntries } from "@/lib/journal-store";
import { todayISO, useUser } from "@/lib/use-user";
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
    queryFn: () => getInsights({ data: { entries: loadEntries(userId) } }),
    staleTime: 60_000,
  });
  const windowsQ = useQuery({
    queryKey: ["windows", userId],
    queryFn: () =>
      getEmotionWindows({ data: { entries: loadEntries(userId), today: todayISO() } }),
    staleTime: 60_000,
  });

  // A short held beat so the reveal feels composed, not abrupt.
  const settled = !insightsQ.isLoading && !windowsQ.isLoading;
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => setComposing(false), 700);
    return () => clearTimeout(t);
  }, [settled]);

  if (composing) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="prose-serif animate-pulse text-2xl italic leading-relaxed text-muted-foreground">
          reading back through your entries…
        </p>
      </main>
    );
  }

  const insights = insightsQ.data;
  const windows = windowsQ.data;

  let delay = 0;
  const next = () => (delay += 0.05);

  return (
    <main className="px-5 pt-8">
      <p className="eyebrow">What I noticed</p>

      {insights && (
        <h1
          className="display animate-rise mt-3 text-pretty text-[2.1rem] leading-[1.12]"
          style={{ animationDelay: `${next()}s` }}
        >
          {insights.headline}
        </h1>
      )}

      {/* The spider-web map. */}
      {windows && (
        <section className="animate-rise mt-8" style={{ animationDelay: `${next()}s` }}>
          <SpiderWeb windows={windows.windows} />
        </section>
      )}

      {insights && (
        <div className="mt-10 space-y-9">
          {insights.recurring_themes.length > 0 && (
            <Reveal n="01" title="Recurring themes" delay={next()}>
              <ul className="space-y-3">
                {insights.recurring_themes.map((t, i) => (
                  <li key={i} className="leading-relaxed">
                    <span className="prose-serif text-lg font-medium">{t.theme}.</span>{" "}
                    <span className="text-foreground/70">{t.note}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {insights.people.length > 0 && (
            <Reveal n="02" title="The people who matter" delay={next()}>
              <ul className="space-y-3">
                {insights.people.map((p, i) => (
                  <li key={i} className="leading-relaxed">
                    <span className="prose-serif text-lg font-medium">{p.name}.</span>{" "}
                    <span className="text-foreground/70">{p.note}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {insights.bright_spots.length > 0 && (
            <Reveal n="03" title="Bright spots" delay={next()}>
              <ul className="space-y-2">
                {insights.bright_spots.map((b, i) => (
                  <li key={i} className="prose-serif border-l-2 border-chart-4 pl-3 text-lg leading-snug">
                    {b}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {insights.hard_patterns.length > 0 && (
            <Reveal n="04" title="What the hard weeks share" delay={next()}>
              <ul className="space-y-2">
                {insights.hard_patterns.map((h, i) => (
                  <li
                    key={i}
                    className="border-l-2 border-chart-1 pl-3 text-lg leading-snug text-foreground/75"
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {insights.emotional_arc && (
            <Reveal n="05" title="The arc" delay={next()}>
              <p className="prose-serif text-pretty text-xl leading-relaxed">
                {insights.emotional_arc}
              </p>
            </Reveal>
          )}

          {insights.surprise && (
            <Reveal n="06" title="One thing you might not see" delay={next()}>
              <p className="prose-serif sheet text-pretty p-5 text-xl italic leading-relaxed">
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
  n,
  title,
  delay,
  children,
}: {
  n: string;
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-rise" style={{ animationDelay: `${delay}s` }}>
      <h2 className="eyebrow mb-3 flex items-center gap-3 border-b border-foreground/15 pb-2">
        <span className="text-vermilion">{n}</span>
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
    <div className="sheet p-4">
      <h2 className="prose-serif text-center text-sm italic text-muted-foreground">
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
              aria-pressed={on}
              className={cn(
                "press inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-xs",
                on
                  ? "border-foreground bg-foreground text-primary-foreground"
                  : "border-foreground/25 text-muted-foreground",
              )}
            >
              <span
                className="h-2 w-2"
                style={{ background: WINDOW_COLORS[k], outline: on ? "1px solid var(--paper)" : "none" }}
              />
              {WINDOW_LABELS[k]}
            </button>
          );
        })}
      </div>

      {/* Per-window judgements */}
      <div className="mt-5 divide-y divide-foreground/15 border-y border-foreground/15">
        {available.map((k) => (
          <div key={k} className="py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5" style={{ background: WINDOW_COLORS[k] }} />
              <span className="eyebrow">{WINDOW_LABELS[k]}</span>
            </div>
            <p className="prose-serif mt-1.5 text-pretty text-[1.05rem] leading-snug">
              {windows[k].judgement || "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
