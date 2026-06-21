import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EmotionBars } from "@/components/emotion-bars";
import { MoodChart } from "@/components/mood-chart";
import { Button } from "@/components/ui/button";
import { LABEL_TEXT, moodColor, type TimelineEntry } from "@/lib/emotions";
import { useUser } from "@/lib/use-user";
import { getTimeline, seedDemo } from "@/functions/throughline";

export const Route = createFileRoute("/_app/timeline")({
  component: Timeline,
});

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[(m || 1) - 1]} ${y}`;
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function Timeline() {
  const { user } = useUser();
  const userId = user!.id;
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const timelineQ = useQuery({
    queryKey: ["timeline", userId],
    queryFn: () => getTimeline({ data: { userId } }),
    staleTime: 30_000,
  });

  const seed = useMutation({
    mutationFn: () => seedDemo({ data: { userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline", userId] });
      qc.invalidateQueries({ queryKey: ["windows", userId] });
      qc.invalidateQueries({ queryKey: ["insights", userId] });
      qc.invalidateQueries({ queryKey: ["opener", userId] });
    },
  });

  const ascending = useMemo(() => timelineQ.data?.entries ?? [], [timelineQ.data]);
  const reversed = useMemo(() => [...ascending].reverse(), [ascending]);

  function toggle(date: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return (
    <main className="px-5 pt-10">
      <header>
        <h1 className="prose-serif text-2xl text-foreground">The autobiography</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ascending.length} {ascending.length === 1 ? "entry" : "entries"} so far
        </p>
      </header>

      {ascending.length > 0 && (
        <section className="mt-6 rounded-2xl border border-border/70 bg-card/50 p-3">
          <MoodChart entries={ascending} />
        </section>
      )}

      <section className="mt-6 space-y-3">
        {timelineQ.isLoading && <p className="text-sm text-muted-foreground">reading the pages…</p>}

        {!timelineQ.isLoading && ascending.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="prose-serif text-lg text-foreground">No pages yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Write your first entry on Today — or load a demo life to see how the story comes
              together.
            </p>
            <Button
              variant="secondary"
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
              className="mt-4 rounded-xl"
            >
              {seed.isPending ? "Composing 90 days…" : "Load a demo life"}
            </Button>
            {seed.isError && (
              <p className="mt-2 text-xs text-destructive">
                Seeding is protected on this deployment.
              </p>
            )}
          </div>
        )}

        {reversed.map((entry, i) => {
          const prev = reversed[i - 1];
          const showMonth = !prev || monthLabel(prev.date) !== monthLabel(entry.date);
          return (
            <div key={entry.date + i}>
              {showMonth && (
                <p className="prose-serif px-1 pb-2 pt-4 text-sm uppercase tracking-widest text-muted-foreground">
                  {monthLabel(entry.date)}
                </p>
              )}
              <EntryCard
                entry={entry}
                open={expanded.has(entry.date)}
                onToggle={() => toggle(entry.date)}
              />
            </div>
          );
        })}
      </section>
    </main>
  );
}

function EntryCard({
  entry,
  open,
  onToggle,
}: {
  entry: TimelineEntry;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full overflow-hidden rounded-2xl border border-border/70 bg-card/60 text-left shadow-sm transition-colors hover:bg-card"
      style={{ borderLeft: `4px solid ${moodColor(entry.sentiment_score)}` }}
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-xs font-medium text-muted-foreground">{dayLabel(entry.date)}</span>
        <span className="text-xs" style={{ color: moodColor(entry.sentiment_score) }}>
          {LABEL_TEXT[entry.sentiment_label]}
        </span>
      </div>
      <p
        className={`prose-serif px-4 pt-2 text-base leading-relaxed text-foreground ${
          open ? "pb-3" : "line-clamp-2 pb-4"
        }`}
      >
        {entry.text}
      </p>

      {/* Expanded: the day's stored emotion analysis, fetched from HydraDB. */}
      {open && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              how the day felt
            </span>
            <span className="text-[11px] text-muted-foreground">
              felt mostly {entry.dominant_emotion}
            </span>
          </div>
          <EmotionBars emotions={entry.emotions} />
        </div>
      )}
    </button>
  );
}
