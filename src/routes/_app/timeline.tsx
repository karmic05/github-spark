import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EmotionBars } from "@/components/emotion-bars";
import { MoodChart } from "@/components/mood-chart";
import { Button } from "@/components/ui/button";
import { LABEL_TEXT, moodColor, type TimelineEntry } from "@/lib/emotions";
import { seedDemo } from "@/functions/throughline";
import { loadEntries, mergeEntries } from "@/lib/journal-store";
import { todayISO, useUser } from "@/lib/use-user";

export const Route = createFileRoute("/_app/timeline")({
  component: Timeline,
});

const MONTHS = [
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

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

function dayParts(iso: string): { day: string; weekday: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return {
    day: String(d).padStart(2, "0"),
    weekday: dt.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
  };
}

function Timeline() {
  const { user } = useUser();
  const userId = user!.id;
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const timelineQ = useQuery({
    queryKey: ["timeline", userId],
    queryFn: async () => ({ entries: loadEntries(userId) }),
    staleTime: 30_000,
  });

  const seed = useMutation({
    mutationFn: async () => {
      const { entries } = await seedDemo({ data: { today: todayISO() } });
      if (!mergeEntries(userId, entries)) throw new Error("storage");
    },
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
    <main className="px-5 pt-8">
      <header>
        <p className="eyebrow">The record</p>
        <h1 className="display mt-2 text-[2.6rem]">The autobiography</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {ascending.length} {ascending.length === 1 ? "entry" : "entries"} so far
        </p>
      </header>

      {ascending.length > 0 && (
        <section className="sheet mt-6 p-3">
          <MoodChart entries={ascending} />
        </section>
      )}

      <section className="mt-6">
        {timelineQ.isLoading && <p className="text-sm text-muted-foreground">reading the pages…</p>}

        {!timelineQ.isLoading && ascending.length === 0 && (
          <div className="sheet border-dashed p-6">
            <p className="prose-serif text-2xl leading-tight">No pages yet.</p>
            <p className="mt-2 text-pretty text-[0.95rem] leading-relaxed text-muted-foreground">
              Write your first entry on Today — or load a demo life to see how the story comes
              together.
            </p>
            <Button
              variant="secondary"
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
              className="mt-4"
            >
              {seed.isPending ? "Composing 90 days…" : "Load a demo life"}
            </Button>
            {seed.isError && (
              <p className="mt-2 text-xs text-destructive">Couldn't load the demo here.</p>
            )}
          </div>
        )}

        {reversed.map((entry, i) => {
          const prev = reversed[i - 1];
          const showMonth = !prev || monthLabel(prev.date) !== monthLabel(entry.date);
          return (
            <div key={entry.date + i}>
              {showMonth && (
                <p className="eyebrow border-b border-foreground/15 pb-2 pt-7 first:pt-0">
                  {monthLabel(entry.date)}
                </p>
              )}
              <EntryRow
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

function EntryRow({
  entry,
  open,
  onToggle,
}: {
  entry: TimelineEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const { day, weekday } = dayParts(entry.date);
  const tone = moodColor(entry.sentiment_score);
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="lift press block w-full border-b border-foreground/15 py-4 text-left"
    >
      <div className="grid grid-cols-[3.25rem_1fr] gap-x-4">
        <div className="relative pl-3">
          <span
            aria-hidden
            className="absolute inset-y-1 left-0 w-[3px] rounded-none"
            style={{ background: tone }}
          />
          <span className="display block text-[2rem] leading-none">{day}</span>
          <span className="eyebrow mt-1 block !text-[10px]">{weekday}</span>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px]" style={{ color: tone }}>
            {LABEL_TEXT[entry.sentiment_label]}
          </p>
          <div className="mt-1">
            <p
              className={`prose-serif whitespace-pre-line text-[1.05rem] leading-relaxed ${
                open ? "" : "line-clamp-2"
              }`}
            >
              {entry.text}
            </p>
          </div>

          {/* Expanded: the day's stored emotion analysis. */}
          {open && (
            <div className="animate-rise mt-4 border-t border-foreground/15 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow whitespace-nowrap">how the day felt</span>
                <span className="ml-3 truncate font-mono text-[11px] text-muted-foreground">
                  felt mostly {entry.dominant_emotion}
                </span>
              </div>
              <EmotionBars emotions={entry.emotions} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
