// Canonical emotion spec shared by the LLM contract, the edge/server functions,
// and the UI. Keep the axis order fixed forever so stored vectors stay
// comparable and the radar overlays line up frame to frame.

export const EMOTION_AXES = [
  "joy",
  "calm",
  "hope",
  "gratitude",
  "sadness",
  "anxiety",
  "anger",
  "loneliness",
] as const;

export type EmotionAxis = (typeof EMOTION_AXES)[number];
export type EmotionVector = Record<EmotionAxis, number>;

export type SentimentLabel = "very_low" | "low" | "neutral" | "good" | "great";

export const WINDOW_KEYS = ["today", "week", "month", "quarter", "all"] as const;
export type WindowKey = (typeof WINDOW_KEYS)[number];

export const WINDOW_LABELS: Record<WindowKey, string> = {
  today: "Today",
  week: "Last week",
  month: "Last month",
  quarter: "Last 3 months",
  all: "All time",
};

/** The per-entry analysis returned by the LLM (and echoed to the client). */
export interface EntryAnalysis {
  sentiment_score: number;
  sentiment_label: SentimentLabel;
  dominant_emotion: string;
  emotions: EmotionVector;
  themes: string[];
  people: string[];
  reflection: string;
}

/** A single stored entry as the Timeline / chart consume it. */
export interface TimelineEntry {
  date: string; // YYYY-MM-DD
  text: string;
  sentiment_score: number;
  sentiment_label: SentimentLabel;
  dominant_emotion: string;
  emotions: EmotionVector;
}

export interface EmotionWindow {
  emotions: EmotionVector;
  valence: number;
  count: number;
  judgement: string;
}

export interface EmotionWindowsResult {
  axes: typeof EMOTION_AXES;
  windows: Record<WindowKey, EmotionWindow>;
}

export interface Insights {
  headline: string;
  recurring_themes: { theme: string; note: string }[];
  people: { name: string; note: string }[];
  bright_spots: string[];
  hard_patterns: string[];
  emotional_arc: string;
  surprise: string;
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function clampValence(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

/** An all-zero emotion vector — the neutral / empty-window fallback. */
export function flatVector(): EmotionVector {
  return Object.fromEntries(EMOTION_AXES.map((a) => [a, 0])) as EmotionVector;
}

/** Coerce arbitrary input into a complete, clamped 8-axis vector. */
export function normalizeVector(input: unknown): EmotionVector {
  const out = flatVector();
  if (input && typeof input === "object") {
    for (const axis of EMOTION_AXES) {
      const v = (input as Record<string, unknown>)[axis];
      if (typeof v === "number") out[axis] = clamp01(v);
    }
  }
  return out;
}

export function labelFromScore(score: number): SentimentLabel {
  if (score <= -0.6) return "very_low";
  if (score <= -0.2) return "low";
  if (score < 0.2) return "neutral";
  if (score < 0.6) return "good";
  return "great";
}

export const LABEL_TEXT: Record<SentimentLabel, string> = {
  very_low: "a heavy day",
  low: "a low day",
  neutral: "a steady day",
  good: "a good day",
  great: "a bright day",
};

/**
 * A calm mood color scale. Low days are a muted dusk blue, steady days a soft
 * stone, bright days a warm amber. Never an alarming red — this is a portrait
 * of a season, not a warning light. Returns an `oklch(...)` string.
 */
export function moodColor(score: number, alpha = 1): string {
  const t = (clampValence(score) + 1) / 2; // 0..1, low -> high
  // Interpolate indigo ink -> warm grey -> ochre.
  const stops: [number, [number, number, number]][] = [
    [0, [0.46, 0.13, 265]], // L, C, H - indigo ink
    [0.5, [0.6, 0.03, 90]], // warm grey
    [1, [0.72, 0.15, 62]], // ochre
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const k = (t - lo[0]) / span;
  const L = lo[1][0] + (hi[1][0] - lo[1][0]) * k;
  const C = lo[1][1] + (hi[1][1] - lo[1][1]) * k;
  const H = lo[1][2] + (hi[1][2] - lo[1][2]) * k;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${(H % 360).toFixed(1)}${alpha < 1 ? ` / ${alpha}` : ""})`;
}

/** Per-window ink colors for the radar overlays. */
export const WINDOW_COLORS: Record<WindowKey, string> = {
  today: "oklch(0.58 0.2 34)", // vermilion
  week: "oklch(0.72 0.15 75)", // ochre
  month: "oklch(0.55 0.1 190)", // teal
  quarter: "oklch(0.5 0.13 255)", // blue ink
  all: "oklch(0.28 0.02 60)", // black ink - the whole story
};

export interface RadarRow {
  axis: EmotionAxis;
  label: string;
  today?: number;
  week?: number;
  month?: number;
  quarter?: number;
  all?: number;
}

const AXIS_LABELS: Record<EmotionAxis, string> = {
  joy: "Joy",
  calm: "Calm",
  hope: "Hope",
  gratitude: "Gratitude",
  sadness: "Sadness",
  anxiety: "Anxiety",
  anger: "Anger",
  loneliness: "Loneliness",
};

export function axisLabel(axis: EmotionAxis): string {
  return AXIS_LABELS[axis];
}

/**
 * Reshape the windowed vectors into one row per axis (recharts radar format).
 * Only includes window keys present in `show`.
 */
export function toRadarRows(
  windows: Partial<Record<WindowKey, EmotionVector>>,
  show: WindowKey[],
): RadarRow[] {
  return EMOTION_AXES.map((axis) => {
    const row: RadarRow = { axis, label: AXIS_LABELS[axis] };
    for (const key of show) {
      const vec = windows[key];
      if (vec) row[key] = Number(vec[axis].toFixed(3));
    }
    return row;
  });
}
