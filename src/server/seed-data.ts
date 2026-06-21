// Deterministic "demo life" generator. The prompt allows seed sentiment/emotions
// to be precomputed rather than LLM-scored, which makes seeding instant, free,
// and perfectly reproducible — and lets us shape an arc the reveal can read.
//
// Arc across ~90 days ending today:
//   - new job, early anxiety, a dreaded presentation (~week 3) with manager Priya
//   - regular calls with Mom: tension mid-period, warm reconciliation near the end
//   - morning runs (often with Dana) that coincide with the better days
//   - a low stretch (days 38-48) of poor sleep and feeling flat, then recovery
//   - overall mood trending upward, so the week radar reads calmer than the quarter

import {
  clamp01,
  clampValence,
  flatVector,
  labelFromScore,
  type EmotionAxis,
  type EmotionVector,
  type TimelineEntry,
} from "../lib/emotions";

const SPAN = 90; // days, index 0 (oldest) .. 89 (today)

function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function pick<T>(seed: number, arr: T[]): T {
  return arr[Math.floor(rand(seed) * arr.length) % arr.length];
}
function chance(seed: number, p: number): boolean {
  return rand(seed) < p;
}

function dateMinus(todayISO: string, daysBack: number): string {
  const [y, m, d] = todayISO.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d, 12, 0, 0);
  return new Date(base - daysBack * 86_400_000).toISOString().slice(0, 10);
}

type Phase =
  | "newjob"
  | "presentation"
  | "footing"
  | "low"
  | "recovery"
  | "tension"
  | "confidence"
  | "reconcile";

function phaseOf(d: number): Phase {
  if (d < 14) return "newjob";
  if (d < 25) return "presentation";
  if (d < 38) return "footing";
  if (d <= 48) return "low";
  if (d < 55) return "recovery";
  if (d < 68) return "tension";
  if (d < 80) return "confidence";
  return "reconcile";
}

// Smooth valence backbone via linear interpolation between control points.
const CONTROL: [number, number][] = [
  [0, -0.35],
  [12, -0.12],
  [18, -0.5],
  [24, 0.05],
  [32, 0.22],
  [38, -0.2],
  [43, -0.62],
  [48, -0.22],
  [54, 0.12],
  [60, 0.27],
  [68, 0.16],
  [74, 0.32],
  [80, 0.46],
  [86, 0.55],
  [89, 0.62],
];

function baseValence(d: number): number {
  let lo = CONTROL[0];
  let hi = CONTROL[CONTROL.length - 1];
  for (let i = 0; i < CONTROL.length - 1; i++) {
    if (d >= CONTROL[i][0] && d <= CONTROL[i + 1][0]) {
      lo = CONTROL[i];
      hi = CONTROL[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const k = (d - lo[0]) / span;
  return lo[1] + (hi[1] - lo[1]) * k;
}

const DOMINANT_WORD: Record<EmotionAxis, string> = {
  joy: "glad",
  calm: "calm",
  hope: "hopeful",
  gratitude: "grateful",
  sadness: "flat",
  anxiety: "anxious",
  anger: "frustrated",
  loneliness: "lonely",
};

function dominantOf(v: EmotionVector): string {
  let best: EmotionAxis = "calm";
  let bestVal = -1;
  (Object.keys(v) as EmotionAxis[]).forEach((axis) => {
    if (v[axis] > bestVal) {
      bestVal = v[axis];
      best = axis;
    }
  });
  return DOMINANT_WORD[best];
}

// --- sentence pools ---------------------------------------------------------

const RUN_LINES = [
  "Got out for a run before work and the morning felt wide open.",
  "A slow five miles at dawn. I always feel most like myself out there.",
  "Ran the river loop. Dana met me at the bridge and we just talked the whole way.",
  "Morning run with Dana, then coffee. Easily the best part of the week.",
  "Laced up before sunrise. Came back clearer than I left.",
];

const MOM_WARM = [
  "Long call with Mom tonight — the easy kind, where neither of us is keeping score.",
  "Mom called just to say hi. We laughed about the old apartment.",
  "Talked to Mom for an hour. Something between us has softened.",
];
const MOM_TENSE = [
  "Mom called and it went sideways again. Same argument, different week.",
  "Short, prickly call with Mom. I hung up tired.",
  "Mom and I talked past each other again. I keep wanting it to land differently.",
];

const SLEEP_LINES = [
  "Barely slept again. Everything feels like it's underwater.",
  "Third bad night of sleep. I'm running on fumes and it shows.",
  "Woke at 4 and never got back down. The day was a fog after that.",
];

const PHRASES: Record<Phase, string[]> = {
  newjob: [
    "First weeks at the new job. I keep waiting to be found out.",
    "Trying to remember everyone's name at work and mostly failing.",
    "Priya walked me through the codebase today. She's patient, which helps.",
    "New job, new commute, new everything. Quietly overwhelmed.",
    "Set up my desk properly today. Small thing, but it helped me feel real here.",
  ],
  presentation: [
    "The team presentation is in a week and I'm already dreading it.",
    "Priya asked me to present the migration plan. My stomach dropped.",
    "Rehearsed the talk in the shower, in the car, at my desk. Still nervous.",
    "Imposter feeling is loud this week. Everyone seems to know more than me.",
    "Gave the presentation. It wasn't a disaster. Priya said it was clear.",
    "Relief after the talk. I'd built it up into a monster and it was just a meeting.",
  ],
  footing: [
    "Starting to find a rhythm at work. Fewer panicked moments.",
    "Shipped my first real thing today. Priya left a kind note on it.",
    "Coffee with Dana after work. I needed the company.",
    "A steady day. Nothing dramatic, which is its own kind of good.",
    "Caught myself enjoying the work for a minute. Noted it.",
  ],
  low: [
    "Flat all day. Couldn't say why, just gray.",
    "Going through the motions. The spark isn't there this week.",
    "Everything feels heavier than it should. Even small tasks.",
    "Cancelled plans. Didn't have it in me to be a person tonight.",
    "Low again. I know it passes but it doesn't feel like it right now.",
  ],
  recovery: [
    "A little lighter today. The fog is thinning.",
    "First good run in a while. My body remembered before my head did.",
    "Got outside, ate a real meal, answered my texts. Climbing back.",
    "Slept through the night finally. Everything is easier after that.",
    "Felt the bottom turn today. Tired but hopeful.",
  ],
  tension: [
    "Work is steadier but home is loud. Mom and I keep snagging on the same thing.",
    "Frustrated tonight. The Mom situation sits in my chest all day.",
    "Good day at work undercut by a hard call with family.",
    "Trying to hold a boundary with Mom without it becoming a fight.",
    "Ran to burn off the family stuff. Helped a little.",
  ],
  confidence: [
    "Led the standup today and it felt natural. When did that happen?",
    "Priya put me on the new project. I think she actually trusts me now.",
    "Good week at work. I'm not bracing for impact anymore.",
    "Mentored the new hire today — funny, being on the other side of it.",
    "Quietly proud of how far this job has come since the first week.",
  ],
  reconcile: [
    "Mom and I really talked tonight. Years of static, and then just — quiet.",
    "Something healed with Mom this week. I didn't expect to cry.",
    "Long run, then a warm call with Mom. A good, full day.",
    "Work is good, home is good. I keep waiting for the catch and it isn't coming.",
    "Grateful in a plain, unspectacular way today. I'll take it.",
  ],
};

type SeedEntry = TimelineEntry;

function buildEmotions(
  d: number,
  v: number,
  phase: Phase,
  flags: { run: boolean; mom: "warm" | "tense" | null; sleep: boolean; dana: boolean },
): EmotionVector {
  const pos = (clampValence(v) + 1) / 2;
  const neg = 1 - pos;
  const e = flatVector();

  e.joy = 0.12 + 0.55 * pos;
  e.calm = 0.18 + 0.45 * pos;
  e.hope = 0.18 + 0.5 * pos;
  e.gratitude = 0.12 + 0.42 * pos;
  e.sadness = 0.08 + 0.58 * neg;
  e.anxiety = 0.12 + 0.5 * neg;
  e.anger = 0.04 + 0.22 * neg;
  e.loneliness = 0.08 + 0.46 * neg;

  if (flags.run) {
    e.calm += 0.28;
    e.joy += 0.22;
  }
  if (flags.sleep) {
    e.calm -= 0.15;
    e.anxiety += 0.18;
    e.sadness += 0.12;
  }
  if (phase === "low") {
    e.sadness += 0.26;
    e.anxiety += 0.2;
    e.loneliness += 0.26;
    e.joy -= 0.12;
    e.calm -= 0.12;
  }
  if (phase === "presentation") {
    e.anxiety += 0.26;
  }
  if (phase === "reconcile") {
    e.hope += 0.2;
    e.gratitude += 0.22;
  }
  if (phase === "tension") {
    e.anger += 0.22;
    e.loneliness += 0.14;
  }
  if (flags.mom === "warm") e.gratitude += 0.18;
  if (flags.mom === "tense") e.anger += 0.16;
  if (flags.dana) e.loneliness -= 0.2;

  // tiny deterministic per-axis texture
  (Object.keys(e) as EmotionAxis[]).forEach((axis, i) => {
    e[axis] = clamp01(e[axis] + (rand(d * 9.7 + i) - 0.5) * 0.08);
  });
  return e;
}

export function generateSeedEntries(todayISO: string): SeedEntry[] {
  const entries: SeedEntry[] = [];

  for (let d = 0; d < SPAN; d++) {
    // Skip ~12% of days (but never today) so the cadence feels human.
    if (d !== SPAN - 1 && chance(d * 5.7, 0.12)) continue;

    const phase = phaseOf(d);
    const isRun =
      d < 40 || d > 46
        ? chance(
            d * 3.1,
            phase === "recovery" || phase === "confidence" || phase === "reconcile" ? 0.55 : 0.32,
          )
        : false;
    const dana = isRun && chance(d * 4.4, 0.55);
    const sleep = phase === "low" && chance(d * 2.2, 0.7);
    let mom: "warm" | "tense" | null = null;
    if (d % 7 === pickMomDay(d)) {
      mom =
        phase === "tension"
          ? "tense"
          : phase === "reconcile" || phase === "footing"
            ? "warm"
            : chance(d, 0.5)
              ? "warm"
              : "tense";
    }

    let v = baseValence(d) + (rand(d * 1.7) - 0.5) * 0.14;
    if (isRun) v += 0.15;
    if (sleep) v -= 0.12;
    if (mom === "warm") v += 0.08;
    if (mom === "tense") v -= 0.1;
    v = clampValence(v);

    const emotions = buildEmotions(d, v, phase, { run: isRun, mom, sleep, dana });

    // Assemble 1-3 sentences.
    const parts: string[] = [pick(d * 1.3, PHRASES[phase])];
    if (sleep) parts.push(pick(d * 2.9, SLEEP_LINES));
    if (isRun) parts.push(pick(d * 3.7, dana ? RUN_LINES.slice(2) : RUN_LINES));
    if (mom === "warm") parts.push(pick(d * 5.1, MOM_WARM));
    if (mom === "tense") parts.push(pick(d * 5.1, MOM_TENSE));
    // Keep it from getting too long: at most 2 supporting lines.
    const text = [parts[0], ...parts.slice(1, 3)].join(" ");

    const score = Number(v.toFixed(2));
    entries.push({
      date: dateMinus(todayISO, SPAN - 1 - d),
      text,
      sentiment_score: score,
      sentiment_label: labelFromScore(score),
      dominant_emotion: dominantOf(emotions),
      emotions,
    });
  }

  return entries;
}

// Spread Mom calls across the week deterministically without clustering.
function pickMomDay(d: number): number {
  return Math.floor(rand(Math.floor(d / 7) * 13.7) * 7);
}
