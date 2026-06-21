import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Flame } from "lucide-react";

import { EmotionRadar } from "@/components/emotion-radar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { getOpener, getTimeline, submitEntry } from "@/functions/throughline";

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
    queryFn: () => getOpener({ data: { userId } }),
    staleTime: 60_000,
  });

  const timelineQ = useQuery({
    queryKey: ["timeline", userId],
    queryFn: () => getTimeline({ data: { userId } }),
    staleTime: 30_000,
  });

  const streak = useMemo(() => computeStreak(timelineQ.data?.entries ?? []), [timelineQ.data]);

  const submit = useMutation({
    mutationFn: () => submitEntry({ data: { userId, date: todayISO(), text: text.trim() } }),
    onSuccess: (analysis) => {
      setResult(analysis);
      setText("");
      qc.invalidateQueries({ queryKey: ["timeline", userId] });
      qc.invalidateQueries({ queryKey: ["windows", userId] });
      qc.invalidateQueries({ queryKey: ["insights", userId] });
      qc.invalidateQueries({ queryKey: ["opener", userId] });
    },
  });

  const greetingDate = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const radarRows = result ? toRadarRows({ today: result.emotions }, ["today"]) : [];

  return (
    <main className="px-5 pt-10">
      <header className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{greetingDate}</p>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Flame className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            {streak} day{streak === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {/* The opener — visible proof of memory. */}
      <section className="mt-6 min-h-[4.5rem]">
        {openerQ.isLoading ? (
          <p className="prose-serif animate-pulse text-lg leading-relaxed text-muted-foreground">
            reading back through your entries…
          </p>
        ) : (
          <p className="prose-serif animate-rise text-pretty text-xl leading-relaxed text-foreground">
            {openerQ.data?.opener}
          </p>
        )}
      </section>

      {!result ? (
        <section className="mt-6">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A few sentences about today…"
            className="prose-serif min-h-[40vh] resize-none rounded-2xl border-border/70 bg-card/60 p-5 text-lg leading-relaxed shadow-sm focus-visible:ring-primary/40"
            aria-label="Today's entry"
          />
          <Button
            onClick={() => submit.mutate()}
            disabled={!text.trim() || submit.isPending}
            className="mt-4 h-12 w-full rounded-xl text-base"
          >
            {submit.isPending ? "Saving…" : "Set it down"}
          </Button>
          {submit.isError && (
            <p className="mt-3 text-center text-sm text-destructive">
              Something slipped — try once more.
            </p>
          )}
        </section>
      ) : (
        <section className="mt-6 animate-rise">
          {/* Gentle live reaction. */}
          <div
            className="rounded-2xl border border-border/70 p-5 shadow-sm"
            style={{ background: moodColor(result.sentiment_score, 0.1) }}
          >
            <p className="prose-serif text-lg leading-relaxed text-foreground">
              {result.reflection}
            </p>
          </div>

          {/* Today's emotion fingerprint. */}
          <div className="mt-6 rounded-2xl border border-border/70 bg-card/50 p-4">
            <h2 className="prose-serif text-center text-sm text-muted-foreground">
              today's emotion fingerprint
            </h2>
            <EmotionRadar
              data={radarRows}
              height={300}
              series={[{ key: "today", label: "Today", color: WINDOW_COLORS.today }]}
            />
            <p className="px-2 pb-1 text-center text-sm leading-relaxed text-muted-foreground">
              {fingerprintLine(result)}
            </p>
          </div>

          <Button
            variant="ghost"
            onClick={() => setResult(null)}
            className="mt-4 w-full text-muted-foreground"
          >
            Add another note
          </Button>
        </section>
      )}
    </main>
  );
}
