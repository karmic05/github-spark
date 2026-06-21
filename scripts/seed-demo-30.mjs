// Seed ~30 days of demo journal entries into live HydraDB for the pitch.
// Writes under sub_tenant_id = <arg or "demo"> using the SAME encoding the app
// reads: source_id `entry_<sub>_<date>`, text + "\n@@meta@@"+JSON sidecar, and
// the five metadata fields. Run: node scripts/seed-demo-30.mjs [subTenant]
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = process.env.HYDRA_DB_BASE_URL || "https://api.hydradb.com";
const KEY = process.env.HYDRA_DB_API_KEY;
const TENANT = process.env.HYDRA_DB_TENANT_ID || "throughline";
const SUB = (process.argv[2] || "demo").toLowerCase();
const SPAN = 30;
const TAG = "\n@@meta@@";

if (!KEY) {
  console.error("HYDRA_DB_API_KEY missing (.env)");
  process.exit(1);
}

const AXES = ["joy", "calm", "hope", "gratitude", "sadness", "anxiety", "anger", "loneliness"];
const DOMINANT = { joy: "glad", calm: "calm", hope: "hopeful", gratitude: "grateful", sadness: "flat", anxiety: "anxious", anger: "frustrated", loneliness: "lonely" };

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const clampV = (n) => Math.max(-1, Math.min(1, n));
function rand(seed) { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
function pick(seed, arr) { return arr[Math.floor(rand(seed) * arr.length) % arr.length]; }
function chance(seed, p) { return rand(seed) < p; }
function labelFromScore(s) { return s <= -0.6 ? "very_low" : s <= -0.2 ? "low" : s < 0.2 ? "neutral" : s < 0.6 ? "good" : "great"; }

function dateMinus(daysBack) {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  return new Date(base - daysBack * 86_400_000).toISOString().slice(0, 10);
}

// 30-day arc: settle in -> presentation dread (~d10) -> low/sleep stretch
// (d13-18) -> recovery -> warm reconciliation, ending hopeful.
const CONTROL = [
  [0, -0.2], [6, -0.05], [10, -0.45], [12, 0.08],
  [15, -0.55], [18, -0.25], [22, 0.18], [25, 0.38], [29, 0.6],
];
function baseValence(d) {
  let lo = CONTROL[0], hi = CONTROL[CONTROL.length - 1];
  for (let i = 0; i < CONTROL.length - 1; i++) {
    if (d >= CONTROL[i][0] && d <= CONTROL[i + 1][0]) { lo = CONTROL[i]; hi = CONTROL[i + 1]; break; }
  }
  const span = hi[0] - lo[0] || 1;
  return lo[1] + (hi[1] - lo[1]) * ((d - lo[0]) / span);
}
function phaseOf(d) {
  if (d < 7) return "newjob";
  if (d < 13) return "presentation";
  if (d < 19) return "low";
  if (d < 25) return "recovery";
  return "reconcile";
}

const RUN_LINES = [
  "Got out for a run before work and the morning felt wide open.",
  "A slow few miles at dawn. I always feel most like myself out there.",
  "Ran the river loop. Dana met me at the bridge and we talked the whole way.",
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
  "Another bad night of sleep. I'm running on fumes and it shows.",
  "Woke at 4 and never got back down. The day was a fog after that.",
];
const PHRASES = {
  newjob: [
    "Settling into the new job. I keep waiting to be found out.",
    "Priya walked me through the codebase today. She's patient, which helps.",
    "New commute, new faces. Quietly overwhelmed but okay.",
    "Shipped a small fix today. A little proof I belong here.",
    "Trying to remember everyone's name at work and mostly failing.",
  ],
  presentation: [
    "The team presentation is coming and I'm already dreading it.",
    "Priya asked me to present the migration plan. My stomach dropped.",
    "Rehearsed the talk in the shower, in the car, at my desk. Still nervous.",
    "Imposter feeling is loud this week. Everyone seems to know more than me.",
    "Gave the presentation. It wasn't a disaster — Priya said it was clear.",
    "Relief after the talk. I'd built it into a monster and it was just a meeting.",
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
    "Coffee with Dana after work. I needed the company.",
  ],
  reconcile: [
    "Mom and I really talked tonight. Years of static, then just — quiet.",
    "Led the standup today and it felt natural. When did that happen?",
    "Long run, then a warm call with Mom. A good, full day.",
    "Priya put me on the new project. I think she actually trusts me now.",
    "Grateful in a plain, unspectacular way today. I'll take it.",
  ],
};

function buildEmotions(d, v, phase, f) {
  const pos = (clampV(v) + 1) / 2, neg = 1 - pos;
  const e = {
    joy: 0.12 + 0.55 * pos, calm: 0.18 + 0.45 * pos, hope: 0.18 + 0.5 * pos, gratitude: 0.12 + 0.42 * pos,
    sadness: 0.08 + 0.58 * neg, anxiety: 0.12 + 0.5 * neg, anger: 0.04 + 0.22 * neg, loneliness: 0.08 + 0.46 * neg,
  };
  if (f.run) { e.calm += 0.28; e.joy += 0.22; }
  if (f.sleep) { e.calm -= 0.15; e.anxiety += 0.18; e.sadness += 0.12; }
  if (phase === "low") { e.sadness += 0.26; e.anxiety += 0.2; e.loneliness += 0.26; e.joy -= 0.12; e.calm -= 0.12; }
  if (phase === "presentation") e.anxiety += 0.26;
  if (phase === "reconcile") { e.hope += 0.2; e.gratitude += 0.22; }
  if (f.mom === "warm") e.gratitude += 0.18;
  if (f.mom === "tense") { e.anger += 0.18; e.loneliness += 0.12; }
  if (f.dana) e.loneliness -= 0.2;
  AXES.forEach((a, i) => { e[a] = Number(clamp01(e[a] + (rand(d * 9.7 + i) - 0.5) * 0.08).toFixed(3)); });
  return e;
}
function dominantOf(e) {
  let best = "calm", bv = -1;
  for (const a of AXES) if (e[a] > bv) { bv = e[a]; best = a; }
  return DOMINANT[best];
}

function generate() {
  const out = [];
  for (let d = 0; d < SPAN; d++) {
    if (d !== SPAN - 1 && chance(d * 5.7, 0.1)) continue; // ~10% gaps, keep today
    const phase = phaseOf(d);
    const inDeepLow = d >= 14 && d <= 17;
    const isRun = !inDeepLow && chance(d * 3.1, phase === "recovery" || phase === "reconcile" ? 0.55 : 0.32);
    const dana = isRun && chance(d * 4.4, 0.55);
    const sleep = phase === "low" && chance(d * 2.2, 0.7);
    let mom = null;
    if (d % 6 === Math.floor(rand(Math.floor(d / 6) * 13.7) * 6)) {
      mom = phase === "low" ? "tense" : phase === "reconcile" ? "warm" : chance(d, 0.5) ? "warm" : "tense";
    }
    let v = baseValence(d) + (rand(d * 1.7) - 0.5) * 0.12;
    if (isRun) v += 0.15;
    if (sleep) v -= 0.12;
    if (mom === "warm") v += 0.08;
    if (mom === "tense") v -= 0.1;
    v = clampV(v);

    const emotions = buildEmotions(d, v, phase, { run: isRun, mom, sleep, dana });
    const parts = [pick(d * 1.3, PHRASES[phase])];
    if (sleep) parts.push(pick(d * 2.9, SLEEP_LINES));
    if (isRun) parts.push(pick(d * 3.7, dana ? RUN_LINES.slice(2) : RUN_LINES));
    if (mom === "warm") parts.push(pick(d * 5.1, MOM_WARM));
    if (mom === "tense") parts.push(pick(d * 5.1, MOM_TENSE));
    const text = [parts[0], ...parts.slice(1, 3)].join(" ");
    const score = Number(v.toFixed(2));
    out.push({
      date: dateMinus(SPAN - 1 - d),
      text,
      sentiment_score: score,
      sentiment_label: labelFromScore(score),
      dominant_emotion: dominantOf(emotions),
      emotions,
    });
  }
  return out;
}

function encode(text, a) {
  return `${text}${TAG}${JSON.stringify({ s: a.sentiment_score, l: a.sentiment_label, d: a.dominant_emotion, e: a.emotions, t: [], p: [] })}`;
}

async function call(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
}

async function main() {
  const entries = generate();
  console.log(`Seeding ${entries.length} entries for sub_tenant "${SUB}" into tenant "${TENANT}"`);
  console.log(`Range: ${entries[0].date} … ${entries[entries.length - 1].date}`);

  const BATCH = 15;
  let written = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const res = await call("/memories/add_memory", {
      tenant_id: TENANT,
      sub_tenant_id: SUB,
      memories: slice.map((e) => ({
        source_id: `entry_${SUB}_${e.date}`,
        text: encode(e.text, e),
        infer: false,
        metadata: {
          entry_date: e.date,
          sentiment_label: e.sentiment_label,
          sentiment_score: String(e.sentiment_score),
          dominant_emotion: e.dominant_emotion,
          emotions_json: JSON.stringify(e.emotions),
        },
      })),
    });
    if (res.status !== 200) {
      console.error("add_memory failed:", res.status, JSON.stringify(res.j).slice(0, 200));
      process.exit(1);
    }
    written += slice.length;
    process.stdout.write(`\rwritten ${written}/${entries.length}   `);
  }
  console.log("\nWaiting for ingestion…");
  for (let i = 0; i < 24; i++) {
    const l = await call("/list/data", { tenant_id: TENANT, sub_tenant_id: SUB, kind: "memories", page: 1, page_size: 100 });
    const n = l.j?.total ?? 0;
    process.stdout.write(`\ringest poll ${i}: ${n}/${written}   `);
    if (n >= written) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log(`\n✓ Done. Open the app and onboard as "${SUB}" to see it.`);
}

main();
