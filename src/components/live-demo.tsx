import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { EmotionBars } from "@/components/emotion-bars";
import { Button } from "@/components/ui/button";
import { LABEL_TEXT, moodColor, type EntryAnalysis } from "@/lib/emotions";
import { analyzeEntry } from "@/functions/throughline";
import { cn } from "@/lib/utils";

// The home-page demo. Each sample ships with the result the real model produced
// for it (so there's something to look at instantly, no API call), and "Run it
// live" scores whatever is in the box with the actual model.

interface Sample {
  id: string;
  label: string;
  text: string;
  result: EntryAnalysis;
}

const SAMPLES: Sample[] = [
  {
    id: "run",
    label: "A good run",
    text: "Ran the river loop with Dana before work. Mom called, and for once it didn't end badly. Slept badly again, but the morning felt wide open.",
    result: {
      sentiment_score: 0.6,
      sentiment_label: "good",
      dominant_emotion: "calm",
      emotions: {
        joy: 0.6,
        calm: 0.9,
        hope: 0.7,
        gratitude: 0.5,
        sadness: 0.2,
        anxiety: 0.3,
        anger: 0.1,
        loneliness: 0.2,
      },
      themes: ["running", "family", "sleep", "morning"],
      people: ["Dana", "Mom"],
      reflection:
        "You carried the quiet triumph of a run and a rare, gentle conversation with your mother into a morning that felt like it could hold anything.",
    },
  },
  {
    id: "deadline",
    label: "A hard deadline",
    text: "Missed the deadline and my boss was furious. I barely slept, I feel anxious about everything and completely alone with it.",
    result: {
      sentiment_score: -0.8,
      sentiment_label: "very_low",
      dominant_emotion: "anxiety",
      emotions: {
        joy: 0,
        calm: 0.1,
        hope: 0.2,
        gratitude: 0,
        sadness: 0.6,
        anxiety: 0.9,
        anger: 0.3,
        loneliness: 0.8,
      },
      themes: ["work", "sleep", "stress"],
      people: ["boss"],
      reflection:
        "You're carrying the weight of a missed deadline and the echo of your boss’s anger, and it’s sitting heavily in your chest, making sleep impossible and the world feel distant.",
    },
  },
  {
    id: "dinner",
    label: "Bittersweet",
    text: "Mom's birthday dinner was beautiful and I'm so grateful for her, but I sat in the car afterward crying because I miss Dad so much.",
    result: {
      sentiment_score: 0.2,
      sentiment_label: "neutral",
      dominant_emotion: "sadness",
      emotions: {
        joy: 0.6,
        calm: 0.4,
        hope: 0.3,
        gratitude: 0.8,
        sadness: 0.9,
        anxiety: 0.2,
        anger: 0.1,
        loneliness: 0.7,
      },
      themes: ["family", "grief", "gratitude"],
      people: ["Mom"],
      reflection:
        "You held space for both love and loss tonight, honoring your mother while letting yourself feel the ache of missing your father.",
    },
  },
];

type Mode = "example" | "live";

export function LiveDemo() {
  const [sampleId, setSampleId] = useState<string>(SAMPLES[0].id);
  const [text, setText] = useState(SAMPLES[0].text);
  const [result, setResult] = useState<EntryAnalysis | null>(SAMPLES[0].result);
  const [mode, setMode] = useState<Mode>("example");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runKey, setRunKey] = useState(0);

  function pick(s: Sample) {
    setSampleId(s.id);
    setText(s.text);
    setResult(s.result);
    setMode("example");
    setError("");
    setRunKey((k) => k + 1);
  }

  function edit(v: string) {
    setText(v);
    setSampleId("");
    setResult(null);
    setError("");
  }

  async function run() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await analyzeEntry({ data: { text: t } });
      setResult(r);
      setMode("live");
      setRunKey((k) => k + 1);
    } catch {
      setError("Couldn't reach the model just now — try once more.");
    } finally {
      setBusy(false);
    }
  }

  const tone = result ? moodColor(result.sentiment_score) : "";

  return (
    <div className="sheet" role="group" aria-label="Live demo">
      <div className="flex items-center justify-between border-b border-foreground/15 px-5 py-3">
        <p className="font-mono text-xs">Try it — no sign-up</p>
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className={cn("h-1.5 w-1.5 rounded-full", mode === "live" ? "bg-vermilion" : "bg-foreground/30")}
          />
          {mode === "live" ? "scored live just now" : "example result"}
        </p>
      </div>

      <div className="px-5 pt-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sample entries">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={sampleId === s.id}
              onClick={() => pick(s)}
              className={cn(
                "press rounded-sm border px-2.5 py-1 font-mono text-xs",
                sampleId === s.id
                  ? "border-foreground bg-foreground text-primary-foreground"
                  : "border-foreground/25 text-foreground/70 [@media(hover:hover)]:hover:border-foreground/60",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => edit(e.target.value)}
          maxLength={400}
          rows={4}
          aria-label="Demo entry"
          className="prose-serif mt-3 block w-full resize-none rounded-sm border border-foreground/20 bg-background/60 p-3 text-[1.05rem] leading-relaxed outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-foreground/50 focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] text-muted-foreground">
            Edit the text, or write your own.
          </p>
          <Button onClick={run} disabled={!text.trim() || busy} className="h-9 shrink-0 px-4">
            {busy ? "Reading…" : "Run it live"}
            {!busy && <ArrowRight />}
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      <div className="mt-4 border-t border-foreground/15 px-5 pb-5 pt-4" aria-live="polite">
        {busy ? (
          <p className="prose-serif animate-pulse py-6 text-lg italic text-muted-foreground">
            reading it the way a friend would…
          </p>
        ) : result ? (
          <div key={runKey} className="animate-rise">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="stamp" style={{ color: tone }}>
                {LABEL_TEXT[result.sentiment_label]}
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                mood {result.sentiment_score > 0 ? "+" : ""}
                {result.sentiment_score.toFixed(1)} · mostly {result.dominant_emotion}
              </span>
            </div>
            <p className="prose-serif mt-3 text-pretty text-[1.2rem] leading-snug">
              {result.reflection}
            </p>
            {(result.people.length > 0 || result.themes.length > 0) && (
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                {[...result.people, ...result.themes.map((t) => `#${t}`)].join("  ·  ")}
              </p>
            )}
            <div className="mt-4">
              <EmotionBars emotions={result.emotions} />
            </div>
          </div>
        ) : (
          <p className="prose-serif py-6 text-lg italic text-muted-foreground">
            Press “Run it live” to score this entry with the real model.
          </p>
        )}
      </div>
    </div>
  );
}
