import {
  clampValence,
  labelFromScore,
  normalizeVector,
  type EntryAnalysis,
  type TimelineEntry,
} from "./emotions";

// The journal lives in the browser (localStorage), one list per person.
// Entries never leave the device except as text sent to the model for scoring.
// All access is wrapped: storage can be blocked (private mode) or full, and a
// failure must degrade to "no saved entries", never a crash.

const key = (userId: string) => `throughline.entries.${userId}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface StoredEntry extends TimelineEntry {
  themes?: string[];
  people?: string[];
}

function sanitize(raw: unknown): StoredEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.date !== "string" || !DATE_RE.test(r.date)) return null;
  if (typeof r.text !== "string") return null;
  const score = clampValence(Number(r.sentiment_score));
  const s = Number.isFinite(score) ? score : 0;
  return {
    date: r.date,
    text: r.text,
    sentiment_score: s,
    sentiment_label:
      typeof r.sentiment_label === "string" &&
      ["very_low", "low", "neutral", "good", "great"].includes(r.sentiment_label)
        ? (r.sentiment_label as StoredEntry["sentiment_label"])
        : labelFromScore(s),
    dominant_emotion:
      typeof r.dominant_emotion === "string" && r.dominant_emotion ? r.dominant_emotion : "calm",
    emotions: normalizeVector(r.emotions),
    themes: Array.isArray(r.themes) ? r.themes.map(String).slice(0, 4) : undefined,
    people: Array.isArray(r.people) ? r.people.map(String).slice(0, 3) : undefined,
  };
}

/** All saved entries for a person, oldest first. Never throws. */
export function loadEntries(userId: string): StoredEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitize)
      .filter((e): e is StoredEntry => e !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/** Replace the whole journal. Returns false if the browser refused the write. */
export function saveEntries(userId: string, entries: StoredEntry[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** The text already written for a given day (so a second note joins the first). */
export function entryForDate(userId: string, date: string): StoredEntry | undefined {
  return loadEntries(userId).find((e) => e.date === date);
}

/** Insert or replace the entry for `date`. */
export function upsertEntry(
  userId: string,
  date: string,
  text: string,
  analysis: EntryAnalysis,
): { saved: boolean; entry: StoredEntry } {
  const entry: StoredEntry = {
    date,
    text,
    sentiment_score: analysis.sentiment_score,
    sentiment_label: analysis.sentiment_label,
    dominant_emotion: analysis.dominant_emotion,
    emotions: analysis.emotions,
    themes: analysis.themes,
    people: analysis.people,
  };
  const rest = loadEntries(userId).filter((e) => e.date !== date);
  const saved = saveEntries(userId, [...rest, entry]);
  return { saved, entry };
}

/** Merge entries in (used by the demo loader); existing days are replaced. */
export function mergeEntries(userId: string, incoming: TimelineEntry[]): boolean {
  const byDate = new Map(loadEntries(userId).map((e) => [e.date, e]));
  for (const e of incoming) {
    const s = sanitize(e);
    if (s) byDate.set(s.date, s);
  }
  return saveEntries(userId, [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
}

