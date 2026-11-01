import { createServerFn } from "@tanstack/react-start";

import {
  EMOTION_AXES,
  WINDOW_KEYS,
  type EmotionVector,
  type EntryAnalysis,
  type EmotionWindow,
  type EmotionWindowsResult,
  type Insights,
  type SentimentLabel,
  type TimelineEntry,
  type WindowKey,
  flatVector,
  labelFromScore,
  normalizeVector,
  clampValence,
} from "../lib/emotions";
import { heuristicAnalysis } from "../lib/heuristic-sentiment";
import { tidy } from "../lib/tidy";
import { callLLM, callLLMJson, llmConfigured } from "../server/llm";
import { generateSeedEntries } from "../server/seed-data";

// The server is stateless: the journal lives in the browser (lib/journal-store)
// and each call receives whatever entries it needs. The server's only jobs are
// to read the tone of an entry, write the agent's voice, and find patterns.

// The agent's register: a thoughtful biographer and a kind friend. It reflects,
// it does not advise. No clinical tone, no diagnosis.
const VOICE = `You are the quiet intelligence behind Throughline, a private journaling companion.
You write like a thoughtful biographer and a kind friend — specific, warm, literary, brief.
You reflect a person back to themselves with real detail; you never advise, never diagnose,
never use clinical phrasing like "it sounds like". You are not a therapist or a chatbot.
Throughline is a journaling companion, not a mental health tool, and never presents itself as one.
Always address the writer directly as "you".`;

// --- input guards -----------------------------------------------------------

const MAX_ENTRY_CHARS = 8000;
const MAX_ENTRIES = 400;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(d: unknown): string {
  if (typeof d !== "string" || !DATE_RE.test(d)) throw new Error("Invalid date");
  return d;
}

interface EntryInput {
  date: string;
  text: string;
  sentiment_score: number;
  dominant_emotion: string;
  emotions: EmotionVector;
}

function validateEntries(raw: unknown): EntryInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_ENTRIES)
    .filter((e) => e && typeof e === "object" && DATE_RE.test((e as { date?: string }).date ?? ""))
    .map((e) => {
      const r = e as Record<string, unknown>;
      const score = clampValence(Number(r.sentiment_score));
      return {
        date: String(r.date),
        text: String(r.text ?? "").slice(0, MAX_ENTRY_CHARS),
        sentiment_score: Number.isFinite(score) ? score : 0,
        dominant_emotion: typeof r.dominant_emotion === "string" ? r.dominant_emotion : "calm",
        emotions: normalizeVector(r.emotions),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function daysAgo(dateISO: string, todayISO: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d, 12, 0, 0);
  };
  return Math.round((p(todayISO) - p(dateISO)) / 86_400_000);
}

const snip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ============================================================================
// 1. analyze-entry (score one entry)
// ============================================================================

const EXTRACTION_PROMPT = (
  text: string,
) => `You are scoring ONE journal entry for an emotional-wellbeing journal. Read it closely — tone, word choice, what the writer dwells on, what's implied — and return ONLY a JSON object (no prose, no markdown).

Score each of the eight emotion axes from 0.0 (clearly absent) to 1.0 (strong and unmistakable), judged from what the entry actually conveys. They are INDEPENDENT intensities, not a distribution: an entry can be high on several at once (e.g. both gratitude and sadness in a bittersweet entry). Be decisive and calibrated, not mushy:
- A clearly good day → high joy/calm/hope/gratitude, low sadness/anxiety/anger/loneliness.
- A clearly hard day → the reverse.
- A mixed day → genuinely high on both sides.
Do NOT default everything toward 0.5; commit to what the entry says. Most entries have one or two emotions clearly dominant.

Then:
- sentiment_score: overall valence from -1.0 (very low) to 1.0 (very good). Make it consistent with the axes.
- sentiment_label: one of "very_low" | "low" | "neutral" | "good" | "great".
- dominant_emotion: the single feeling that best captures the entry (one lowercase word).
- themes: 2-4 short lowercase tags (e.g. "work", "family", "sleep", "running").
- people: 0-3 first names actually mentioned (e.g. "Mom", "Dana").
- reflection: one warm, specific sentence mirroring the entry back, addressed to the writer as "you" — no advice, no clinical tone.

Return EXACTLY this shape:
{
  "sentiment_score": <-1.0..1.0>,
  "sentiment_label": "<very_low|low|neutral|good|great>",
  "dominant_emotion": "<word>",
  "emotions": { "joy": <0..1>, "calm": <0..1>, "hope": <0..1>, "gratitude": <0..1>, "sadness": <0..1>, "anxiety": <0..1>, "anger": <0..1>, "loneliness": <0..1> },
  "themes": [<tags>],
  "people": [<names>],
  "reflection": "<one warm sentence>"
}

Entry:
"""${text}"""`;

const LABELS: SentimentLabel[] = ["very_low", "low", "neutral", "good", "great"];

function coerceAnalysis(raw: unknown): EntryAnalysis {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const score = clampValence(Number(r.sentiment_score));
  if (!Number.isFinite(score) || r.emotions == null) throw new Error("Unusable analysis");
  const emotions = normalizeVector(r.emotions);
  const label = LABELS.includes(r.sentiment_label as SentimentLabel)
    ? (r.sentiment_label as SentimentLabel)
    : labelFromScore(score);
  return {
    sentiment_score: score,
    sentiment_label: label,
    dominant_emotion:
      typeof r.dominant_emotion === "string" && r.dominant_emotion
        ? r.dominant_emotion.toLowerCase()
        : "calm",
    emotions,
    themes: Array.isArray(r.themes)
      ? r.themes.slice(0, 4).map((t: unknown) => String(t).toLowerCase())
      : [],
    people: Array.isArray(r.people) ? r.people.slice(0, 3).map((p: unknown) => String(p)) : [],
    reflection:
      typeof r.reflection === "string" && r.reflection.trim()
        ? tidy(r.reflection)
        : "Noted, and held.",
  };
}

// Small in-memory memo so identical text (e.g. the home-page demo samples) is
// scored once per server instance. Scoring runs at a low temperature anyway.
const analysisMemo = new Map<string, EntryAnalysis>();
const MEMO_MAX = 200;

export const analyzeEntry = createServerFn({ method: "POST" })
  .validator((d: { text: string }) => {
    const text = typeof d?.text === "string" ? d.text.trim().slice(0, MAX_ENTRY_CHARS) : "";
    if (!text) throw new Error("Entry is empty");
    return { text };
  })
  .handler(async ({ data }): Promise<EntryAnalysis & { source: "model" | "fallback" }> => {
    const memo = analysisMemo.get(data.text);
    if (memo) return { ...memo, source: "model" };
    if (llmConfigured()) {
      try {
        const raw = await callLLMJson({
          system: VOICE,
          prompt: EXTRACTION_PROMPT(data.text),
          maxTokens: 700,
          temperature: 0.2, // consistent, calibrated scoring
        });
        const analysis = coerceAnalysis(raw);
        if (analysisMemo.size >= MEMO_MAX) analysisMemo.delete(analysisMemo.keys().next().value as string);
        analysisMemo.set(data.text, analysis);
        return { ...analysis, source: "model" };
      } catch (err) {
        console.error("analyze-entry: LLM failed, using keyword fallback", err);
      }
    }
    // Never let an entry fail to save: fall back to a simple keyword read.
    return { ...heuristicAnalysis(data.text), source: "fallback" };
  });

// ============================================================================
// 2. get-opener
// ============================================================================

const FIRST_TIME_OPENER =
  "This is a blank page and a private one. Tell me a little about today — a few sentences is plenty.";

export const getOpener = createServerFn({ method: "POST" })
  .validator((d: { entries: unknown }) => ({ entries: validateEntries(d?.entries) }))
  .handler(async ({ data }) => {
    const recent = data.entries.filter((e) => e.text.trim()).slice(-8);
    if (recent.length === 0 || !llmConfigured()) {
      return { opener: FIRST_TIME_OPENER };
    }
    try {
      const opener = await callLLM({
        system: VOICE,
        prompt: `Here are this person's most recent journal entries (oldest first):

${recent.map((e, i) => `${i + 1}. [${e.date}] ${snip(e.text, 320)}`).join("\n")}

Write ONE short, warm, specific greeting (one or two sentences) to open today's check-in. Reference something real from the past — a person by name, a prior worry, or a small win — the way a close friend who remembers would. Reflect, do not advise. Return only the greeting text, no quotes.`,
        maxTokens: 160,
      });
      return { opener: opener.trim().replace(/^["“]|["”]$/g, "") || FIRST_TIME_OPENER };
    } catch (err) {
      console.error("get-opener: LLM failed", err);
      return { opener: FIRST_TIME_OPENER };
    }
  });

// ============================================================================
// 3. get-emotion-windows
// ============================================================================

function averageWindow(entries: EntryInput[]): {
  emotions: EmotionVector;
  valence: number;
  count: number;
} {
  if (entries.length === 0) {
    return { emotions: flatVector(), valence: 0, count: 0 };
  }
  const sum = flatVector();
  let vSum = 0;
  for (const e of entries) {
    for (const axis of EMOTION_AXES) sum[axis] += e.emotions[axis];
    vSum += e.sentiment_score;
  }
  const emotions = flatVector();
  for (const axis of EMOTION_AXES) {
    emotions[axis] = Number((sum[axis] / entries.length).toFixed(3));
  }
  return {
    emotions,
    valence: Number((vSum / entries.length).toFixed(3)),
    count: entries.length,
  };
}

function topAxes(v: EmotionVector, n: number): string[] {
  return [...EMOTION_AXES].sort((a, b) => v[b] - v[a]).slice(0, n);
}

function fallbackJudgement(w: { emotions: EmotionVector; valence: number; count: number }): string {
  if (w.count === 0) return "";
  const top = topAxes(w.emotions, 2);
  const tone =
    w.valence > 0.25
      ? "a lighter, more open stretch"
      : w.valence < -0.2
        ? "a heavier stretch"
        : "a steady, even stretch";
  return `This was ${tone} — ${top[0]} and ${top[1]} sat above the rest.`;
}

export const getEmotionWindows = createServerFn({ method: "POST" })
  .validator((d: { entries: unknown; today: string }) => ({
    entries: validateEntries(d?.entries),
    today: assertDate(d?.today),
  }))
  .handler(async ({ data }): Promise<EmotionWindowsResult> => {
    const { entries, today } = data;
    const withAge = entries.map((e) => ({ e, age: daysAgo(e.date, today) }));

    const todayEntries = withAge.filter((x) => x.age === 0).map((x) => x.e);
    let todayBucket = todayEntries;
    if (todayBucket.length === 0 && entries.length > 0) {
      todayBucket = [entries[entries.length - 1]]; // most recent
    }
    const inRange = (max: number) => withAge.filter((x) => x.age >= 0 && x.age <= max).map((x) => x.e);

    const buckets: Record<WindowKey, EntryInput[]> = {
      today: todayBucket,
      week: inRange(6),
      month: inRange(29),
      quarter: inRange(89),
      all: entries, // every entry, no date filter — the whole story
    };

    const stats = {} as Record<WindowKey, ReturnType<typeof averageWindow>>;
    for (const k of WINDOW_KEYS) stats[k] = averageWindow(buckets[k]);

    const judgements = {} as Record<WindowKey, string>;
    for (const k of WINDOW_KEYS) judgements[k] = fallbackJudgement(stats[k]);

    const anyData = WINDOW_KEYS.some((k) => stats[k].count > 0);

    const WINDOW_PROMPT_LABELS: Record<WindowKey, string> = {
      today: "today",
      week: "last 7 days",
      month: "last 30 days",
      quarter: "last 90 days",
      all: "all time (every entry)",
    };

    if (anyData && llmConfigured()) {
      try {
        const summarize = (k: WindowKey) => {
          const s = stats[k];
          const label = WINDOW_PROMPT_LABELS[k];
          if (s.count === 0) return `${label}: no entries.`;
          const axesStr = EMOTION_AXES.map((a) => `${a} ${s.emotions[a].toFixed(2)}`).join(", ");
          const sample = buckets[k]
            .slice(-2)
            .map((e) => `"${snip(e.text, 160)}"`)
            .join(" ");
          return `${label}: ${s.count} entries, average mood ${s.valence.toFixed(
            2,
          )} (-1..1). Average emotion axes: ${axesStr}. Recent snippets: ${sample}`;
        };
        const prompt = `For each non-empty time window below, write ONE warm, plain-language sentence (two at most) describing that window's emotional shape, grounded in the averaged axes. You may compare a shorter window to a longer one ("steadier than the month before"). This is a supportive reflection a kind friend might offer — never clinical, never a diagnosis, never a score of the person. If a window shows sustained heaviness, stay caring and you may gently note it could help to talk to someone they trust, without alarm or instructions.

${WINDOW_KEYS.map(summarize).join("\n")}

Return ONLY JSON with these keys: {"today": "...", "week": "...", "month": "...", "quarter": "...", "all": "..."}. Use an empty string for any window with no entries.`;
        const raw = await callLLMJson<Record<string, string>>({
          system: VOICE,
          prompt,
          maxTokens: 600,
        });
        for (const k of WINDOW_KEYS) {
          if (stats[k].count > 0 && typeof raw[k] === "string" && raw[k].trim()) {
            judgements[k] = raw[k].trim();
          }
        }
      } catch (err) {
        console.error("get-emotion-windows: judgement LLM failed", err);
      }
    }

    const windows = {} as Record<WindowKey, EmotionWindow>;
    for (const k of WINDOW_KEYS) {
      windows[k] = {
        emotions: stats[k].emotions,
        valence: stats[k].valence,
        count: stats[k].count,
        judgement: stats[k].count === 0 ? "" : judgements[k],
      };
    }

    return { axes: EMOTION_AXES, windows };
  });

// ============================================================================
// 4. get-insights (the reveal)
// ============================================================================

function fallbackInsights(entryCount: number): Insights {
  return {
    headline:
      entryCount > 0
        ? "A season with real movement in it — heavier weeks and lighter ones, and a throughline of people who matter."
        : "Your story starts the moment you write your first entry.",
    recurring_themes: [],
    people: [],
    bright_spots: [],
    hard_patterns: [],
    emotional_arc:
      "Add a few more entries and the arc of these weeks will come into focus here.",
    surprise: "",
  };
}

export const getInsights = createServerFn({ method: "POST" })
  .validator((d: { entries: unknown }) => ({ entries: validateEntries(d?.entries) }))
  .handler(async ({ data }): Promise<Insights> => {
    const entries = data.entries;

    if (entries.length === 0 || !llmConfigured()) {
      return fallbackInsights(entries.length);
    }

    // The most recent 60 entries, trimmed, are plenty for pattern-finding.
    const window = entries.slice(-60);
    const entryBlock = window.map((e) => `[${e.date}] ${snip(e.text, 380)}`).join("\n");
    const moodLine = entries
      .map((e) => `${e.date} ${e.sentiment_score.toFixed(2)} (${e.dominant_emotion})`)
      .join("\n");

    try {
      const insights = await callLLMJson<Insights>({
        system: VOICE,
        prompt: `Below are a person's private journal entries plus a day-by-day mood trace. Synthesize what you notice across the whole period: recurring emotional themes, the people who matter and how those relationships changed, what is tied to the best days, what the hardest stretches had in common, and how the mood shifted from earliest to most recent. Insist on specifics drawn from the entries — names, concrete details, real recurrences — never generic platitudes. Address the person as "you".

## entries (oldest first)
${entryBlock}

## day-by-day mood (date, score -1..1, dominant emotion)
${moodLine}

Return ONLY JSON in this exact shape:
{
  "headline": "one warm sentence summing up the period",
  "recurring_themes": [{ "theme": "...", "note": "one specific observation" }],
  "people": [{ "name": "...", "note": "how this relationship shows up or changed" }],
  "bright_spots": ["short specific lines about what lifts this person"],
  "hard_patterns": ["short specific lines about what recurs on low days"],
  "emotional_arc": "two or three sentences narrating how the mood moved over the period",
  "surprise": "one genuinely non-obvious pattern, phrased kindly"
}`,
        maxTokens: 1400,
      });
      const fb = fallbackInsights(entries.length);
      const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
      return {
        headline: insights.headline || fb.headline,
        recurring_themes: list<Insights["recurring_themes"][number]>(insights.recurring_themes),
        people: list<Insights["people"][number]>(insights.people),
        bright_spots: list<string>(insights.bright_spots),
        hard_patterns: list<string>(insights.hard_patterns),
        emotional_arc: insights.emotional_arc || fb.emotional_arc,
        surprise: insights.surprise || "",
      };
    } catch (err) {
      console.error("get-insights: LLM failed", err);
      return fallbackInsights(entries.length);
    }
  });

// ============================================================================
// 5. seed (demo life — optionally protected by a shared token)
// ============================================================================

export const seedDemo = createServerFn({ method: "POST" })
  .validator((d: { today: string; token?: string }) => ({
    today: assertDate(d?.today),
    token: typeof d?.token === "string" ? d.token : undefined,
  }))
  .handler(async ({ data }): Promise<{ entries: TimelineEntry[] }> => {
    const required = process.env.SEED_TOKEN;
    if (required && data.token !== required) {
      throw new Error("Unauthorized: bad seed token");
    }
    return { entries: generateSeedEntries(data.today) };
  });
