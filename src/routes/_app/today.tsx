import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Flame } from "lucide-react";

import { EmotionRadar } from "@/components/emotion-radar";
import { Button } from "@/components/ui/button";
import {
  EMOTION_AXES,
  LABEL_TEXT,
  WINDOW_COLORS,
  axisLabel,
  moodColor,
  toRadarRows,
  type EntryAnalysis,
  type TimelineEntry,
} from "@/lib/emotions";
import { todayISO, useUser } from "@/lib/use-user";
import { analyzeEntry, getOpener } from "@/functions/throughline";
import { entryForDate, loadEntries, upsertEntry } from "@/lib/journal-store";

export const Route = createFileRoute("/_app/today")({
  component: Today,
});

function topAxes(a: EntryAnalysis) {
  return [...EMOTION_AXES].sort((x, y) => a.emotions[y] - a.emotions[x]);
}

function fingerprintLine(a: EntryAnalysis): string {
  const [first, second] = topAxes(a);
  const mood = LABEL_TEXT[a.sentiment_label];
  return `Today reads as ${mood} — ${axisLabel(first).toLowerCase()} and ${axisLabel(
    second,
  ).toLowerCase()} sit out front.`;
}

function computeStreak(entries: TimelineEntry[]): number {
  if (entries.length === 0) return 0;
  const dates = Array.from(new Set(entries.map((e) => e.date))).sort();
  const toNum = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  let streak = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    const gap = (toNum(dates[i]) - toNum(dates[i - 1])) / 86_400_000;
    if (gap === 1) streak++;
    else break;
  }
  return streak;
}

function Today() {
  const { user } = useUser();
  const userId = user!.id;
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [result, setResult] = useState<EntryAnalysis | null>(null);

  const openerQ = useQuery({
    queryKey: ["opener", userId],
    queryFn: () => getOpener({ data: { entries: loadEntries(userId).slice(-8) } }),
    staleTime: 60_000,
  });

  const timelineQ = useQuery({
    queryKey: ["timeline", userId],
    queryFn: async () => ({ entries: loadEntries(userId) }),
    staleTime: 30_000,
  });

  const streak = useMemo(() => computeStreak(timelineQ.data?.entries ?? []), [timelineQ.data]);

  const submit = useMutation({
    mutationFn: async () => {
      const date = todayISO();
      // A second note on the same day joins the first, so a day is never overwritten.
      const existing = entryForDate(userId, date);
      const full = existing ? `${existing.text}\n\n${text.trim()}` : text.trim();
      const analysis = await analyzeEntry({ data: { text: full } });
      const { saved } = upsertEntry(userId, date, full, analysis);
      if (!saved) throw new Error("storage");
      return analysis;
    },
    onSuccess: (analysis) => {
      setResult(analysis);
      setText("");
      qc.invalidateQueries({ queryKey: ["timeline", userId] });
      qc.invalidateQueries({ queryKey: ["windows", userId] });
      qc.invalidateQueries({ queryKey: ["insights", userId] });
      qc.invalidateQueries({ queryKey: ["opener", userId] });
    },
  });

  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const monthYear = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const radarRows = result ? toRadarRows({ today: result.emotions }, ["today"]) : [];
  const tone = result ? moodColor(result.sentiment_score) : "";

  return (
    <main className="px-5 pt-8">
      {/* The date, set like a diary page. */}
      <header className="flex items-end justify-between">
        <div className="flex items-end gap-3">
          <span className="display text-[4.25rem] leading-[0.8]">
            {String(now.getDate()).padStart(2, "0")}
          </span>
          <div className="pb-1">
            <p className="eyebrow !text-foreground">{weekday}</p>
            <p className="eyebrow">{monthYear}</p>
          </div>
        </div>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1.5 border border-foreground/25 px-2 py-1 font-mono text-xs">
            <Flame className="h-3.5 w-3.5 text-vermilion" strokeWidth={1.75} />
            {streak} day{streak === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {/* The opener: visible proof of memory. */}
      <section className="mt-7 min-h-[4.5rem] border-l-2 border-vermilion pl-4">
        {openerQ.isLoading ? (
          <p className="prose-serif animate-pulse text-xl italic leading-snug text-muted-foreground">
            reading back through your entries…
          </p>
        ) : (
          <p className="prose-serif animate-rise text-pretty text-[1.4rem] italic leading-snug">
            {openerQ.data?.opener}
          </p>
        )}
      </section>

      {!result ? (
        <section className="mt-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A few sentences about today…"
            className="ruled prose-serif sheet block min-h-[42vh] w-full resize-none outline-none transition-[border-color,box-shadow] duration-150 placeholder:italic placeholder:text-foreground/35 focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Today's entry"
          />
          <p className="mt-2 font-mono text-[11px] text-muted-foreground tabular-nums">
            {words > 0 ? `${words} word${words === 1 ? "" : "s"}` : "Private to this device."}
          </p>
          <Button
            onClick={() => submit.mutate()}
            disabled={!text.trim() || submit.isPending}
            className="mt-4 h-12 w-full text-sm"
          >
            {submit.isPending ? "Saving…" : "Set it down"}
          </Button>
          {submit.isError && (
            <p className="mt-3 text-center text-sm text-destructive">
              {submit.error instanceof Error && submit.error.message === "storage"
                ? "Couldn't save on this device — is browser storage blocked?"
                : "Something slipped — try once more."}
            </p>
          )}
        </section>
      ) : (
        <section className="animate-rise mt-6">
          {/* How the day read. */}
          <div className="sheet p-5" style={{ borderLeft: `4px solid ${tone}` }}>
            <span className="stamp" style={{ color: tone }}>
              {LABEL_TEXT[result.sentiment_label]}
            </span>
            <p className="prose-serif mt-4 text-pretty text-[1.3rem] leading-snug">
              {result.reflection}
            </p>
            {(result.themes.length > 0 || result.people.length > 0) && (
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                {[...result.people, ...result.themes.map((t) => `#${t}`)].join("  ·  ")}
              </p>
            )}
          </div>

          {/* Today's emotion fingerprint. */}
          <div className="sheet mt-4 p-4">
            <h2 className="prose-serif text-center text-sm italic text-muted-foreground">
              today's emotion fingerprint
            </h2>
            <EmotionRadar
              data={radarRows}
              height={290}
              series={[{ key: "today", label: "Today", color: WINDOW_COLORS.today }]}
            />
            <p className="px-2 pb-1 text-center text-sm leading-relaxed text-muted-foreground">
              {fingerprintLine(result)}
            </p>
          </div>

          <Button variant="ghost" onClick={() => setResult(null)} className="mt-4 w-full">
            Add another note
          </Button>
        </section>
      )}
    </main>
  );
}
