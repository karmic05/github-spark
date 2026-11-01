import {
  clamp01,
  clampValence,
  flatVector,
  labelFromScore,
  type EmotionAxis,
  type EntryAnalysis,
} from "./emotions";

// Offline fallback used only when the language model is unavailable. It is a
// deliberately simple keyword read - good enough that a clearly happy entry
// never scores as a clearly sad one, but nothing like the model's nuance.

const LEXICON: Record<EmotionAxis, string[]> = {
  joy: ["happy", "joy", "great", "wonderful", "amazing", "fun", "laugh", "love", "excited", "delighted", "fantastic", "celebrat", "light"],
  calm: ["calm", "peace", "relax", "quiet", "slow", "gentle", "rested", "still", "content", "easy", "steady"],
  hope: ["hope", "looking forward", "optimis", "better", "future", "excited", "progress", "possib", "new beginning", "proud"],
  gratitude: ["grateful", "thank", "appreciat", "blessed", "lucky", "kind", "generous"],
  sadness: ["sad", "cry", "cried", "tears", "down", "empty", "grief", "heavy", "miss ", "lost", "hopeless", "depress", "flat", "numb"],
  anxiety: ["anxious", "anxiety", "worry", "worried", "nervous", "stress", "panic", "dread", "overwhelm", "afraid", "scared", "can't sleep", "barely slept", "deadline"],
  anger: ["angry", "furious", "annoyed", "frustrat", "mad ", "hate", "resent", "irritat", "rage", "unfair"],
  loneliness: ["lonely", "alone", "isolated", "nobody", "no one", "left out", "ignored", "unseen"],
};

const POSITIVE: EmotionAxis[] = ["joy", "calm", "hope", "gratitude"];
const NEGATIVE: EmotionAxis[] = ["sadness", "anxiety", "anger", "loneliness"];

function countHits(text: string, words: string[]): number {
  let n = 0;
  for (const w of words) {
    let i = text.indexOf(w);
    while (i !== -1) {
      n++;
      i = text.indexOf(w, i + w.length);
    }
  }
  return n;
}

export function heuristicAnalysis(rawText: string): EntryAnalysis {
  const text = ` ${rawText.toLowerCase()} `;
  const emotions = flatVector();
  const baseline = 0.12;
  for (const axis of Object.keys(LEXICON) as EmotionAxis[]) {
    const hits = countHits(text, LEXICON[axis]);
    emotions[axis] = clamp01(baseline + hits * 0.28);
  }
  const pos = POSITIVE.reduce((s, a) => s + emotions[a], 0);
  const neg = NEGATIVE.reduce((s, a) => s + emotions[a], 0);
  const score = clampValence((pos - neg) / Math.max(1.2, pos + neg));
  const dominant = (Object.keys(emotions) as EmotionAxis[]).sort(
    (a, b) => emotions[b] - emotions[a],
  )[0];

  const names = Array.from(rawText.matchAll(/\b(?:with|met|called|saw|from|and)\s+([A-Z][a-z]{2,})\b/g))
    .map((m) => m[1])
    .filter((n, i, a) => a.indexOf(n) === i)
    .slice(0, 3);

  return {
    sentiment_score: Number(score.toFixed(2)),
    sentiment_label: labelFromScore(score),
    dominant_emotion: dominant,
    emotions,
    themes: [],
    people: names,
    reflection:
      score > 0.2
        ? "There's real lightness in how you wrote today. Noted, and held."
        : score < -0.2
          ? "That sounds like a heavy one. Thank you for putting it into words."
          : "A steady day, set down. Thank you for putting today into words.",
  };
}
