import { createServerFn } from "@tanstack/react-start";

import {
  EMOTION_AXES,
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
import {
  addMemories,
  ensureTenantReady,
  listMemories,
  recall,
  type RawMemory,
} from "../server/hydra";
import { callLLM, callLLMJson, llmConfigured } from "../server/llm";
import { generateSeedEntries } from "../server/seed-data";

// The agent's register: a thoughtful biographer and a kind friend. It reflects,
// it does not advise. No clinical tone, no diagnosis.
const VOICE = `You are the quiet intelligence behind Throughline, a private journaling companion.
You write like a thoughtful biographer and a kind friend — specific, warm, literary, brief.
You reflect a person back to themselves with real detail; you never advise, never diagnose,
never use clinical phrasing like "it sounds like". You are not a therapist or a chatbot.
Throughline is a journaling companion, not a mental health tool, and never presents itself as one.`;

function serverToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(dateISO: string, todayISO: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d, 12, 0, 0);
  };
  return Math.round((p(todayISO) - p(dateISO)) / 86_400_000);
}

// --- entry text sidecar -----------------------------------------------------
//
// The live /list/data endpoint returns no metadata, so we embed the analysis as
// a compact sidecar appended to the stored text. The user-visible text is the
// part before the tag; the sidecar is decoded for the timeline / radar and
// stripped before any recalled snippet is shown to the LLM. We *also* write the
// HydraDB metadata fields (used by recall + the graph) for good measure.

const META_TAG = "\n@@meta@@";

interface EntryMeta {
  s: number;
  l: SentimentLabel;
  d: string;
  e: EmotionVector;
  t?: string[];
  p?: string[];
}

function encodeEntryText(
  text: string,
  a: {
    sentiment_score: number;
    sentiment_label: SentimentLabel;
    dominant_emotion: string;
    emotions: EmotionVector;
    themes?: string[];
    people?: string[];
  },
): string {
  const meta: EntryMeta = {
    s: a.sentiment_score,
    l: a.sentiment_label,
    d: a.dominant_emotion,
    e: a.emotions,
    t: a.themes,
    p: a.people,
  };
  return `${text}${META_TAG}${JSON.stringify(meta)}`;
}

function decodeEntryText(stored: string): { text: string; meta: EntryMeta | null } {
  const i = stored.indexOf(META_TAG);
  if (i === -1) return { text: stored.trim(), meta: null };
  const text = stored.slice(0, i).trim();
  try {
    return { text, meta: JSON.parse(stored.slice(i + META_TAG.length)) as EntryMeta };
  } catch {
    return { text, meta: null };
  }
}

/** Drop the sidecar from any text before it reaches the LLM or the user. */
function stripMeta(s: string): string {
  const i = s.indexOf(META_TAG);
  return (i === -1 ? s : s.slice(0, i)).trim();
}

/** A recalled snippet is useful only if it's real prose (not a stray JSON chunk). */
function cleanSnippet(s: string): string {
  const out = stripMeta(s);
  return out.startsWith("{") ? "" : out;
}

// --- list item -> timeline entry -------------------------------------------

function itemToEntry(item: RawMemory): TimelineEntry | null {
  // memory_id is our source_id: entry_<userId>_<YYYY-MM-DD>
  const m = item.memory_id?.match(/(\d{4}-\d{2}-\d{2})$/);
  const date = m ? m[1] : "";
  if (!date) return null;
  const { text, meta } = decodeEntryText(item.memory_content || "");
  const score = meta ? clampValence(Number(meta.s)) : 0;
  return {
    date,
    text,
    sentiment_score: Number.isFinite(score) ? score : 0,
    sentiment_label: meta?.l ?? labelFromScore(score),
    dominant_emotion: meta?.d ?? "calm",
    emotions: meta?.e ? normalizeVector(meta.e) : flatVector(),
  };
}

async function loadEntries(userId: string): Promise<TimelineEntry[]> {
  const items = await listMemories(userId);
  return items
    .map(itemToEntry)
    .filter((e): e is TimelineEntry => e !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
// 1. init-tenant
// ============================================================================

export const initTenant = createServerFn({ method: "POST" }).handler(async () => {
  const ready = await ensureTenantReady();
  return { ok: ready, ready };
});

// ============================================================================
// 2. submit-entry
// ============================================================================

interface SubmitInput {
  userId: string;
  date: string;
  text: string;
}

const EXTRACTION_PROMPT = (
  text: string,
) => `Analyze this single journal entry and return ONLY JSON matching this exact shape:
{
  "sentiment_score": <number from -1.0 to 1.0>,
  "sentiment_label": <"very_low" | "low" | "neutral" | "good" | "great">,
  "dominant_emotion": <single lowercase word, e.g. "anxious", "calm", "proud", "lonely", "hopeful">,
  "emotions": {
    "joy": <0.0-1.0>, "calm": <0.0-1.0>, "hope": <0.0-1.0>, "gratitude": <0.0-1.0>,
    "sadness": <0.0-1.0>, "anxiety": <0.0-1.0>, "anger": <0.0-1.0>, "loneliness": <0.0-1.0>
  },
  "themes": [<2-4 short lowercase tags like "work", "family", "sleep", "running">],
  "people": [<0-3 first names mentioned, e.g. "Mom", "Dana">],
  "reflection": <one warm sentence reflecting the entry back, no advice, no clinical tone>
}
Each of the eight emotion axes is scored independently from 0.0 (absent) to 1.0 (strongly present); they are intensities, not a distribution.

Entry:
"""${text}"""`;

function neutralAnalysis(): EntryAnalysis {
  return {
    sentiment_score: 0,
    sentiment_label: "neutral",
    dominant_emotion: "calm",
    emotions: flatVector(),
    themes: [],
    people: [],
    reflection: "Noted, and held. Thank you for putting today into words.",
  };
}

function coerceAnalysis(raw: unknown): EntryAnalysis {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const score = clampValence(Number(r.sentiment_score));
  const emotions = normalizeVector(r.emotions);
  return {
    sentiment_score: Number.isFinite(score) ? score : 0,
    sentiment_label:
      typeof r.sentiment_label === "string"
        ? (r.sentiment_label as EntryAnalysis["sentiment_label"])
        : labelFromScore(score),
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
      typeof r.reflection === "string" && r.reflection ? r.reflection : "Noted, and held.",
  };
}

async function storeEntry(
  userId: string,
  date: string,
  text: string,
  a: EntryAnalysis,
): Promise<void> {
  await addMemories(userId, [
    {
      source_id: `entry_${userId}_${date}`,
      text: encodeEntryText(text, a),
      infer: false,
      metadata: {
        entry_date: date,
        sentiment_label: a.sentiment_label,
        sentiment_score: String(a.sentiment_score),
        dominant_emotion: a.dominant_emotion,
        emotions_json: JSON.stringify(a.emotions),
      },
    },
  ]);
}

export const submitEntry = createServerFn({ method: "POST" })
  .inputValidator((d: SubmitInput) => d)
  .handler(async ({ data }) => {
    const { userId, date, text } = data;
    await ensureTenantReady();

    let analysis: EntryAnalysis;
    if (llmConfigured()) {
      try {
        const raw = await callLLMJson({
          system: VOICE,
          prompt: EXTRACTION_PROMPT(text),
          maxTokens: 700,
        });
        analysis = coerceAnalysis(raw);
      } catch (err) {
        console.error("submit-entry: LLM analysis failed, using neutral", err);
        analysis = neutralAnalysis();
      }
    } else {
      analysis = neutralAnalysis();
    }

    // Never let an entry fail to save.
    await storeEntry(userId, date, text, analysis);
    return analysis;
  });

// ============================================================================
// 3. get-opener
// ============================================================================

const FIRST_TIME_OPENER =
  "This is a blank page and a private one. Tell me a little about today — a few sentences is plenty.";

export const getOpener = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const { userId } = data;
    let snippets: string[] = [];
    try {
      const results = await recall(
        userId,
        "what has this person been feeling lately, and what ongoing situations, people, worries, or small wins should I gently follow up on",
        { maxResults: 12, mode: "thinking" },
      );
      snippets = results.map((r) => cleanSnippet(r.text)).filter(Boolean);
    } catch (err) {
      console.error("get-opener: recall failed", err);
    }

    if (snippets.length === 0 || !llmConfigured()) {
      return { opener: FIRST_TIME_OPENER };
    }

    try {
      const opener = await callLLM({
        system: VOICE,
        prompt: `Here are recalled fragments from this person's past entries (most recent and most relevant):

${snippets.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Write ONE short, warm, specific greeting (one or two sentences) to open today's check-in. Reference something real from the past — a person by name, a prior worry, or a small win — the way a close friend who remembers would. Reflect, do not advise. Return only the greeting text, no quotes.`,
        maxTokens: 160,
      });
      return { opener: opener.trim() || FIRST_TIME_OPENER };
    } catch (err) {
      console.error("get-opener: LLM failed", err);
      return { opener: FIRST_TIME_OPENER };
    }
  });

// ============================================================================
// 4. get-timeline
// ============================================================================

export const getTimeline = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const entries = await loadEntries(data.userId);
    return { entries };
  });

// ============================================================================
// 5. get-emotion-windows
// ============================================================================

function averageWindow(entries: TimelineEntry[]): {
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
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }): Promise<EmotionWindowsResult> => {
    const today = serverToday();
    const entries = await loadEntries(data.userId);

    const withAge = entries.map((e) => ({ e, age: daysAgo(e.date, today) }));

    const todayEntries = withAge.filter((x) => x.age === 0).map((x) => x.e);
    let todayBucket = todayEntries;
    if (todayBucket.length === 0 && entries.length > 0) {
      todayBucket = [entries[entries.length - 1]]; // most recent
    }
    const weekBucket = withAge.filter((x) => x.age >= 0 && x.age <= 6).map((x) => x.e);
    const monthBucket = withAge.filter((x) => x.age >= 0 && x.age <= 29).map((x) => x.e);
    const quarterBucket = withAge.filter((x) => x.age >= 0 && x.age <= 89).map((x) => x.e);

    const buckets: Record<WindowKey, TimelineEntry[]> = {
      today: todayBucket,
      week: weekBucket,
      month: monthBucket,
      quarter: quarterBucket,
    };

    const stats = {
      today: averageWindow(buckets.today),
      week: averageWindow(buckets.week),
      month: averageWindow(buckets.month),
      quarter: averageWindow(buckets.quarter),
    };

    // Generate all four warm judgements in one LLM call (grounded in the
    // averaged axes plus a couple of real snippets per window).
    const judgements: Record<WindowKey, string> = {
      today: fallbackJudgement(stats.today),
      week: fallbackJudgement(stats.week),
      month: fallbackJudgement(stats.month),
      quarter: fallbackJudgement(stats.quarter),
    };

    const anyData = (Object.keys(stats) as WindowKey[]).some((k) => stats[k].count > 0);

    if (anyData && llmConfigured()) {
      try {
        const summarize = (k: WindowKey, label: string) => {
          const s = stats[k];
          if (s.count === 0) return `${label}: no entries.`;
          const axesStr = EMOTION_AXES.map((a) => `${a} ${s.emotions[a].toFixed(2)}`).join(", ");
          const sample = buckets[k]
            .slice(-2)
            .map((e) => `"${e.text.slice(0, 160)}"`)
            .join(" ");
          return `${label}: ${s.count} entries, average mood ${s.valence.toFixed(
            2,
          )} (-1..1). Average emotion axes: ${axesStr}. Recent snippets: ${sample}`;
        };
        const prompt = `For each non-empty time window below, write ONE warm, plain-language sentence (two at most) describing that window's emotional shape, grounded in the averaged axes. You may compare a shorter window to a longer one ("steadier than the month before"). This is a supportive reflection a kind friend might offer — never clinical, never a diagnosis, never a score of the person. If a window shows sustained heaviness, stay caring and you may gently note it could help to talk to someone they trust, without alarm or instructions.

${summarize("today", "today")}
${summarize("week", "last 7 days")}
${summarize("month", "last 30 days")}
${summarize("quarter", "last 90 days")}

Return ONLY JSON: {"today": "...", "week": "...", "month": "...", "quarter": "..."}. Use an empty string for any window with no entries.`;
        const raw = await callLLMJson<Record<string, string>>({
          system: VOICE,
          prompt,
          maxTokens: 500,
        });
        for (const k of ["today", "week", "month", "quarter"] as WindowKey[]) {
          if (stats[k].count > 0 && typeof raw[k] === "string" && raw[k].trim()) {
            judgements[k] = raw[k].trim();
          } else if (stats[k].count === 0) {
            judgements[k] = "";
          }
        }
      } catch (err) {
        console.error("get-emotion-windows: judgement LLM failed", err);
      }
    }

    const windows = {} as Record<WindowKey, EmotionWindow>;
    for (const k of ["today", "week", "month", "quarter"] as WindowKey[]) {
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
// 6. get-insights (the reveal)
// ============================================================================

const INSIGHT_LENSES = [
  "the recurring emotional themes across these entries",
  "the people who matter most here and how those relationships changed over time",
  "the activities, places, or routines tied to this person's best days",
  "what the hardest stretches had in common",
  "how the overall mood has shifted from the earliest entries to the most recent",
];

function fallbackInsights(entries: TimelineEntry[]): Insights {
  return {
    headline:
      entries.length > 0
        ? "A season with real movement in it — heavier weeks and lighter ones, and a throughline of people who matter."
        : "Your story starts the moment you write your first entry.",
    recurring_themes: [],
    people: [],
    bright_spots: [],
    hard_patterns: [],
    emotional_arc: "Add a few more entries and the arc of these weeks will come into focus here.",
    surprise: "",
  };
}

export const getInsights = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }): Promise<Insights> => {
    const { userId } = data;
    const entries = await loadEntries(userId);

    if (entries.length === 0 || !llmConfigured()) {
      return fallbackInsights(entries);
    }

    // Broad recall across several lenses (thinking mode = graph traversal).
    const recalls = await Promise.all(
      INSIGHT_LENSES.map((lens) =>
        recall(userId, lens, { maxResults: 10, mode: "thinking" })
          .then((r) => ({
            lens,
            snippets: r.map((x) => cleanSnippet(x.text)).filter(Boolean),
          }))
          .catch(() => ({ lens, snippets: [] as string[] })),
      ),
    );

    const moodLine = entries
      .map((e) => `${e.date} ${e.sentiment_score.toFixed(2)} (${e.dominant_emotion})`)
      .join("\n");

    const lensBlock = recalls
      .map(
        (r) =>
          `## ${r.lens}\n${
            r.snippets.length ? r.snippets.map((s) => `- ${s}`).join("\n") : "- (nothing surfaced)"
          }`,
      )
      .join("\n\n");

    try {
      const insights = await callLLMJson<Insights>({
        system: VOICE,
        prompt: `Below are fragments recalled from a person's private journal, grouped by lens, plus a day-by-day mood trace. Synthesize what you notice across the whole period. Insist on specifics drawn from the entries — names, concrete details, real recurrences — never generic platitudes.

${lensBlock}

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
      // Light shape guard.
      return {
        headline: insights.headline || fallbackInsights(entries).headline,
        recurring_themes: Array.isArray(insights.recurring_themes) ? insights.recurring_themes : [],
        people: Array.isArray(insights.people) ? insights.people : [],
        bright_spots: Array.isArray(insights.bright_spots) ? insights.bright_spots : [],
        hard_patterns: Array.isArray(insights.hard_patterns) ? insights.hard_patterns : [],
        emotional_arc: insights.emotional_arc || "",
        surprise: insights.surprise || "",
      };
    } catch (err) {
      console.error("get-insights: LLM failed", err);
      return fallbackInsights(entries);
    }
  });

// ============================================================================
// 7. seed (dev only — protected by a shared token)
// ============================================================================

interface SeedInput {
  userId: string;
  token?: string;
}

export const seedDemo = createServerFn({ method: "POST" })
  .inputValidator((d: SeedInput) => d)
  .handler(async ({ data }) => {
    const required = process.env.SEED_TOKEN;
    if (required && data.token !== required) {
      throw new Error("Unauthorized: bad seed token");
    }

    await ensureTenantReady();
    const today = serverToday();
    const entries = generateSeedEntries(today);

    // Write in batches so we don't send one enormous request.
    const BATCH = 20;
    let written = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      await addMemories(
        data.userId,
        slice.map((e) => ({
          source_id: `entry_${data.userId}_${e.date}`,
          text: encodeEntryText(e.text, e),
          infer: false,
          metadata: {
            entry_date: e.date,
            sentiment_label: e.sentiment_label,
            sentiment_score: String(e.sentiment_score),
            dominant_emotion: e.dominant_emotion,
            emotions_json: JSON.stringify(e.emotions),
          },
        })),
      );
      written += slice.length;
    }

    // Memories are queued for ingestion (not instantly queryable). Wait until
    // they're listable so the timeline / reveal are populated on return.
    const deadline = Date.now() + 90_000;
    let ingested = 0;
    while (Date.now() < deadline) {
      ingested = (await listMemories(data.userId)).length;
      if (ingested >= written) break;
      await new Promise((r) => setTimeout(r, 3000));
    }

    return { ok: true, written, ingested };
  });
